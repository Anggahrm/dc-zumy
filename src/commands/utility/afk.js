import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { MAX_AFK_REASON_LENGTH, setAfk } from "#services/afk.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("afk", {
  en: {
    title: "AFK",
    now_afk: "You're now AFK. I'll let people know when they mention you.",
    reason_line: "- Reason: {reason}",
    auto_clear_note: "-# Your AFK clears automatically on your next message.",
  },
  id: {
    title: "AFK",
    now_afk: "Kamu sekarang AFK. Aku akan kasih tahu orang yang mention kamu.",
    reason_line: "- Alasan: {reason}",
    auto_clear_note: "-# AFK-mu otomatis hilang saat kamu kirim pesan berikutnya.",
  },
});

export default {
  category: "utility",
  cooldown: 5,
  permissions: {
    guildOnly: true,
  },
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Mark yourself AFK — I'll tell people who mention you")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Why you're away (optional)")
        .setMaxLength(MAX_AFK_REASON_LENGTH)
        .setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const guildId = ctx.guild ?? interaction.guildId;
    const entry = await setAfk(guildId, interaction.user.id, interaction.options.getString("reason"));

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: ctx.t("afk.title"),
        body: [
          ctx.t("afk.now_afk"),
          ctx.t("afk.reason_line", { reason: entry.reason }),
          ctx.t("afk.auto_clear_note"),
        ].join("\n"),
      }),
      { ephemeral: true },
    );
  },
};
