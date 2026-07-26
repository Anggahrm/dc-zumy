import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { getLeaderboard, getLevelsConfig } from "#services/levels.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("leaderboard", {
  en: {
    title: "Leaderboard",
    leveling_disabled: "Leveling is disabled here. An admin can enable it with `/levelconfig toggle`.",
    empty_first_page: "Nobody has XP yet. Start chatting!",
    empty_page: "This page is empty.",
    row_line: "{badge} <@{user_id}> — level **{level}**, {xp} XP",
    board_title: "{guild} Leaderboard",
    footer: "Page {page}/{total_pages} · {total} ranked member(s)",
  },
  id: {
    title: "Leaderboard",
    leveling_disabled: "Leveling dimatikan di sini. Admin bisa menyalakannya lagi dengan `/levelconfig toggle`.",
    empty_first_page: "Belum ada yang punya XP. Ayo mulai ngobrol!",
    empty_page: "Halaman ini kosong.",
    row_line: "{badge} <@{user_id}> — level **{level}**, {xp} XP",
    board_title: "Leaderboard {guild}",
    footer: "Halaman {page}/{total_pages} · {total} member masuk peringkat",
  },
});

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
  async execute({ interaction, ctx }) {
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
          title: ctx.t("leaderboard.title"),
          body: ctx.t("leaderboard.leveling_disabled"),
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
          title: ctx.t("leaderboard.title"),
          body: page === 1 ? ctx.t("leaderboard.empty_first_page") : ctx.t("leaderboard.empty_page"),
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
      return ctx.t("leaderboard.row_line", {
        badge,
        user_id: row.userId,
        level: row.level,
        xp: numberFormatter.format(row.xp),
      });
    });

    await replyCard(
      interaction,
      createCard({
        color: 0x5865f2,
        title: ctx.t("leaderboard.board_title", { guild: guild.name }),
        body: lines.join("\n"),
        footer: ctx.t("leaderboard.footer", {
          page,
          total_pages: totalPages,
          total: numberFormatter.format(total),
        }),
      }),
    );
  },
};
