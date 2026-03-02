import { Events } from "discord.js";
import { getLoggingConfig, sendGuildLog } from "#services/logging.js";

function formatAvatar(user) {
  return user.avatarURL({ extension: "png", size: 512 }) ?? "(no avatar)";
}

export default {
  name: Events.UserUpdate,
  async execute(oldUser, newUser) {
    const client = newUser.client;
    const logger = client.zumy?.logger;
    const usernameChanged = oldUser.username !== newUser.username;
    const avatarChanged = oldUser.avatar !== newUser.avatar;
    if (!usernameChanged && !avatarChanged) {
      return;
    }

    const guilds = Array.from(client.guilds.cache.values());

    for (const guild of guilds) {
      const config = await getLoggingConfig(guild.id, { preferCache: true });
      const shouldLogName = usernameChanged && config.events.name_updates;
      const shouldLogAvatar = avatarChanged && config.events.avatar_updates;
      if (!shouldLogName && !shouldLogAvatar) {
        continue;
      }

      const hasMember = guild.members.cache.has(newUser.id)
        || Boolean(await guild.members.fetch(newUser.id).catch(() => null));
      if (!hasMember) {
        continue;
      }

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
            `- Old avatar: ${formatAvatar(oldUser)}`,
            `- New avatar: ${formatAvatar(newUser)}`,
          ],
          logger,
        });
      }
    }
  },
};
