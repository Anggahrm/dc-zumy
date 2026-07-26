import { SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("pay", {
  en: {
    title: "Pay",
    bots_no_money: "Bots don't need money.",
    cannot_pay_self: "You can't pay yourself.",
    not_enough_money: "Not enough money. Your balance: **{balance}** 💰",
    sent_line: "💸 Sent **{amount}** to <@{user_id}>.",
    balance_line: "- Your balance: **{balance}**",
  },
  id: {
    title: "Pay",
    bots_no_money: "Bot tidak butuh uang.",
    cannot_pay_self: "Kamu tidak bisa bayar ke diri sendiri.",
    not_enough_money: "Uangmu tidak cukup. Saldomu: **{balance}** 💰",
    sent_line: "💸 Terkirim **{amount}** ke <@{user_id}>.",
    balance_line: "- Saldomu: **{balance}**",
  },
});

export default {
  category: "economy",
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Send money to another member")
    .addUserOption((option) =>
      option.setName("target").setDescription("Who to pay").setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("How much").setMinValue(1).setMaxValue(1_000_000).setRequired(true),
    ),
  async execute({ interaction, ctx }) {
    const target = interaction.options.getUser("target", true);
    const amount = interaction.options.getInteger("amount", true);

    if (target.bot) {
      await replyCard(
        interaction,
        createCard({ color: 0xed4245, title: ctx.t("pay.title"), body: ctx.t("pay.bots_no_money") }),
        { ephemeral: true },
      );
      return;
    }

    if (target.id === interaction.user.id) {
      await replyCard(
        interaction,
        createCard({ color: 0xed4245, title: ctx.t("pay.title"), body: ctx.t("pay.cannot_pay_self") }),
        { ephemeral: true },
      );
      return;
    }

    // Both records are preloaded by the handler (invoker + `target` option).
    const sender = global.db.data.users[ctx.user];
    const balance = Number(sender.money ?? 0);
    if (balance < amount) {
      await replyCard(
        interaction,
        createCard({
          color: 0xed4245,
          title: ctx.t("pay.title"),
          body: ctx.t("pay.not_enough_money", { balance }),
        }),
        { ephemeral: true },
      );
      return;
    }

    const receiver = global.db.data.users[target.id];
    sender.money = balance - amount;
    receiver.money = Number(receiver.money ?? 0) + amount;

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: ctx.t("pay.title"),
        body: [
          ctx.t("pay.sent_line", { amount, user_id: target.id }),
          ctx.t("pay.balance_line", { balance: sender.money }),
        ].join("\n"),
      }),
    );
  },
};
