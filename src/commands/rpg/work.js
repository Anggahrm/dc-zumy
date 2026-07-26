import { SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration } from "#utils/time.js";

const WORK_COOLDOWN_MS = 60 * 60 * 1000;

const JOBS = [
  { text: "You fixed a bug in production", min: 250, max: 500 },
  { text: "You delivered pizzas across town", min: 150, max: 400 },
  { text: "You moderated a chaotic chat", min: 200, max: 450 },
  { text: "You streamed for a few hours", min: 100, max: 600 },
  { text: "You sold homemade cookies", min: 150, max: 350 },
  { text: "You walked someone's dog", min: 100, max: 300 },
  { text: "You wrote documentation nobody read", min: 300, max: 550 },
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
          title: "Work",
          body: [
            "You're exhausted. Take a break!",
            `- Ready in: **${formatDuration((nextWorkAt - now) / 1000)}** (<t:${Math.floor(nextWorkAt / 1000)}:R>)`,
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
        title: "Work",
        body: [
          `${job.text} and earned **${earned}** 💰`,
          `- Balance: **${user.money}**`,
          `- Next shift: <t:${Math.floor(user.nextWorkAt / 1000)}:R>`,
        ].join("\n"),
      }),
    );
  },
};
