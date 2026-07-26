import { SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("slots", {
  en: {
    title: "Slots",
    not_enough_money: "Not enough money. Your balance: **{balance}** 💰",
    reels_line: "🎰 {reels}",
    win_line: "You win **{amount}** 💰 (x{multiplier})!",
    lose_line: "No match — you lose **{amount}** 💰",
    balance_line: "- Balance: **{balance}**",
  },
  id: {
    title: "Slots",
    not_enough_money: "Uangmu kurang. Saldomu: **{balance}** 💰",
    reels_line: "🎰 {reels}",
    win_line: "Kamu menang **{amount}** 💰 (x{multiplier})!",
    lose_line: "Tidak ada yang cocok — kamu kalah **{amount}** 💰",
    balance_line: "- Saldo: **{balance}**",
  },
});

const MIN_BET = 10;
const MAX_BET = 25_000;
const REEL = ["🍒", "🍋", "🍇", "🔔", "⭐", "💎"];

function spin() {
  return REEL[Math.floor(Math.random() * REEL.length)];
}

// Triple = 10x (💎 20x), pair = 2x, otherwise lose the bet.
function payoutMultiplier(reels) {
  const [a, b, c] = reels;
  if (a === b && b === c) return a === "💎" ? 20 : 10;
  if (a === b || b === c || a === c) return 2;
  return 0;
}

export default {
  category: "rpg",
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName("slots")
    .setDescription("Spin the slot machine")
    .addIntegerOption((option) =>
      option.setName("amount").setDescription(`Bet (${MIN_BET}-${MAX_BET})`).setMinValue(MIN_BET).setMaxValue(MAX_BET).setRequired(true),
    ),
  async execute({ interaction, ctx }) {
    const amount = interaction.options.getInteger("amount", true);
    const user = global.db.data.users[ctx.user];
    const balance = Number(user.money ?? 0);

    if (balance < amount) {
      await replyCard(
        interaction,
        createCard({ color: 0xed4245, title: ctx.t("slots.title"), body: ctx.t("slots.not_enough_money", { balance }) }),
        { ephemeral: true },
      );
      return;
    }

    const reels = [spin(), spin(), spin()];
    const multiplier = payoutMultiplier(reels);
    const delta = multiplier > 0 ? amount * (multiplier - 1) : -amount;
    user.money = balance + delta;

    await replyCard(
      interaction,
      createCard({
        color: multiplier > 0 ? 0x57f287 : 0xed4245,
        title: ctx.t("slots.title"),
        body: [
          ctx.t("slots.reels_line", { reels: reels.join(" | ") }),
          "",
          multiplier > 0
            ? ctx.t("slots.win_line", { amount: amount * multiplier, multiplier })
            : ctx.t("slots.lose_line", { amount }),
          ctx.t("slots.balance_line", { balance: user.money }),
        ].join("\n"),
      }),
    );
  },
};
