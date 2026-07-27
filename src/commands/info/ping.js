import { SlashCommandBuilder } from "discord.js";
import { BOT_NAME } from "#config/constants.js";
import { registerStrings } from "#services/i18n.js";
import { replyCard, createCard } from "#utils/respond.js";
import { formatDuration } from "#utils/time.js";

registerStrings("ping", {
  en: {
    title: "{bot} Live Status",
    runtime_section:
      "**Status**\n- Ping: **{ping} ms**\n- Uptime: **{uptime}**\n- Checked at: <t:{timestamp}:T>",
    quick_read_title: "**Quick Read**",
    quality_great: "- Connection quality looks great.",
    quality_stable: "- Connection is stable but could be faster.",
  },
  id: {
    title: "Status Live {bot}",
    runtime_section:
      "**Status**\n- Ping: **{ping} ms**\n- Uptime: **{uptime}**\n- Dicek pada: <t:{timestamp}:T>",
    quick_read_title: "**Ringkasan Cepat**",
    quality_great: "- Kualitas koneksi bagus banget.",
    quality_stable: "- Koneksi stabil, tapi masih bisa lebih cepat.",
  },
});

export default {
  category: "info",
  cooldown: 2,
  data: new SlashCommandBuilder().setName("ping").setDescription("See bot ping"),
  async execute({ interaction, ctx }) {
    const now = Date.now();
    const apiPing = Math.max(0, Math.round(interaction.client.ws.ping));
    const appUptime = formatDuration(process.uptime());

    const card = createCard({
      color: 0x57f287,
      title: ctx.t("ping.title", { bot: BOT_NAME }),
      body: [
        ctx.t("ping.runtime_section", {
          ping: apiPing,
          uptime: appUptime,
          timestamp: Math.floor(now / 1000),
        }),
        "",
        ctx.t("ping.quick_read_title"),
        apiPing < 100 ? ctx.t("ping.quality_great") : ctx.t("ping.quality_stable"),
      ].join("\n"),
    });

    await replyCard(interaction, card);
  },
};
