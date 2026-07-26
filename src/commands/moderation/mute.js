import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { getModConfig } from "#services/mod-config.js";
import { unmuteJobKey } from "#services/scheduler-jobs.js";
import { checkActorHierarchy, dmModerationNotice, normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration, parseDuration } from "#utils/time.js";

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Moderation", body });
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ModerateMembers],
  },
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute a member with the mute role (no 28-day limit)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("Member to mute").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration, e.g. 2h, 7d, 90d (empty = until unmuted)")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for mute command.");
    }

    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"));
    const durationRaw = interaction.options.getString("duration");
    const durationMs = durationRaw ? parseDuration(durationRaw) : null;

    if (durationRaw && !durationMs) {
      await replyCard(
        interaction,
        errorCard("Invalid duration. Use formats like `30m`, `2h`, `7d` or leave it empty for indefinite."),
        { ephemeral: true },
      );
      return;
    }

    const { muteRoleId } = await getModConfig(guild.id);
    const muteRole = muteRoleId ? guild.roles.cache.get(muteRoleId) : null;
    if (!muteRole) {
      await replyCard(
        interaction,
        errorCard("No mute role configured. Run `/muterole create` (or `/muterole set`) first."),
        { ephemeral: true },
      );
      return;
    }

    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actorMember) {
      throw new Error("Failed to resolve invoking member.");
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      await replyCard(interaction, errorCard("I can only mute members of this server."), { ephemeral: true });
      return;
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

    if (targetMember.roles.cache.has(muteRole.id)) {
      await replyCard(interaction, errorCard(`**${target.tag}** is already muted.`), { ephemeral: true });
      return;
    }

    try {
      await targetMember.roles.add(muteRole, `Muted by ${interaction.user.tag}: ${reason}`);
    } catch {
      await replyCard(
        interaction,
        errorCard("Mute failed. Check that my role is above the mute role and I have Manage Roles."),
        { ephemeral: true },
      );
      return;
    }

    const scheduler = interaction.client.zumy?.scheduler;
    const durationLabel = durationMs ? formatDuration(durationMs / 1000) : null;
    if (durationMs && scheduler) {
      await scheduler.schedule({
        type: "unmute",
        runAt: new Date(Date.now() + durationMs),
        guildId: guild.id,
        payload: { userId: target.id },
        dedupeKey: unmuteJobKey(guild.id, target.id),
      });
    }

    const caseRow = await recordCase({
      guild,
      type: "mute",
      target,
      moderator: interaction.user,
      reason,
      metadata: durationLabel ? { duration: durationLabel } : {},
    });

    await dmModerationNotice(target, {
      guildName: guild.name,
      actionLabel: "Mute",
      reason,
      lines: durationLabel ? [`- Duration: ${durationLabel}`] : ["- Duration: until unmuted"],
    });

    const until = durationMs ? Math.floor((Date.now() + durationMs) / 1000) : null;
    await replyCard(
      interaction,
      createCard({
        color: 0xf1c40f,
        title: "Moderation",
        body: [
          `**Mute Applied**${caseRow ? ` — Case #${caseRow.caseNumber}` : ""}`,
          `- Target: **${target.tag}** (\`${target.id}\`)`,
          `- Moderator: **${interaction.user.tag}**`,
          until ? `- Until: <t:${until}:F> (<t:${until}:R>)` : "- Duration: until unmuted",
          `- Reason: ${reason}`,
        ].join("\n"),
      }),
    );
  },
};
