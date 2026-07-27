import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { getLeaderboard, getLevelsConfig } from "#services/levels.js";
import { createCard, replyCard, replyError } from "#utils/respond.js";

registerStrings("leaderboard", {
  en: {
    title: "Leaderboard",
    leveling_disabled: "Leveling is off in this server. An admin can turn it on with `/levelconfig toggle`.",
    empty_first_page: "Nobody has XP yet. Start chatting!",
    empty_page: "This page is empty.",
    row_line: "{badge} <@{user_id}> — level **{level}**, {xp} XP",
    board_title: "{guild} Leaderboard",
    footer: "Page {page}/{total_pages} · {total} members ranked",
    page_gone: "That page no longer exists.",
  },
  id: {
    title: "Leaderboard",
    leveling_disabled: "Leveling sedang mati di server ini. Admin bisa menyalakannya dengan `/levelconfig toggle`.",
    empty_first_page: "Belum ada yang punya XP. Ayo mulai ngobrol!",
    empty_page: "Halaman ini kosong.",
    row_line: "{badge} <@{user_id}> — level **{level}**, {xp} XP",
    board_title: "Leaderboard {guild}",
    footer: "Halaman {page}/{total_pages} · {total} member masuk peringkat",
    page_gone: "Halaman itu sudah tidak ada.",
  },
});

const numberFormatter = new Intl.NumberFormat("en-US");
const PAGE_SIZE = 10;
const PAGE_PREFIX = "lb:";

const MEDALS = ["🥇", "🥈", "🥉"];

// Builds the card + prev/next buttons for a page, or null when the page is
// empty (beyond the last page).
async function buildBoardPayload(t, guild, page) {
  const { rows, total } = await getLeaderboard(guild.id, { page, pageSize: PAGE_SIZE });
  if (rows.length === 0 && page !== 1) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startRank = (page - 1) * PAGE_SIZE;
  const lines = rows.map((row, index) => {
    const rank = startRank + index + 1;
    const badge = MEDALS[rank - 1] ?? `**#${rank}**`;
    return t("leaderboard.row_line", {
      badge,
      user_id: row.userId,
      level: row.level,
      xp: numberFormatter.format(row.xp),
    });
  });

  const card = createCard({
    color: 0x5865f2,
    title: t("leaderboard.board_title", { guild: guild.name }),
    body: rows.length > 0 ? lines.join("\n") : t("leaderboard.empty_first_page"),
    footer: t("leaderboard.footer", {
      page,
      total_pages: totalPages,
      total: numberFormatter.format(total),
    }),
  });

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PAGE_PREFIX}${page - 1}`)
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${PAGE_PREFIX}${page + 1}`)
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  );

  return { components: [card, controls] };
}

export default {
  category: "levels",
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
  async onComponent({ interaction, t }) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith(PAGE_PREFIX)) return false;

    const guild = interaction.guild;
    const page = Number(interaction.customId.slice(PAGE_PREFIX.length));
    if (!guild || !Number.isInteger(page) || page < 1) return false;

    const payload = await buildBoardPayload(t, guild, page);
    if (!payload) {
      await replyError(interaction, t("leaderboard.page_gone"));
      return true;
    }

    await interaction.update({ ...payload, allowedMentions: { parse: [] } });
    return true;
  },
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
    const payload = await buildBoardPayload(ctx.t, guild, page);

    if (!payload) {
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: ctx.t("leaderboard.title"),
          body: ctx.t("leaderboard.empty_page"),
        }),
        { ephemeral: true },
      );
      return;
    }

    await interaction.reply({
      ...payload,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  },
};
