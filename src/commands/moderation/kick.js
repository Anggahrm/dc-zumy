import { SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";

function normalizeReason(reason) {
  return reason?.trim() || "No reason provided.";
}

export default {
  category: "moderation",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    admin: true,
  },
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user from this server")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("User to kick")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for this kick")
        .setRequired(false),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for kick command.");
    }

    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"));
    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actorMember) {
      throw new Error("Failed to resolve invoking member.");
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);

    if (!targetMember) {
      const card = createCard({
        color: 0xed4245,
        title: "Moderation",
        body: "I can only kick users who are currently in this server.",
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (target.id === interaction.user.id) {
      const card = createCard({
        color: 0xed4245,
        title: "Moderation",
        body: "You cannot kick yourself.",
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (target.id === guild.ownerId) {
      const card = createCard({
        color: 0xed4245,
        title: "Moderation",
        body: "You cannot kick the server owner.",
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (targetMember.roles.highest.position >= actorMember.roles.highest.position) {
      const card = createCard({
        color: 0xed4245,
        title: "Moderation",
        body: "You cannot kick a member with an equal or higher role than yours.",
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (!targetMember.kickable) {
      const card = createCard({
        color: 0xed4245,
        title: "Moderation",
        body: "I cannot kick that user due to role hierarchy or missing permissions.",
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    try {
      await targetMember.kick(reason);
    } catch {
      const card = createCard({
        color: 0xed4245,
        title: "Moderation",
        body: "Kick failed. Please check role hierarchy and bot permissions.",
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    const card = createCard({
      color: 0xf1c40f,
      title: "Moderation",
      body: [
        "**Kick Complete**",
        `- Target: **${target.tag}** (\`${target.id}\`)`,
        `- Moderator: **${interaction.user.tag}**`,
        `- Reason: ${reason}`,
      ].join("\n"),
    });

    await replyCard(interaction, card, { ephemeral: true });
  },
};
