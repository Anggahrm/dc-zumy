import { SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration } from "#utils/time.js";

const numberFormatter = new Intl.NumberFormat("en-US");

function formatNumber(value) {
  return numberFormatter.format(Number(value ?? 0));
}

export default {
  category: "rpg",
  cooldown: 2,
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Show RPG profile")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("User to inspect")
        .setRequired(false),
    ),
  async execute({ interaction }) {
    const target = interaction.options.getUser("target") ?? interaction.user;
    const user = global.db.user(target.id);
    const now = Date.now();
    const nextDailyAt = Number(user.nextDailyAt ?? 0);
    const dailyStatus =
      nextDailyAt <= now
        ? "Ready now"
        : `Ready in **${formatDuration((nextDailyAt - now) / 1000)}** (<t:${Math.floor(nextDailyAt / 1000)}:R>)`;

    const card = createCard({
      color: 0x3498db,
      title: "RPG Profile",
      body: [
        `- User: <@${target.id}>`,
        `- Level: **${formatNumber(user.level)}**`,
        `- EXP: **${formatNumber(user.exp)}**`,
        `- Money: **${formatNumber(user.money)}**`,
        `- Daily: ${dailyStatus}`,
      ].join("\n"),
    });

    await replyCard(interaction, card);
  },
};
