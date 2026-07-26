import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getLeaderboard, getLevelsConfig } from "#services/levels.js";
import { createCard, replyCard } from "#utils/respond.js";

const numberFormatter = new Intl.NumberFormat("en-US");
const PAGE_SIZE = 10;

const MEDALS = ["🥇", "🥈", "🥉"];

export default {
  category: "rpg",
  cooldown: 5,
  permissions: {
    guildOnly: true,
  },
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the server XP leaderboard")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((option) =>
      option.setName("page").setDescription("Page number").setMinValue(1).setMaxValue(100).setRequired(false),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for leaderboard command.");
    }

    const config = await getLevelsConfig(guild.id, { preferCache: true });
    if (!config.enabled) {
      await replyCard(
        interaction,
        createCard({
          color: 0xf1c40f,
          title: "Leaderboard",
          body: "Leveling is disabled here. An admin can enable it with `/levelconfig toggle`.",
        }),
        { ephemeral: true },
      );
      return;
    }

    const page = interaction.options.getInteger("page") ?? 1;
    const { rows, total } = await getLeaderboard(guild.id, { page, pageSize: PAGE_SIZE });

    if (rows.length === 0) {
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Leaderboard",
          body: page === 1 ? "Nobody has XP yet. Start chatting!" : "This page is empty.",
        }),
        { ephemeral: true },
      );
      return;
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const startRank = (page - 1) * PAGE_SIZE;
    const lines = rows.map((row, index) => {
      const rank = startRank + index + 1;
      const badge = MEDALS[rank - 1] ?? `**#${rank}**`;
      return `${badge} <@${row.userId}> — level **${row.level}**, ${numberFormatter.format(row.xp)} XP`;
    });

    await replyCard(
      interaction,
      createCard({
        color: 0x5865f2,
        title: `${guild.name} Leaderboard`,
        body: lines.join("\n"),
        footer: `Page ${page}/${totalPages} · ${numberFormatter.format(total)} ranked member(s)`,
      }),
    );
  },
};
