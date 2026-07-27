import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { registerStrings } from "#services/i18n.js";
import {
  getModConfig,
  saveQuarantineSnapshot,
  setQuarantineRole,
  takeQuarantineSnapshot,
} from "#services/mod-config.js";
import { checkActorHierarchy, dmModerationNotice, normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("quarantine", {
  en: {
    title: "Quarantine",
    need_manage_server: "You need **Manage Server** to change the quarantine role.",
    role_unusable: "That role can't be used (it's managed, @everyone, or above my highest role).",
    role_set: "Quarantine role set to <@&{roleId}>.",
    role_set_tip: "-# Tip: set this role's channel permissions so quarantined members only see your appeal channel.",
    no_role_configured: "No quarantine role set up yet. Run `/quarantine role` first.",
    not_in_server: "That user isn't in this server.",
    already_quarantined: "**{user}** is already quarantined.",
    update_roles_failed: "I couldn't update their roles. Check my role position and permissions.",
    dm_action_label: "Quarantine",
    case_suffix: " — Case #{caseNumber}",
    quarantined_title: "**Member Quarantined**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    stored_roles_line: "- Roles saved to restore later: **{count}**",
    reason_line: "- Reason: {reason}",
    not_quarantined: "**{user}** isn't quarantined.",
    restore_failed: "I couldn't restore their roles. Check my role position and permissions, then try again.",
    released_title: "**Member Released**{caseSuffix}",
    restored_roles_line: "- Roles restored: **{count}**{ofStored}",
    of_stored_suffix: " (of {total} stored)",
  },
  id: {
    title: "Karantina",
    need_manage_server: "Kamu butuh permission **Manage Server** untuk mengubah role karantina.",
    role_unusable: "Role itu tidak bisa dipakai (managed, @everyone, atau di atas role tertinggiku).",
    role_set: "Role karantina diatur ke <@&{roleId}>.",
    role_set_tip: "-# Tip: atur permission channel role ini supaya member yang dikarantina cuma bisa lihat channel appeal-mu.",
    no_role_configured: "Role karantina belum diatur. Jalankan `/quarantine role` dulu ya.",
    not_in_server: "User itu tidak ada di server ini.",
    already_quarantined: "**{user}** sudah dikarantina.",
    update_roles_failed: "Gagal memperbarui role. Cek posisi role dan permission-ku ya.",
    dm_action_label: "Karantina",
    case_suffix: " — Case #{caseNumber}",
    quarantined_title: "**Member Dikarantina**{caseSuffix}",
    target_line: "- Target: **{user}** (`{id}`)",
    stored_roles_line: "- Role disimpan untuk dipulihkan nanti: **{count}**",
    reason_line: "- Alasan: {reason}",
    not_quarantined: "**{user}** tidak sedang dikarantina.",
    restore_failed: "Gagal memulihkan role. Cek posisi role dan permission-ku, lalu coba lagi.",
    released_title: "**Member Dibebaskan**{caseSuffix}",
    restored_roles_line: "- Role dipulihkan: **{count}**{ofStored}",
    of_stored_suffix: " (dari {total} tersimpan)",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("quarantine.title"), body });
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ModerateMembers],
  },
  data: new SlashCommandBuilder()
    .setName("quarantine")
    .setDescription("Quarantine a member: remove their roles now, restore them later")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("role")
        .setDescription("Set the quarantine role")
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role given to quarantined members").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Quarantine a member")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member to quarantine").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("reason").setDescription("Reason").setMaxLength(400).setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Release a member and restore their roles")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member to release").setRequired(true),
        ),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for quarantine command.");
    }

    const t = ctx.t;
    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "role") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await replyCard(interaction, errorCard(t, t("quarantine.need_manage_server")), { ephemeral: true });
        return;
      }

      const role = interaction.options.getRole("role", true);
      const me = guild.members.me;
      if (role.id === guild.id || role.managed || (me && role.position >= me.roles.highest.position)) {
        await replyCard(interaction, errorCard(t, t("quarantine.role_unusable")), {
          ephemeral: true,
        });
        return;
      }

      await setQuarantineRole(guildId, role.id);
      await replyCard(
        interaction,
        createCard({
          color: 0x57f287,
          title: t("quarantine.title"),
          body: [
            t("quarantine.role_set", { roleId: role.id }),
            t("quarantine.role_set_tip"),
          ].join("\n"),
        }),
        { ephemeral: true },
      );
      return;
    }

    const target = interaction.options.getUser("target", true);
    const { quarantineRoleId } = await getModConfig(guildId);
    const quarantineRole = quarantineRoleId ? guild.roles.cache.get(quarantineRoleId) : null;
    if (!quarantineRole) {
      await replyCard(interaction, errorCard(t, t("quarantine.no_role_configured")), {
        ephemeral: true,
      });
      return;
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      await replyCard(interaction, errorCard(t, t("quarantine.not_in_server")), { ephemeral: true });
      return;
    }

    if (subcommand === "add") {
      const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!actorMember) {
        throw new Error("Failed to resolve invoking member.");
      }

      const rejection = checkActorHierarchy({
        guild,
        actorUserId: interaction.user.id,
        actorMember,
        targetUserId: target.id,
        targetMember,
      });
      if (rejection) {
        await replyCard(interaction, errorCard(t, rejection), { ephemeral: true });
        return;
      }

      if (targetMember.roles.cache.has(quarantineRole.id)) {
        await replyCard(interaction, errorCard(t, t("quarantine.already_quarantined", { user: target.tag })), { ephemeral: true });
        return;
      }

      const reason = normalizeReason(interaction.options.getString("reason"));
      const previousRoles = targetMember.roles.cache
        .filter((role) => role.id !== guild.id && !role.managed)
        .map((role) => role.id);
      const managedRoles = targetMember.roles.cache
        .filter((role) => role.managed)
        .map((role) => role.id);

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        await targetMember.roles.set(
          [quarantineRole.id, ...managedRoles],
          `Quarantined by ${interaction.user.tag}: ${reason}`,
        );
      } catch {
        await replyCard(
          interaction,
          errorCard(t, t("quarantine.update_roles_failed")),
          { ephemeral: true },
        );
        return;
      }

      await saveQuarantineSnapshot(guildId, target.id, previousRoles);

      const caseRow = await recordCase({
        guild,
        type: "quarantine",
        target,
        moderator: interaction.user,
        reason,
        metadata: { restoredRoleCount: previousRoles.length },
      });

      await dmModerationNotice(target, {
        guildName: guild.name,
        actionLabel: t("quarantine.dm_action_label"),
        color: 0xed4245,
        reason,
      });

      await replyCard(
        interaction,
        createCard({
          color: 0xf1c40f,
          title: t("quarantine.title"),
          body: [
            t("quarantine.quarantined_title", {
              caseSuffix: caseRow ? t("quarantine.case_suffix", { caseNumber: caseRow.caseNumber }) : "",
            }),
            t("quarantine.target_line", { user: target.tag, id: target.id }),
            t("quarantine.stored_roles_line", { count: previousRoles.length }),
            t("quarantine.reason_line", { reason }),
          ].join("\n"),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      if (!targetMember.roles.cache.has(quarantineRole.id)) {
        await replyCard(interaction, errorCard(t, t("quarantine.not_quarantined", { user: target.tag })), { ephemeral: true });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const snapshot = (await takeQuarantineSnapshot(guildId, target.id)) ?? [];
      const restorable = snapshot.filter((roleId) => {
        const role = guild.roles.cache.get(roleId);
        const me = guild.members.me;
        return role && !role.managed && me && role.position < me.roles.highest.position;
      });
      const managedRoles = targetMember.roles.cache
        .filter((role) => role.managed)
        .map((role) => role.id);

      try {
        await targetMember.roles.set(
          [...restorable, ...managedRoles],
          `Quarantine removed by ${interaction.user.tag}`,
        );
      } catch {
        // Put the snapshot back so a retry can still restore the roles.
        await saveQuarantineSnapshot(guildId, target.id, snapshot);
        await replyCard(
          interaction,
          errorCard(t, t("quarantine.restore_failed")),
          { ephemeral: true },
        );
        return;
      }

      const caseRow = await recordCase({
        guild,
        type: "unquarantine",
        target,
        moderator: interaction.user,
        reason: null,
        metadata: { restoredRoleCount: restorable.length },
      });

      await replyCard(
        interaction,
        createCard({
          color: 0x57f287,
          title: t("quarantine.title"),
          body: [
            t("quarantine.released_title", {
              caseSuffix: caseRow ? t("quarantine.case_suffix", { caseNumber: caseRow.caseNumber }) : "",
            }),
            t("quarantine.target_line", { user: target.tag, id: target.id }),
            t("quarantine.restored_roles_line", {
              count: restorable.length,
              ofStored: snapshot.length !== restorable.length
                ? t("quarantine.of_stored_suffix", { total: snapshot.length })
                : "",
            }),
          ].join("\n"),
        }),
        { ephemeral: true },
      );
    }
  },
};
