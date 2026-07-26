import { SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { levelProgress } from "#utils/level.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration } from "#utils/time.js";

registerStrings("profile", {
  en: {
    title: "RPG Profile",
    daily_ready: "Ready now",
    daily_ready_in: "Ready in **{duration}** (<t:{timestamp}:R>)",
    line_user: "- User: <@{user_id}>",
    line_level: "- Level: **{level}**",
    line_exp: "- EXP: **{exp}** ({current}/{needed} to next level)",
    line_money: "- Money: **{money}**",
    line_daily: "- Daily: {status}",
  },
  id: {
    title: "Profil RPG",
    daily_ready: "Siap sekarang",
    daily_ready_in: "Siap dalam **{duration}** (<t:{timestamp}:R>)",
    line_user: "- User: <@{user_id}>",
    line_level: "- Level: **{level}**",
    line_exp: "- EXP: **{exp}** ({current}/{needed} ke level berikutnya)",
    line_money: "- Uang: **{money}**",
    line_daily: "- Daily: {status}",
  },
});

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
  async execute({ interaction, ctx }) {
    const target = interaction.options.getUser("target") ?? interaction.user;
    const targetId = target.id;
    if (targetId !== ctx.user && targetId !== ctx.mention) {
      await ctx.loadUser(targetId);
    }

    const user = global.db.data.users[targetId];
    const now = Date.now();
    const nextDailyAt = Number(user.nextDailyAt ?? 0);
    const dailyStatus =
      nextDailyAt <= now
        ? ctx.t("profile.daily_ready")
        : ctx.t("profile.daily_ready_in", {
            duration: formatDuration((nextDailyAt - now) / 1000),
            timestamp: Math.floor(nextDailyAt / 1000),
          });

    const progress = levelProgress(user.exp);
    const card = createCard({
      color: 0x3498db,
      title: ctx.t("profile.title"),
      body: [
        ctx.t("profile.line_user", { user_id: target.id }),
        ctx.t("profile.line_level", { level: formatNumber(progress.level) }),
        ctx.t("profile.line_exp", {
          exp: formatNumber(user.exp),
          current: formatNumber(progress.current),
          needed: formatNumber(progress.needed),
        }),
        ctx.t("profile.line_money", { money: formatNumber(user.money) }),
        ctx.t("profile.line_daily", { status: dailyStatus }),
      ].join("\n"),
    });

    await replyCard(interaction, card);
  },
};
