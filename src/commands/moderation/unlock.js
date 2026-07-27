import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { canManageChannel, setChannelLock } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("unlock", {
  en: {
    title: "Moderation",
    no_reason: "No reason provided.",
    cannot_unlock: "That channel can't be unlocked.",
    need_manage_roles: "I need **Manage Roles** permission in that channel.",
    audit_reason: "Unlocked by {user}: {reason}",
    unlock_failed: "The unlock didn't go through. Check my permissions in that channel.",
    unlocked_body: "<#{channel}> is now unlocked.\n- Reason: {reason}",
  },
  id: {
    title: "Moderasi",
    no_reason: "Tidak ada alasan yang diberikan.",
    cannot_unlock: "Channel itu tidak bisa dibuka kuncinya.",
    need_manage_roles: "Aku butuh permission **Manage Roles** di channel itu.",
    audit_reason: "Dibuka oleh {user}: {reason}",
    unlock_failed: "Gagal membuka kunci. Cek permission-ku di channel itu ya.",
    unlocked_body: "<#{channel}> sekarang dibuka kuncinya.\n- Alasan: {reason}",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("unlock.title"), body });
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageChannels],
  },
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a previously locked channel")
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
      throw new Error("Guild context is required for unlock command.");
    }

    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    const reason = interaction.options.getString("reason")?.trim() || ctx.t("unlock.no_reason");

    if (!channel || !channel.permissionOverwrites) {
      await replyCard(interaction, errorCard(ctx.t, ctx.t("unlock.cannot_unlock")), { ephemeral: true });
      return;
    }

    if (!canManageChannel(channel)) {
      await replyCard(interaction, errorCard(ctx.t, ctx.t("unlock.need_manage_roles")), { ephemeral: true });
      return;
    }

    try {
      await setChannelLock(channel, false, ctx.t("unlock.audit_reason", { user: interaction.user.tag, reason }));
    } catch {
      await replyCard(interaction, errorCard(ctx.t, ctx.t("unlock.unlock_failed")), { ephemeral: true });
      return;
    }

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: ctx.t("unlock.title"),
        body: ctx.t("unlock.unlocked_body", { channel: channel.id, reason }),
      }),
    );
  },
};
