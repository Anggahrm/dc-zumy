import { Events } from "discord.js";
import { primeGuildInvites } from "#services/invites.js";
import { runVoiceXpTick, VOICE_TICK_MINUTES } from "#services/levels.js";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    const logger = client.zumy?.logger;
    logger?.info("Bot ready", {
      user: client.user?.tag,
      commands: client.zumy?.registry.size(),
    });
    client.zumy?.scheduler?.start();

    // Voice XP is ephemeral by nature — a plain interval is enough.
    const voiceTimer = setInterval(
      () => void runVoiceXpTick(client, logger),
      VOICE_TICK_MINUTES * 60 * 1000,
    );
    voiceTimer.unref?.();

    // Warm the invite-use cache so join attribution works from the start.
    const results = await Promise.allSettled(
      client.guilds.cache.map((guild) => primeGuildInvites(guild)),
    );
    const primed = results.filter((result) => result.status === "fulfilled" && result.value).length;
    logger?.info("Invite cache primed", { guilds: primed, total: client.guilds.cache.size });
  },
};
