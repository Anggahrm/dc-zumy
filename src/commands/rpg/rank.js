import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { getLevelsConfig, getMemberRank } from "#services/levels.js";
import { levelProgress } from "#utils/level.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("rank", {
  en: {
    title: "Rank",
    leveling_disabled: "Leveling is disabled here. An admin can enable it with `/levelconfig toggle`.",
    no_xp: "**{tag}** has no XP here yet. Time to start chatting!",
    line_member: "- Member: <@{user_id}>",
    line_rank: "- Rank: **#{rank}**",
    line_level: "- Level: **{level}**",
    line_xp: "- XP: **{xp}**",
    line_messages: "- Messages counted: **{messages}**",
    progress_note: "-# {current}/{needed} XP to level {next_level}",
  },
  id: {
    title: "Rank",
    leveling_disabled: "Leveling dimatikan di sini. Admin bisa menyalakannya lagi dengan `/levelconfig toggle`.",
    no_xp: "**{tag}** belum punya XP di sini. Ayo mulai ngobrol!",
    line_member: "- Member: <@{user_id}>",
    line_rank: "- Rank: **#{rank}**",
    line_level: "- Level: **{level}**",
    line_xp: "- XP: **{xp}**",
    line_messages: "- Pesan terhitung: **{messages}**",
    progress_note: "-# {current}/{needed} XP menuju level {next_level}",
  },
});

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
  async execute({ interaction, ctx }) {
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
          title: ctx.t("rank.title"),
          body: ctx.t("rank.leveling_disabled"),
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
          title: ctx.t("rank.title"),
          body: ctx.t("rank.no_xp", { tag: target.tag }),
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
        title: ctx.t("rank.title"),
        body: [
          ctx.t("rank.line_member", { user_id: target.id }),
          ctx.t("rank.line_rank", { rank: rank.rank }),
          ctx.t("rank.line_level", { level: progress.level }),
          ctx.t("rank.line_xp", { xp: numberFormatter.format(rank.xp) }),
          ctx.t("rank.line_messages", { messages: numberFormatter.format(rank.messages) }),
          "",
          `${progressBar(progress.current, progress.needed)}`,
          ctx.t("rank.progress_note", {
            current: numberFormatter.format(progress.current),
            needed: numberFormatter.format(progress.needed),
            next_level: progress.level + 1,
          }),
        ].join("\n"),
      }),
    );
  },
};
