import { AuditLogEvent, Events } from "discord.js";
import { recordCase } from "#services/cases.js";

async function resolveUser(client, userId) {
  if (!userId) return null;
  return client.users.cache.get(userId) ?? (await client.users.fetch(userId).catch(() => null));
}

function resolveTimeoutChange(entry) {
  const change = entry.changes?.find((c) => c.key === "communication_disabled_until");
  if (!change) return null;
  return change.new ? "timeout" : "untimeout";
}

export default {
  name: Events.GuildAuditLogEntryCreate,
  async execute(entry, guild) {
    const client = guild.client;
    const logger = client.zumy?.logger;

    // The bot's own actions already create cases in the commands/services that
    // perform them — only attribute external actions here.
    if (!entry.executorId || entry.executorId === client.user?.id) return;

    let type = null;
    if (entry.action === AuditLogEvent.MemberKick) {
      type = "kick";
    } else if (entry.action === AuditLogEvent.MemberBanAdd) {
      type = "ban";
    } else if (entry.action === AuditLogEvent.MemberBanRemove) {
      type = "unban";
    } else if (entry.action === AuditLogEvent.MemberUpdate) {
      type = resolveTimeoutChange(entry);
    }

    if (!type || !entry.targetId) return;

    const [target, executor] = await Promise.all([
      resolveUser(client, entry.targetId),
      resolveUser(client, entry.executorId),
    ]);

    await recordCase({
      guild,
      type,
      target: target ?? { id: entry.targetId, tag: null },
      moderator: executor ?? { id: entry.executorId, tag: null },
      reason: entry.reason?.trim() || null,
      metadata: { source: "audit_log" },
      logger,
    });
  },
};
