import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { getSnipe } from "#services/snipe.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("snipe", {
  en: {
    title: "Snipe",
    nothing: "Nothing to snipe — no recently deleted message here (kept for 5 minutes).",
    footer_deleted: "Deleted {seconds}s ago",
  },
  id: {
    title: "Snipe",
    nothing: "Tidak ada yang bisa di-snipe — tidak ada pesan yang baru dihapus di sini (disimpan 5 menit).",
    footer_deleted: "Dihapus {seconds} detik lalu",
  },
});

export default {
  category: "utility",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageMessages],
  },
  data: new SlashCommandBuilder()
    .setName("snipe")
    .setDescription("Show the most recently deleted message in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild),
  async execute({ interaction, ctx }) {
    const entry = getSnipe(interaction.channelId);

    if (!entry) {
      await replyCard(
        interaction,
        createCard({
          color: 0xf1c40f,
          title: ctx.t("snipe.title"),
          body: ctx.t("snipe.nothing"),
        }),
        { ephemeral: true },
      );
      return;
    }

    await replyCard(
      interaction,
      createCard({
        color: 0xed4245,
        title: ctx.t("snipe.title"),
        body: entry.content,
        actorName: entry.authorTag,
        actorAvatarUrl: entry.avatarUrl,
        footer: ctx.t("snipe.footer_deleted", { seconds: Math.max(1, Math.round((Date.now() - entry.deletedAt) / 1000)) }),
      }),
      { ephemeral: true },
    );
  },
};
