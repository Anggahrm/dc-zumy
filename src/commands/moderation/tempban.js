import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { unbanJobKey } from "#services/scheduler-jobs.js";
import { checkActorHierarchy, dmModerationNotice, normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration, parseDuration } from "#utils/time.js";

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Moderation", body });
}

export default {
  category: "moderation",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.BanMembers],
  },
  data: new SlashCommandBuilder()
    .setName("tempban")
    .setDescription("Ban a user temporarily (auto-unban when it expires)")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("User to ban").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Ban duration, e.g. 1d, 7d, 4w")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("days")
        .setDescription("Delete message history (0-7 days)")
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for tempban command.");
    }

    const scheduler = interaction.client.zumy?.scheduler;
    if (!scheduler) {
      throw new Error("Scheduler is not available.");
    }

    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"));
    const durationMs = parseDuration(interaction.options.getString("duration", true));
    const days = Math.min(Math.max(interaction.options.getInteger("days") ?? 0, 0), 7);

    if (!durationMs) {
      await replyCard(
        interaction,
        errorCard("Invalid duration. Use formats like `12h`, `1d`, `7d`, `4w`."),
        { ephemeral: true },
      );
      return;
    }

    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actorMember) {
      throw new Error("Failed to resolve invoking member.");
    }

    if (target.id === interaction.user.id || target.id === guild.ownerId) {
      await replyCard(interaction, errorCard("You cannot tempban yourself or the server owner."), { ephemeral: true });
      return;
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
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

    if (targetMember && !targetMember.bannable) {
      await replyCard(
        interaction,
        errorCard("I cannot ban that user due to role hierarchy or missing permissions."),
        { ephemeral: true },
      );
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const durationLabel = formatDuration(durationMs / 1000);
    const until = Math.floor((Date.now() + durationMs) / 1000);

    if (targetMember) {
      await dmModerationNotice(target, {
        guildName: guild.name,
        actionLabel: "Temporary ban",
        color: 0xed4245,
        reason,
        lines: [`- Duration: ${durationLabel}`, `- Ends: <t:${until}:F>`],
      });
    }

    try {
      await guild.bans.create(target, {
        reason: `Tempban (${durationLabel}) by ${interaction.user.tag}: ${reason}`,
        deleteMessageSeconds: days * 24 * 60 * 60,
      });
    } catch {
      await replyCard(interaction, errorCard("Ban failed. Please check role hierarchy and bot permissions."), {
        ephemeral: true,
      });
      return;
    }

    const caseRow = await recordCase({
      guild,
      type: "tempban",
      target,
      moderator: interaction.user,
      reason,
      metadata: { duration: durationLabel },
    });

    await scheduler.schedule({
      type: "unban",
      runAt: new Date(Date.now() + durationMs),
      guildId: guild.id,
      payload: { userId: target.id, caseNumber: caseRow?.caseNumber ?? null },
      dedupeKey: unbanJobKey(guild.id, target.id),
    });

    await replyCard(
      interaction,
      createCard({
        color: 0xf1c40f,
        title: "Moderation",
        body: [
          `**Tempban Applied**${caseRow ? ` — Case #${caseRow.caseNumber}` : ""}`,
          `- Target: **${target.tag}** (\`${target.id}\`)`,
          `- Moderator: **${interaction.user.tag}**`,
          `- Duration: **${durationLabel}** (unban <t:${until}:R>)`,
          `- Delete messages: **${days}** day(s)`,
          `- Reason: ${reason}`,
        ].join("\n"),
      }),
      { ephemeral: true },
    );
  },
};
