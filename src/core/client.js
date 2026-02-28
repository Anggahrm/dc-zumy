import { Client, GatewayIntentBits, Partials } from "discord.js";

export function createBotClient() {
  return new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel],
  });
}
