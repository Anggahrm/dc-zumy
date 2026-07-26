import { Events, PermissionFlagsBits } from "discord.js";
import { checkMessage, getAutomodConfig, isAutomodActive } from "#services/automod.js";
import { sendGuildLog } from "#services/logging.js";
import { formatError } from "#utils/error.js";

function isExempt(message) {
  const member = message.member;
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageMessages);
}

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author?.bot || message.system) return;

    const logger = message.client.zumy?.logger;

    let config;
    try {
      config = await getAutomodConfig(message.guild.id, { preferCache: true });
    } catch (error) {
      const details = formatError(error);
      logger?.warn("Automod config read failed", {
        guildId: message.guild.id,
        message: details.message,
      });
      return;
    }

    if (!isAutomodActive(config)) return;
    if (isExempt(message)) return;

    const violation = checkMessage(config, message);
    if (!violation) return;

    let deleted = false;
    try {
      await message.delete();
      deleted = true;
    } catch (error) {
      const details = formatError(error);
      logger?.warn("Automod delete failed", {
        guildId: message.guild.id,
        channelId: message.channelId,
        messageId: message.id,
        rule: violation.rule,
        message: details.message,
      });
    }

    await sendGuildLog({
      guild: message.guild,
      eventKey: "automod",
      title: "Automod Action",
      color: 0xe67e22,
      lines: [
        `- Member: **${message.author.tag}**`,
        `- User ID: \`${message.author.id}\``,
        `- Channel: <#${message.channelId}>`,
        `- Rule: ${violation.label}`,
        `- Action: ${deleted ? "message deleted" : "delete failed (missing permission)"}`,
      ],
      actorId: message.author.id,
      actorName: message.author.tag,
      actorAvatarUrl: message.author.displayAvatarURL({ extension: "png", size: 128 }),
      actorAvatarDescription: `${message.author.tag} avatar`,
      logger,
    });
  },
};
