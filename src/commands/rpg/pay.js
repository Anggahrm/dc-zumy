import { SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";

export default {
  category: "rpg",
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
        createCard({ color: 0xed4245, title: "Pay", body: "Bots don't need money." }),
        { ephemeral: true },
      );
      return;
    }

    if (target.id === interaction.user.id) {
      await replyCard(
        interaction,
        createCard({ color: 0xed4245, title: "Pay", body: "You can't pay yourself." }),
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
          title: "Pay",
          body: `Not enough money. Your balance: **${balance}** 💰`,
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
        title: "Pay",
        body: [
          `💸 Sent **${amount}** to <@${target.id}>.`,
          `- Your balance: **${sender.money}**`,
        ].join("\n"),
      }),
    );
  },
};
