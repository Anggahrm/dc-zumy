import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { canManageChannel, setChannelLock } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("lock", {
  en: {
    title: "Moderation",
    no_reason: "No reason provided.",
    cannot_lock: "That channel can't be locked.",
    need_manage_roles: "I need **Manage Roles** permission in that channel.",
    audit_reason: "Locked by {user}: {reason}",
    lock_failed: "Lock failed. Please check my channel permissions.",
    locked_body: "🔒 <#{channel}> is now locked.\n- Reason: {reason}",
  },
  id: {
    title: "Moderasi",
    no_reason: "Tidak ada alasan yang diberikan.",
    cannot_lock: "Channel itu tidak bisa dikunci.",
    need_manage_roles: "Aku butuh permission **Manage Roles** di channel itu.",
    audit_reason: "Dikunci oleh {user}: {reason}",
    lock_failed: "Gagal mengunci. Cek permission-ku di channel itu ya.",
    locked_body: "🔒 <#{channel}> sekarang dikunci.\n- Alasan: {reason}",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("lock.title"), body });
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
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for lock command.");
    }

    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    const reason = interaction.options.getString("reason")?.trim() || ctx.t("lock.no_reason");

    if (!channel || !channel.permissionOverwrites) {
      await replyCard(interaction, errorCard(ctx.t, ctx.t("lock.cannot_lock")), { ephemeral: true });
      return;
    }

    if (!canManageChannel(channel)) {
      await replyCard(interaction, errorCard(ctx.t, ctx.t("lock.need_manage_roles")), { ephemeral: true });
      return;
    }

    try {
      await setChannelLock(channel, true, ctx.t("lock.audit_reason", { user: interaction.user.tag, reason }));
    } catch {
      await replyCard(interaction, errorCard(ctx.t, ctx.t("lock.lock_failed")), { ephemeral: true });
      return;
    }

    await replyCard(
      interaction,
      createCard({
        color: 0xf1c40f,
        title: ctx.t("lock.title"),
        body: ctx.t("lock.locked_body", { channel: channel.id, reason }),
      }),
    );
  },
};
