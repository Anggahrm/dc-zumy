import { SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";

const MIN_BET = 10;
const MAX_BET = 50_000;

export default {
  category: "rpg",
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Bet on a coin flip — double or nothing")
    .addIntegerOption((option) =>
      option.setName("amount").setDescription(`Bet (${MIN_BET}-${MAX_BET})`).setMinValue(MIN_BET).setMaxValue(MAX_BET).setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("side")
        .setDescription("Your call")
        .addChoices({ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" })
        .setRequired(true),
    ),
  async execute({ interaction, ctx }) {
    const amount = interaction.options.getInteger("amount", true);
    const side = interaction.options.getString("side", true);

    const user = global.db.data.users[ctx.user];
    const balance = Number(user.money ?? 0);
    if (balance < amount) {
      await replyCard(
        interaction,
        createCard({ color: 0xed4245, title: "Coinflip", body: `Not enough money. Your balance: **${balance}** 💰` }),
        { ephemeral: true },
      );
      return;
    }

    const result = Math.random() < 0.5 ? "heads" : "tails";
    const won = result === side;
    user.money = balance + (won ? amount : -amount);

    await replyCard(
      interaction,
      createCard({
        color: won ? 0x57f287 : 0xed4245,
        title: "Coinflip",
        body: [
          `🪙 The coin lands on **${result}** — you ${won ? "win" : "lose"}!`,
          `- ${won ? "Won" : "Lost"}: **${amount}** 💰`,
          `- Balance: **${user.money}**`,
        ].join("\n"),
      }),
    );
  },
};
