import { Events } from "discord.js";
import { getLoggingConfig, sendGuildLog } from "#services/logging.js";

async function logForGuild({ guild, oldUser, newUser, usernameChanged, avatarChanged, logger }) {
  const config = await getLoggingConfig(guild.id, { preferCache: true });
  const shouldLogName = usernameChanged && config.events.name_updates;
  const shouldLogAvatar = avatarChanged && config.events.avatar_updates;
  if ((!shouldLogName && !shouldLogAvatar) || !config.channelId) {
    return;
  }

  const hasMember = guild.members.cache.has(newUser.id)
    || Boolean(await guild.members.fetch(newUser.id).catch(() => null));
  if (!hasMember) {
    return;
  }

  const actor = {
    actorId: newUser.id,
    actorName: newUser.tag,
    actorAvatarUrl: newUser.displayAvatarURL({ extension: "png", size: 128 }),
    actorAvatarDescription: `${newUser.tag} avatar`,
  };

  if (shouldLogName) {
    await sendGuildLog({
      guild,
      eventKey: "name_updates",
      title: "User Name Updated",
      color: 0x3498db,
      lines: [
        `- User: <@${newUser.id}>`,
        `- User ID: \`${newUser.id}\``,
        `- Before: ${oldUser.username}`,
        `- After: ${newUser.username}`,
      ],
      ...actor,
      logger,
    });
  }

  if (shouldLogAvatar) {
    await sendGuildLog({
      guild,
      eventKey: "avatar_updates",
      title: "User Avatar Updated",
      color: 0x3498db,
      lines: [
        `- User: <@${newUser.id}>`,
        `- User ID: \`${newUser.id}\``,
      ],
      ...actor,
      logger,
    });
  }
}

export default {
  name: Events.UserUpdate,
  async execute(oldUser, newUser) {
    const client = newUser.client;
    const logger = client.zumy?.logger;
    const usernameChanged = oldUser.username != null && oldUser.username !== newUser.username;
    const avatarChanged = oldUser.avatar !== newUser.avatar && oldUser.partial !== true;
    if (!usernameChanged && !avatarChanged) {
      return;
    }

    const guilds = Array.from(client.guilds.cache.values());
    const results = await Promise.allSettled(
      guilds.map((guild) =>
        logForGuild({ guild, oldUser, newUser, usernameChanged, avatarChanged, logger }),
      ),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        logger?.warn("User update log failed for a guild", {
          userId: newUser.id,
          message: result.reason?.message || String(result.reason),
        });
      }
    }
  },
};
