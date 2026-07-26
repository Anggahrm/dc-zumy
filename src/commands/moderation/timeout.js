import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { checkActorHierarchy, normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";
import { parseDuration } from "#utils/time.js";

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

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
    .setName("timeout")
    .setDescription("Time out a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("Member to time out").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration, e.g. 10m, 2h, 1d (bare number = minutes, max 28d)")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason for the timeout").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for timeout command.");
    }

    const target = interaction.options.getUser("target", true);
    const durationMs = parseDuration(interaction.options.getString("duration", true));
    const reason = normalizeReason(interaction.options.getString("reason"));

    if (!durationMs) {
      await replyCard(
        interaction,
        errorCard("Invalid duration. Use formats like `30s`, `10m`, `2h`, `1d` or a bare number of minutes."),
        { ephemeral: true },
      );
      return;
    }

    if (durationMs > MAX_TIMEOUT_MS) {
      await replyCard(interaction, errorCard("Timeout duration cannot exceed **28 days**."), { ephemeral: true });
      return;
    }

    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actorMember) {
      throw new Error("Failed to resolve invoking member.");
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      await replyCard(interaction, errorCard("I can only time out members of this server."), { ephemeral: true });
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

    if (!targetMember.moderatable) {
      await replyCard(
        interaction,
        errorCard("I cannot time out that user due to role hierarchy or missing permissions."),
        { ephemeral: true },
      );
      return;
    }

    try {
      await targetMember.timeout(durationMs, reason);
    } catch {
      await replyCard(
        interaction,
        errorCard("Timeout failed. Please check role hierarchy and bot permissions."),
        { ephemeral: true },
      );
      return;
    }

    const until = Math.floor((Date.now() + durationMs) / 1000);
    await replyCard(
      interaction,
      createCard({
        color: 0xf1c40f,
        title: "Moderation",
        body: [
          "**Timeout Applied**",
          `- Target: **${target.tag}** (\`${target.id}\`)`,
          `- Moderator: **${interaction.user.tag}**`,
          `- Until: <t:${until}:F> (<t:${until}:R>)`,
          `- Reason: ${reason}`,
        ].join("\n"),
      }),
    );
  },
};
