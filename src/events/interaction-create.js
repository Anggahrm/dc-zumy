import { Events } from "discord.js";

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const handler = interaction.client.zumy?.onInteraction;
    if (!handler) return;
    await handler(interaction);
  },
};
