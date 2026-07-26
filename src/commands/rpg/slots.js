import { SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";

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
        createCard({ color: 0xed4245, title: "Slots", body: `Not enough money. Your balance: **${balance}** 💰` }),
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
        title: "Slots",
        body: [
          `🎰 ${reels.join(" | ")}`,
          "",
          multiplier > 0
            ? `You win **${amount * multiplier}** 💰 (x${multiplier})!`
            : `No match — you lose **${amount}** 💰`,
          `- Balance: **${user.money}**`,
        ].join("\n"),
      }),
    );
  },
};
