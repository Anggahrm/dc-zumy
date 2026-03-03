import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

function resolveAuthorTag(message) {
  return message.author?.tag ?? "Unknown user";
}

function resolveChannelLabel(message) {
  return message.channelId ? `<#${message.channelId}>` : "Unknown channel";
}

function formatContent(content) {
  const text = content?.trim();
  return text ? text.slice(0, 900) : "(no text content)";
}

function resolveContentLabel(message) {
  if (typeof message.content === "string") {
    return formatContent(message.content);
  }
  return "(content unavailable: Message Content intent or cache miss)";
}

export default {
  name: Events.MessageDelete,
  async execute(message) {
    const guild = message.guild;
    if (!guild || !message.id) return;

    const logger = message.client.zumy?.logger;
    const author = message.author ?? null;
    await sendGuildLog({
      guild,
      eventKey: "deleted_messages",
      title: "Deleted Message",
      color: 0xed4245,
      lines: [
        `- Author: **${resolveAuthorTag(message)}**`,
        `- Channel: ${resolveChannelLabel(message)}`,
        `- Message ID: \`${message.id}\``,
        `- Content: ${resolveContentLabel(message)}`,
      ],
      actorId: author?.id ?? null,
      actorName: author?.tag ?? null,
      actorAvatarUrl: author?.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
      actorAvatarDescription: author?.tag ? `${author.tag} avatar` : null,
      logger,
    });
  },
};
