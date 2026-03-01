import { SlashCommandBuilder } from "discord.js";
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
    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"));
    const days = clampDeleteMessageDays(interaction.options.getInteger("days"));
    const deleteMessageSeconds = days * 24 * 60 * 60;

    if (target.id === interaction.user.id) {
      const card = createCard({
        color: 0xed4245,
        title: "Moderation",
        body: "You cannot ban yourself.",
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    const targetMember = interaction.options.getMember("target");
    if (targetMember && !targetMember.bannable) {
      const card = createCard({
        color: 0xed4245,
        title: "Moderation",
        body: "I cannot ban that user due to role hierarchy or missing permissions.",
      });
      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    await interaction.guild.bans.create(target, {
      reason,
      deleteMessageSeconds,
    });

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

    await replyCard(interaction, card, { ephemeral: true });
  },
};
