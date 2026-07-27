import { SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("coinflip", {
  en: {
    title: "Coinflip",
    not_enough_money: "You don't have enough — your balance is **{balance}** 💰.",
    land_win: "🪙 The coin lands on **{result}** — you win!",
    land_lose: "🪙 The coin lands on **{result}** — you lose!",
    won_line: "- Won: **{amount}** 💰",
    lost_line: "- Lost: **{amount}** 💰",
    balance_line: "- Balance: **{balance}**",
  },
  id: {
    title: "Coinflip",
    not_enough_money: "Uangmu belum cukup — saldomu **{balance}** 💰.",
    land_win: "🪙 Koinnya mendarat di **{result}** — kamu menang!",
    land_lose: "🪙 Koinnya mendarat di **{result}** — kamu kalah!",
    won_line: "- Menang: **{amount}** 💰",
    lost_line: "- Kalah: **{amount}** 💰",
    balance_line: "- Saldo: **{balance}**",
  },
});

const MIN_BET = 10;
const MAX_BET = 50_000;

export default {
  category: "economy",
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
        createCard({ color: 0xed4245, title: ctx.t("coinflip.title"), body: ctx.t("coinflip.not_enough_money", { balance }) }),
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
        title: ctx.t("coinflip.title"),
        body: [
          won ? ctx.t("coinflip.land_win", { result }) : ctx.t("coinflip.land_lose", { result }),
          won ? ctx.t("coinflip.won_line", { amount }) : ctx.t("coinflip.lost_line", { amount }),
          ctx.t("coinflip.balance_line", { balance: user.money }),
        ].join("\n"),
      }),
    );
  },
};
