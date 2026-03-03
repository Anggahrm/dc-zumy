import { Events } from "discord.js";
import { getLoggingConfig, sendGuildLog } from "#services/logging.js";
import { formatDiscordTimestamp } from "#utils/time.js";

function formatAvatar(user) {
  return user.displayAvatarURL({ extension: "png", size: 512 });
}

function formatAvatarFooter(userId, now = new Date()) {
  return `ID: ${userId} | ${formatDiscordTimestamp(now, "F")}`;
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
        const newAvatar = formatAvatar(newUser);
        await sendGuildLog({
          guild,
          eventKey: "avatar_updates",
          title: "User Avatar Updated",
          color: 0x3498db,
          lines: [
            `- User: <@${newUser.id}>`,
            `- User ID: \`${newUser.id}\``,
          ],
          thumbnailUrl: newAvatar,
          thumbnailDescription: `${newUser.tag} avatar`,
          footer: formatAvatarFooter(newUser.id),
          logger,
        });
      }
    }
  },
};
