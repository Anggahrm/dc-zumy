import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { canManageChannel, normalizeReason, setChannelLock } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Moderation", body });
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageChannels],
  },
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a channel (deny @everyone from sending messages)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setContexts(InteractionContextType.Guild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Target channel (defaults to current channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for lock command.");
    }

    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    const reason = normalizeReason(interaction.options.getString("reason"));

    if (!channel || !channel.permissionOverwrites) {
      await replyCard(interaction, errorCard("That channel can't be locked."), { ephemeral: true });
      return;
    }

    if (!canManageChannel(channel)) {
      await replyCard(interaction, errorCard("I need **Manage Roles** permission in that channel."), { ephemeral: true });
      return;
    }

    try {
      await setChannelLock(channel, true, `Locked by ${interaction.user.tag}: ${reason}`);
    } catch {
      await replyCard(interaction, errorCard("Lock failed. Please check my channel permissions."), { ephemeral: true });
      return;
    }

    await replyCard(
      interaction,
      createCard({
        color: 0xf1c40f,
        title: "Moderation",
        body: [
          `🔒 <#${channel.id}> is now locked.`,
          `- Reason: ${reason}`,
        ].join("\n"),
      }),
    );
  },
};
