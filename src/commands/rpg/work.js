import { SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration } from "#utils/time.js";

registerStrings("work", {
  en: {
    title: "Work",
    exhausted: "You're exhausted. Take a break!",
    ready_in_line: "- Ready in: **{duration}** (<t:{timestamp}:R>)",
    earned_line: "{job} and earned **{earned}** 💰",
    balance_line: "- Balance: **{balance}**",
    next_shift_line: "- Next shift: <t:{timestamp}:R>",
    job_fixed_bug: "You fixed a bug in production",
    job_delivered_pizzas: "You delivered pizzas across town",
    job_moderated_chat: "You moderated a chaotic chat",
    job_streamed: "You streamed for a few hours",
    job_sold_cookies: "You sold homemade cookies",
    job_walked_dog: "You walked someone's dog",
    job_wrote_docs: "You wrote documentation nobody read",
  },
  id: {
    title: "Kerja",
    exhausted: "Kamu kecapekan. Istirahat dulu!",
    ready_in_line: "- Siap lagi dalam: **{duration}** (<t:{timestamp}:R>)",
    earned_line: "{job} dan dapat **{earned}** 💰",
    balance_line: "- Saldo: **{balance}**",
    next_shift_line: "- Shift berikutnya: <t:{timestamp}:R>",
    job_fixed_bug: "Kamu memperbaiki bug di production",
    job_delivered_pizzas: "Kamu mengantar pizza keliling kota",
    job_moderated_chat: "Kamu memoderasi chat yang kacau",
    job_streamed: "Kamu streaming selama beberapa jam",
    job_sold_cookies: "Kamu jualan kukis buatan sendiri",
    job_walked_dog: "Kamu mengajak jalan anjing orang",
    job_wrote_docs: "Kamu menulis dokumentasi yang tidak ada yang baca",
  },
});

const WORK_COOLDOWN_MS = 60 * 60 * 1000;

const JOBS = [
  { key: "job_fixed_bug", min: 250, max: 500 },
  { key: "job_delivered_pizzas", min: 150, max: 400 },
  { key: "job_moderated_chat", min: 200, max: 450 },
  { key: "job_streamed", min: 100, max: 600 },
  { key: "job_sold_cookies", min: 150, max: 350 },
  { key: "job_walked_dog", min: 100, max: 300 },
  { key: "job_wrote_docs", min: 300, max: 550 },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default {
  category: "rpg",
  cooldown: 3,
  data: new SlashCommandBuilder().setName("work").setDescription("Work for money (hourly)"),
  async execute({ interaction, ctx }) {
    const user = global.db.data.users[ctx.user];
    const now = Date.now();
    const nextWorkAt = Number(user.nextWorkAt ?? 0);

    if (nextWorkAt > now) {
      await replyCard(
        interaction,
        createCard({
          color: 0xfee75c,
          title: ctx.t("work.title"),
          body: [
            ctx.t("work.exhausted"),
            ctx.t("work.ready_in_line", {
              duration: formatDuration((nextWorkAt - now) / 1000),
              timestamp: Math.floor(nextWorkAt / 1000),
            }),
          ].join("\n"),
        }),
        { ephemeral: true },
      );
      return;
    }

    const job = JOBS[randomInt(0, JOBS.length - 1)];
    const earned = randomInt(job.min, job.max);
    user.money = Number(user.money ?? 0) + earned;
    user.nextWorkAt = now + WORK_COOLDOWN_MS;

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: ctx.t("work.title"),
        body: [
          ctx.t("work.earned_line", { job: ctx.t(`work.${job.key}`), earned }),
          ctx.t("work.balance_line", { balance: user.money }),
          ctx.t("work.next_shift_line", { timestamp: Math.floor(user.nextWorkAt / 1000) }),
        ].join("\n"),
      }),
    );
  },
};
