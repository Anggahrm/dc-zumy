import { SlashCommandBuilder } from "discord.js";
import { BOT_NAME } from "#config/constants.js";
import { replyCard, createCard } from "#utils/respond.js";
import { formatDuration } from "#utils/time.js";

export default {
  category: "info",
  cooldown: 2,
  data: new SlashCommandBuilder().setName("ping").setDescription("See bot ping"),
  async execute({ interaction }) {
    const now = Date.now();
    const apiPing = Math.max(0, Math.round(interaction.client.ws.ping));
    const appUptime = formatDuration(process.uptime());

    const card = createCard({
      color: 0x57f287,
      title: `${BOT_NAME} Live Status`,
      body: [
        "**Runtime**",
        `- Gateway ping: **${apiPing} ms**`,
        `- Uptime: **${appUptime}**`,
        `- Checked at: <t:${Math.floor(now / 1000)}:T>`,
        "",
        "**Quick Read**",
        apiPing < 100 ? "- Connection quality looks great." : "- Connection is stable but could be faster.",
      ].join("\n"),
    });

    await replyCard(interaction, card);
  },
};
