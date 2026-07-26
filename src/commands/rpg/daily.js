import { SlashCommandBuilder } from "discord.js";
import { levelFromExp } from "#utils/level.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration } from "#utils/time.js";

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default {
  category: "rpg",
  data: new SlashCommandBuilder().setName("daily").setDescription("Claim daily reward"),
  async execute({ interaction, ctx }) {
    const user = global.db.data.users[ctx.user];
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

    // Streak: claiming again within 48h of the previous claim extends it.
    const lastDailyAt = Number(user.lastDailyAt ?? 0);
    const streak = lastDailyAt > 0 && now - lastDailyAt < 48 * 60 * 60 * 1000
      ? Number(user.dailyStreak ?? 0) + 1
      : 1;
    const streakBonus = Math.min(streak - 1, 7) * 200;

    const previousLevel = levelFromExp(user.exp);
    user.money = Number(user.money ?? 0) + rewardMoney + streakBonus;
    user.exp = Number(user.exp ?? 0) + rewardExp;
    user.nextDailyAt = now + DAILY_COOLDOWN_MS;
    user.lastDailyAt = now;
    user.dailyStreak = streak;
    user.level = levelFromExp(user.exp);
    const leveledUp = user.level > previousLevel;

    const card = createCard({
      color: 0x57f287,
      title: "Daily Claimed",
      body: [
        `You received your daily reward.`,
        `- Money: **+${rewardMoney}**${streakBonus > 0 ? ` (+**${streakBonus}** streak bonus)` : ""}`,
        `- EXP: **+${rewardExp}**`,
        `- 🔥 Streak: **${streak}** day${streak === 1 ? "" : "s"}`,
        ...(leveledUp ? [`- 🎉 Level up! You are now level **${user.level}**`] : []),
        "",
        "**Your Totals**",
        `- Money: **${user.money}**`,
        `- EXP: **${user.exp}**`,
        `- Level: **${user.level}**`,
        `- Next daily: <t:${Math.floor(user.nextDailyAt / 1000)}:R>`,
      ].join("\n"),
    });

    await replyCard(interaction, card);
  },
};
