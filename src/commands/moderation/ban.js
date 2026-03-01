import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";

function normalizeReason(reason) {
  return reason?.trim() || "No reason provided.";
}

function clampDeleteMessageDays(days) {
  if (days == null) return 0;
  return Math.min(Math.max(days, 0), 7);
}

export default {
  category: "moderation",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    admin: true,
  },
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from this server")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("User to ban")
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
      option
        .setName("reason")
        .setDescription("Reason for this ban")
        .setRequired(false),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for ban command.");
    }

    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"));
    const days = clampDeleteMessageDays(interaction.options.getInteger("days"));
    const deleteMessageSeconds = days * 24 * 60 * 60;
    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);

    if (!actorMember) {
      throw new Error("Failed to resolve invoking member.");
    }

    if (target.id === interaction.user.id) {
      const card = createCard({
        color: 0xed4245,
        title: "Moderation",
        body: "You cannot ban yourself.",
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (target.id === guild.ownerId) {
      const card = createCard({
        color: 0xed4245,
        title: "Moderation",
        body: "You cannot ban the server owner.",
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (
      targetMember
      && interaction.user.id !== guild.ownerId
      && targetMember.roles.highest.position >= actorMember.roles.highest.position
    ) {
      const card = createCard({
        color: 0xed4245,
        title: "Moderation",
        body: "You cannot ban a member with an equal or higher role than yours.",
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    if (targetMember && !targetMember.bannable) {
      const card = createCard({
        color: 0xed4245,
        title: "Moderation",
        body: "I cannot ban that user due to role hierarchy or missing permissions.",
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });

    try {
      await guild.bans.create(target, {
        reason,
        deleteMessageSeconds,
      });
    } catch {
      const card = createCard({
        color: 0xed4245,
        title: "Moderation",
        body: "Ban failed. Please check role hierarchy and bot permissions.",
      });

      await interaction.editReply({
        components: [card],
      });
      return;
    }

    const card = createCard({
      color: 0xf1c40f,
      title: "Moderation",
      body: [
        "**Ban Complete**",
        `- Target: **${target.tag}** (\`${target.id}\`)`,
        `- Moderator: **${interaction.user.tag}**`,
        `- Delete messages: **${days}** day(s)`,
        `- Reason: ${reason}`,
      ].join("\n"),
    });

    await interaction.editReply({
      components: [card],
    });
  },
};
