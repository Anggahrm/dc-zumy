import { SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration } from "#utils/time.js";

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default {
  category: "rpg",
  data: new SlashCommandBuilder().setName("daily").setDescription("Claim daily reward (24h cooldown)"),
  async execute({ interaction }) {
    const user = global.db.user(interaction.user.id);
    const now = Date.now();
    const nextDailyAt = Number(user.nextDailyAt ?? 0);

    if (nextDailyAt > now) {
      const remaining = formatDuration((nextDailyAt - now) / 1000);
      const card = createCard({
        color: 0xfee75c,
        title: "Daily Not Ready",
        body: [
          `You already claimed daily reward.`,
          `- Try again in: **${remaining}**`,
          `- Available: <t:${Math.floor(nextDailyAt / 1000)}:R>`,
        ].join("\n"),
      });

      await replyCard(interaction, card, { ephemeral: true });
      return;
    }

    const rewardMoney = randomInt(1000, 3000);
    const rewardExp = randomInt(50, 150);

    user.money = Number(user.money ?? 0) + rewardMoney;
    user.exp = Number(user.exp ?? 0) + rewardExp;
    user.nextDailyAt = now + DAILY_COOLDOWN_MS;

    const card = createCard({
      color: 0x57f287,
      title: "Daily Claimed",
      body: [
        `You received your daily reward.`,
        `- Money: **+${rewardMoney}**`,
        `- EXP: **+${rewardExp}**`,
        "",
        "**Your Totals**",
        `- Money: **${user.money}**`,
        `- EXP: **${user.exp}**`,
        `- Next daily: <t:${Math.floor(user.nextDailyAt / 1000)}:R>`,
      ].join("\n"),
    });

    await replyCard(interaction, card);
  },
};
