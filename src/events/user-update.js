import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

function formatAvatar(user) {
  return user.avatarURL({ extension: "png", size: 512 }) ?? "(no avatar)";
}

export default {
  name: Events.UserUpdate,
  async execute(oldUser, newUser) {
    const client = newUser.client;
    const logger = client.zumy?.logger;
    const guilds = Array.from(client.guilds.cache.values()).filter((guild) => guild.members.cache.has(newUser.id));

    for (const guild of guilds) {
      if (oldUser.username !== newUser.username) {
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

      if (oldUser.avatar !== newUser.avatar) {
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
