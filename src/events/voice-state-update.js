import { Events } from "discord.js";
import { sendGuildLog } from "#services/logging.js";

function describeChannel(channel) {
  return channel?.id ? `<#${channel.id}>` : "(none)";
}

function resolveMemberTag(oldState, newState) {
  return oldState.member?.user?.tag ?? newState.member?.user?.tag ?? newState.id;
}

export default {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    if (oldChannelId === newChannelId) return;

    const logger = newState.client.zumy?.logger;
    const baseLines = [
      `- Member: **${resolveMemberTag(oldState, newState)}**`,
      `- User ID: \`${newState.id}\``,
    ];

    if (!oldChannelId && newChannelId) {
      await sendGuildLog({
        guild,
        eventKey: "voice_join",
        title: "Voice Join",
        color: 0x57f287,
        lines: [...baseLines, `- Channel: ${describeChannel(newState.channel)}`],
        logger,
      });
      return;
    }

    if (oldChannelId && !newChannelId) {
      await sendGuildLog({
        guild,
        eventKey: "voice_leave",
        title: "Voice Leave",
        color: 0xed4245,
        lines: [...baseLines, `- Channel: ${describeChannel(oldState.channel)}`],
        logger,
      });
      return;
    }

    await sendGuildLog({
      guild,
      eventKey: "voice_move",
      title: "Voice Move",
      color: 0x3498db,
      lines: [
        ...baseLines,
        `- From: ${describeChannel(oldState.channel)}`,
        `- To: ${describeChannel(newState.channel)}`,
      ],
      logger,
    });
  },
};
