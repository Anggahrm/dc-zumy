import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import {
  getModConfig,
  saveQuarantineSnapshot,
  setQuarantineRole,
  takeQuarantineSnapshot,
} from "#services/mod-config.js";
import { checkActorHierarchy, dmModerationNotice, normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Quarantine", body });
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
    .setDescription("Isolate a member: strip roles, apply quarantine role, restore later")
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

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "role") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await replyCard(interaction, errorCard("You need **Manage Server** to change the quarantine role."), { ephemeral: true });
        return;
      }

      const role = interaction.options.getRole("role", true);
      const me = guild.members.me;
      if (role.id === guild.id || role.managed || (me && role.position >= me.roles.highest.position)) {
        await replyCard(interaction, errorCard("That role can't be used (managed, @everyone, or above my highest role)."), {
          ephemeral: true,
        });
        return;
      }

      await setQuarantineRole(guildId, role.id);
      await replyCard(
        interaction,
        createCard({
          color: 0x57f287,
          title: "Quarantine",
          body: [
            `Quarantine role set to <@&${role.id}>.`,
            "-# Tip: configure this role's channel overwrites so quarantined members only see your appeal channel.",
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
      await replyCard(interaction, errorCard("No quarantine role configured. Run `/quarantine role` first."), {
        ephemeral: true,
      });
      return;
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      await replyCard(interaction, errorCard("That user is not in this server."), { ephemeral: true });
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
        await replyCard(interaction, errorCard(rejection), { ephemeral: true });
        return;
      }

      if (targetMember.roles.cache.has(quarantineRole.id)) {
        await replyCard(interaction, errorCard(`**${target.tag}** is already quarantined.`), { ephemeral: true });
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
          errorCard("Failed to update roles. Check my role position and permissions."),
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
        actionLabel: "Quarantine",
        color: 0xed4245,
        reason,
      });

      await replyCard(
        interaction,
        createCard({
          color: 0xf1c40f,
          title: "Quarantine",
          body: [
            `**Member Quarantined**${caseRow ? ` — Case #${caseRow.caseNumber}` : ""}`,
            `- Target: **${target.tag}** (\`${target.id}\`)`,
            `- Stored roles for restore: **${previousRoles.length}**`,
            `- Reason: ${reason}`,
          ].join("\n"),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      if (!targetMember.roles.cache.has(quarantineRole.id)) {
        await replyCard(interaction, errorCard(`**${target.tag}** is not quarantined.`), { ephemeral: true });
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
          errorCard("Failed to restore roles. Check my role position and permissions, then retry."),
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
          title: "Quarantine",
          body: [
            `**Member Released**${caseRow ? ` — Case #${caseRow.caseNumber}` : ""}`,
            `- Target: **${target.tag}** (\`${target.id}\`)`,
            `- Roles restored: **${restorable.length}**${snapshot.length !== restorable.length ? ` (of ${snapshot.length} stored)` : ""}`,
          ].join("\n"),
        }),
        { ephemeral: true },
      );
    }
  },
};
