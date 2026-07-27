import { SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("maintenance", {
  en: {
    title: "Maintenance",
    status_enabled: "Maintenance mode is **enabled**. Only owners can use commands.",
    status_disabled: "Maintenance mode is **disabled**. The bot is public.",
    now_enabled: "Maintenance mode **enabled**. Non-owner commands are now blocked.",
    now_disabled: "Maintenance mode **disabled**. The bot is public again.",
  },
  id: {
    title: "Maintenance",
    status_enabled: "Mode maintenance lagi **aktif**. Hanya owner yang bisa pakai command.",
    status_disabled: "Mode maintenance **nonaktif**. Bot bisa dipakai publik.",
    now_enabled: "Mode maintenance **diaktifkan**. Command non-owner sekarang diblokir.",
    now_disabled: "Mode maintenance **dimatikan**. Bot bisa dipakai publik lagi.",
  },
});

export default {
  category: "owner",
  cooldown: 2,
  permissions: {
    owner: true,
  },
  data: new SlashCommandBuilder()
    .setName("maintenance")
    .setDescription("Toggle maintenance mode (owner only)")
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription("Enable or disable maintenance mode (omit to check status)")
        .setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    await global.db.loadBot();
    const enabled = interaction.options.getBoolean("enabled");

    if (enabled === null) {
      const active = Boolean(global.db.bot.maintenance);
      await replyCard(
        interaction,
        createCard({
          color: active ? 0xf1c40f : 0x57f287,
          title: ctx.t("maintenance.title"),
          body: active
            ? ctx.t("maintenance.status_enabled")
            : ctx.t("maintenance.status_disabled"),
        }),
        { ephemeral: true },
      );
      return;
    }

    global.db.bot.maintenance = enabled;

    await replyCard(
      interaction,
      createCard({
        color: enabled ? 0xf1c40f : 0x57f287,
        title: ctx.t("maintenance.title"),
        body: enabled
          ? ctx.t("maintenance.now_enabled")
          : ctx.t("maintenance.now_disabled"),
      }),
      { ephemeral: true },
    );
  },
};
