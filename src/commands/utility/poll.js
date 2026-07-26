import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("poll", {
  en: {
    title: "Poll",
    need_two_answers: "A poll needs at least two answers.",
  },
  id: {
    title: "Polling",
    need_two_answers: "Polling butuh minimal dua jawaban.",
  },
});

const DURATION_CHOICES = [
  { name: "1 hour", value: 1 },
  { name: "4 hours", value: 4 },
  { name: "8 hours", value: 8 },
  { name: "1 day", value: 24 },
  { name: "3 days", value: 72 },
  { name: "1 week", value: 168 },
];

export default {
  category: "utility",
  cooldown: 10,
  permissions: {
    guildOnly: true,
  },
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a native Discord poll")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option.setName("question").setDescription("The poll question").setMaxLength(300).setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("answer1").setDescription("First answer").setMaxLength(55).setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("answer2").setDescription("Second answer").setMaxLength(55).setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("answer3").setDescription("Third answer").setMaxLength(55).setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("answer4").setDescription("Fourth answer").setMaxLength(55).setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("answer5").setDescription("Fifth answer").setMaxLength(55).setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName("duration")
        .setDescription("How long the poll runs (default 1 day)")
        .addChoices(...DURATION_CHOICES)
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option.setName("multiselect").setDescription("Allow picking multiple answers").setRequired(false),
    ),
  async execute({ interaction, ctx }) {
    const answers = [];
    for (let i = 1; i <= 5; i += 1) {
      const answer = interaction.options.getString(`answer${i}`)?.trim();
      if (answer) answers.push({ text: answer });
    }

    if (answers.length < 2) {
      await replyCard(
        interaction,
        createCard({ color: 0xed4245, title: ctx.t("poll.title"), body: ctx.t("poll.need_two_answers") }),
        { ephemeral: true },
      );
      return;
    }

    await interaction.reply({
      poll: {
        question: { text: interaction.options.getString("question", true).trim() },
        answers,
        duration: interaction.options.getInteger("duration") ?? 24,
        allowMultiselect: interaction.options.getBoolean("multiselect") ?? false,
      },
    });
  },
};
