import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

function formatContent(value) {
  const text = value?.trim();
  return text ? text.slice(0, 900) : "(no text)";
}

function resolveContent(value) {
  return typeof value === "string" ? value : null;
}

export default {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    const guild = newMessage.guild ?? oldMessage.guild;
    if (!guild || !newMessage.id) return;

    // Embed resolution and other non-edit updates don't set editedTimestamp;
    // real user edits always do.
    if (!newMessage.editedTimestamp) return;
    if (newMessage.author?.bot) return;

    const oldContent = resolveContent(oldMessage.content);
    const nextContent = resolveContent(newMessage.content);

    if (nextContent == null) return;
    if (oldContent != null && oldContent === nextContent) return;

    const logger = newMessage.client.zumy?.logger;
    const author = newMessage.author ?? oldMessage.author ?? null;
    await sendGuildLog({
      guild,
      eventKey: "edited_messages",
      title: "Edited Message",
      color: 0xf1c40f,
      lines: [
        `- Author: **${newMessage.author?.tag ?? oldMessage.author?.tag ?? "Unknown user"}**`,
        `- Channel: ${newMessage.channelId ? `<#${newMessage.channelId}>` : "Unknown channel"}`,
        `- Message ID: \`${newMessage.id}\``,
        `- Before: ${oldContent == null ? "(I didn't see the older version)" : formatContent(oldContent)}`,
        `- After: ${formatContent(nextContent)}`,
      ],
      actorId: author?.id ?? null,
      actorName: author?.tag ?? null,
      actorAvatarUrl: author?.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
      actorAvatarDescription: author?.tag ? `${author.tag} avatar` : null,
      logger,
    });
  },
};
