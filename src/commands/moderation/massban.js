import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { registerStrings } from "#services/i18n.js";
import { normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("massban", {
  en: {
    title: "Massban",
    invalid_ids: "These don't look like user IDs: {ids}",
    count_range: "Provide between 1 and {max} user IDs per run.",
    skip_protected: "protected",
    skip_hierarchy: "hierarchy",
    skip_not_bannable: "not bannable",
    skip_api_error: "api error",
    case_suffix: " — Case #{caseNumber}",
    complete_title: "**Massban Complete**{caseSuffix}",
    banned_line: "- Banned: **{banned}**/{total}",
    ids_line: "- IDs: {ids}",
    skipped_line: "- Skipped: {skipped}",
    reason_line: "- Reason: {reason}",
  },
  id: {
    title: "Massban",
    invalid_ids: "Ini kayaknya bukan user ID deh: {ids}",
    count_range: "Masukkan 1 sampai {max} user ID per sekali jalan ya.",
    skip_protected: "dilindungi",
    skip_hierarchy: "hierarki role",
    skip_not_bannable: "tidak bisa di-ban",
    skip_api_error: "error API",
    case_suffix: " — Case #{caseNumber}",
    complete_title: "**Massban Selesai**{caseSuffix}",
    banned_line: "- Di-ban: **{banned}**/{total}",
    ids_line: "- ID: {ids}",
    skipped_line: "- Dilewati: {skipped}",
    reason_line: "- Alasan: {reason}",
  },
});

const MAX_MASSBAN = 20;
const ID_PATTERN = /^\d{5,30}$/;

export default {
  category: "moderation",
  cooldown: 30,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.BanMembers, PermissionFlagsBits.Administrator],
  },
  data: new SlashCommandBuilder()
    .setName("massban")
    .setDescription("Ban multiple user IDs at once (raid cleanup)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("ids")
        .setDescription(`User IDs separated by spaces or commas (max ${MAX_MASSBAN})`)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason applied to every ban").setMaxLength(400).setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName("days")
        .setDescription("Delete message history (0-7 days)")
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for massban command.");
    }

    const t = ctx.t;
    const reason = normalizeReason(interaction.options.getString("reason"));
    const days = interaction.options.getInteger("days") ?? 0;
    const rawIds = interaction.options.getString("ids", true)
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter(Boolean);

    const ids = [...new Set(rawIds)];
    const invalid = ids.filter((id) => !ID_PATTERN.test(id));

    if (invalid.length > 0) {
      await replyCard(
        interaction,
        createCard({
          color: 0xed4245,
          title: t("massban.title"),
          body: t("massban.invalid_ids", {
            ids: invalid.slice(0, 5).map((id) => `\`${id.slice(0, 25)}\``).join(", "),
          }),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (ids.length === 0 || ids.length > MAX_MASSBAN) {
      await replyCard(
        interaction,
        createCard({
          color: 0xed4245,
          title: t("massban.title"),
          body: t("massban.count_range", { max: MAX_MASSBAN }),
        }),
        { ephemeral: true },
      );
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    const banned = [];
    const skipped = [];

    for (const id of ids) {
      if (id === interaction.user.id || id === guild.ownerId || id === guild.client.user.id) {
        skipped.push({ id, why: t("massban.skip_protected") });
        continue;
      }

      const member = await guild.members.fetch(id).catch(() => null);
      if (member) {
        if (
          actorMember
          && interaction.user.id !== guild.ownerId
          && member.roles.highest.position >= actorMember.roles.highest.position
        ) {
          skipped.push({ id, why: t("massban.skip_hierarchy") });
          continue;
        }
        if (!member.bannable) {
          skipped.push({ id, why: t("massban.skip_not_bannable") });
          continue;
        }
      }

      try {
        await guild.bans.create(id, {
          reason: `Massban by ${interaction.user.tag}: ${reason}`,
          deleteMessageSeconds: days * 24 * 60 * 60,
        });
        banned.push(id);
      } catch {
        skipped.push({ id, why: t("massban.skip_api_error") });
      }
    }

    let caseNumbers = "";
    if (banned.length > 0) {
      const first = await recordCase({
        guild,
        type: "ban",
        target: { id: banned[0], tag: null },
        moderator: interaction.user,
        reason: `${reason} (massban: ${banned.length} users)`,
        metadata: { massban: banned },
      });
      caseNumbers = first ? t("massban.case_suffix", { caseNumber: first.caseNumber }) : "";
    }

    await replyCard(
      interaction,
      createCard({
        color: banned.length > 0 ? 0xf1c40f : 0xed4245,
        title: t("massban.title"),
        body: [
          t("massban.complete_title", { caseSuffix: caseNumbers }),
          t("massban.banned_line", { banned: banned.length, total: ids.length }),
          ...(banned.length > 0 ? [t("massban.ids_line", { ids: banned.map((id) => `\`${id}\``).join(", ") })] : []),
          ...(skipped.length > 0
            ? [t("massban.skipped_line", { skipped: skipped.map((entry) => `\`${entry.id}\` (${entry.why})`).join(", ") })]
            : []),
          t("massban.reason_line", { reason }),
        ].join("\n"),
      }),
      { ephemeral: true },
    );
  },
};
