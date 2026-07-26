import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getLevelsConfig, getMemberRank } from "#services/levels.js";
import { levelProgress } from "#utils/level.js";
import { createCard, replyCard } from "#utils/respond.js";

const numberFormatter = new Intl.NumberFormat("en-US");

function progressBar(current, needed, width = 12) {
  const filled = needed > 0 ? Math.round((current / needed) * width) : width;
  return `${"▰".repeat(Math.min(filled, width))}${"▱".repeat(Math.max(width - filled, 0))}`;
}

export default {
  category: "rpg",
  cooldown: 3,
  permissions: {
    guildOnly: true,
  },
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show a member's level and server rank")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("Member to inspect").setRequired(false),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for rank command.");
    }

    const config = await getLevelsConfig(guild.id, { preferCache: true });
    if (!config.enabled) {
      await replyCard(
        interaction,
        createCard({
          color: 0xf1c40f,
          title: "Rank",
          body: "Leveling is disabled here. An admin can enable it with `/levelconfig toggle`.",
        }),
        { ephemeral: true },
      );
      return;
    }

    const target = interaction.options.getUser("target") ?? interaction.user;
    const rank = await getMemberRank(guild.id, target.id);

    if (!rank) {
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Rank",
          body: `**${target.tag}** has no XP here yet. Time to start chatting!`,
        }),
        { ephemeral: true },
      );
      return;
    }

    const progress = levelProgress(rank.xp);
    await replyCard(
      interaction,
      createCard({
        color: 0x5865f2,
        title: "Rank",
        body: [
          `- Member: <@${target.id}>`,
          `- Rank: **#${rank.rank}**`,
          `- Level: **${progress.level}**`,
          `- XP: **${numberFormatter.format(rank.xp)}**`,
          `- Messages counted: **${numberFormatter.format(rank.messages)}**`,
          "",
          `${progressBar(progress.current, progress.needed)}`,
          `-# ${numberFormatter.format(progress.current)}/${numberFormatter.format(progress.needed)} XP to level ${progress.level + 1}`,
        ].join("\n"),
      }),
    );
  },
};
