import { SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { levelFromExp } from "#utils/level.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration } from "#utils/time.js";

registerStrings("daily", {
  en: {
    not_ready_title: "Daily Not Ready",
    already_claimed: "You already claimed daily reward.",
    try_again_line: "- Try again in: **{remaining}**",
    available_line: "- Available: <t:{timestamp}:R>",
    claimed_title: "Daily Claimed",
    received: "You received your daily reward.",
    money_line: "- Money: **+{money}**",
    money_line_bonus: "- Money: **+{money}** (+**{bonus}** streak bonus)",
    exp_line: "- EXP: **+{exp}**",
    streak_line_one: "- 🔥 Streak: **{streak}** day",
    streak_line_many: "- 🔥 Streak: **{streak}** days",
    level_up_line: "- 🎉 Level up! You are now level **{level}**",
    totals_title: "**Your Totals**",
    total_money_line: "- Money: **{money}**",
    total_exp_line: "- EXP: **{exp}**",
    total_level_line: "- Level: **{level}**",
    next_daily_line: "- Next daily: <t:{timestamp}:R>",
  },
  id: {
    not_ready_title: "Daily Belum Siap",
    already_claimed: "Kamu sudah klaim daily reward.",
    try_again_line: "- Coba lagi dalam: **{remaining}**",
    available_line: "- Tersedia: <t:{timestamp}:R>",
    claimed_title: "Daily Diklaim",
    received: "Kamu menerima daily reward-mu.",
    money_line: "- Uang: **+{money}**",
    money_line_bonus: "- Uang: **+{money}** (+**{bonus}** bonus streak)",
    exp_line: "- EXP: **+{exp}**",
    streak_line_one: "- 🔥 Streak: **{streak}** hari",
    streak_line_many: "- 🔥 Streak: **{streak}** hari",
    level_up_line: "- 🎉 Level up! Sekarang kamu level **{level}**",
    totals_title: "**Total Kamu**",
    total_money_line: "- Uang: **{money}**",
    total_exp_line: "- EXP: **{exp}**",
    total_level_line: "- Level: **{level}**",
    next_daily_line: "- Daily berikutnya: <t:{timestamp}:R>",
  },
});

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
        title: ctx.t("daily.not_ready_title"),
        body: [
          ctx.t("daily.already_claimed"),
          ctx.t("daily.try_again_line", { remaining }),
          ctx.t("daily.available_line", { timestamp: Math.floor(nextDailyAt / 1000) }),
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
      title: ctx.t("daily.claimed_title"),
      body: [
        ctx.t("daily.received"),
        streakBonus > 0
          ? ctx.t("daily.money_line_bonus", { money: rewardMoney, bonus: streakBonus })
          : ctx.t("daily.money_line", { money: rewardMoney }),
        ctx.t("daily.exp_line", { exp: rewardExp }),
        streak === 1
          ? ctx.t("daily.streak_line_one", { streak })
          : ctx.t("daily.streak_line_many", { streak }),
        ...(leveledUp ? [ctx.t("daily.level_up_line", { level: user.level })] : []),
        "",
        ctx.t("daily.totals_title"),
        ctx.t("daily.total_money_line", { money: user.money }),
        ctx.t("daily.total_exp_line", { exp: user.exp }),
        ctx.t("daily.total_level_line", { level: user.level }),
        ctx.t("daily.next_daily_line", { timestamp: Math.floor(user.nextDailyAt / 1000) }),
      ].join("\n"),
    });

    await replyCard(interaction, card);
  },
};
