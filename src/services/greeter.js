import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { formatError } from "#utils/error.js";
import { guildFeatureUtils, loadGuildFeature } from "#services/guild-config.js";
import { formatDiscordTimestamp } from "#utils/time.js";

export const GREETER_MESSAGE_MAX_LENGTH = 500;

const GREETER_DEFAULTS = {
  welcomeChannelId: null,
  leaveChannelId: null,
  welcomeMessage: null,
  leaveMessage: null,
};

function sanitizeMessage(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, GREETER_MESSAGE_MAX_LENGTH);
}

function normalizeGreeter(config) {
  config.welcomeChannelId = guildFeatureUtils.sanitizeChannelId(config.welcomeChannelId);
  config.leaveChannelId = guildFeatureUtils.sanitizeChannelId(config.leaveChannelId);
  if (typeof config.welcomeMessage !== "string") config.welcomeMessage = null;
  if (typeof config.leaveMessage !== "string") config.leaveMessage = null;
}

function cloneConfig(config) {
  return {
    welcomeChannelId: config.welcomeChannelId,
    leaveChannelId: config.leaveChannelId,
    welcomeMessage: config.welcomeMessage,
    leaveMessage: config.leaveMessage,
  };
}

export function renderGreeterTemplate(template, { user, guild }) {
  return template
    .replaceAll("{user}", `<@${user.id}>`)
    .replaceAll("{username}", user.username ?? user.tag ?? String(user.id))
    .replaceAll("{server}", guild.name)
    .replaceAll("{count}", String(guild.memberCount ?? "?"));
}

function formatFooterTimestamp(now = new Date()) {
  return formatDiscordTimestamp(now, "F");
}

function createGreeterCard({ type, guild, user, template }) {
  const isWelcome = type === "welcome";
  const color = isWelcome ? 0x57f287 : 0xed4245;
  const title = isWelcome ? "Welcome To Server" : "Leave From Server";
  const unixCreatedAt = Math.floor(user.createdTimestamp / 1000);
  const avatarUrl = user.displayAvatarURL({ extension: "png", size: 1024 });

  const description = template
    ? renderGreeterTemplate(template, { user, guild })
    : (isWelcome
      ? `Hi <@${user.id}> Welcome to ${guild.name}, Have a nice day`
      : `Bye <@${user.id}> from ${guild.name}, Have a nice day`);

  const headline = new TextDisplayBuilder().setContent([
    `## ${title}`,
    description,
  ].join("\n"));

  const detailsSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "**Details Info**",
        `Username : ${user.tag}`,
        `UserID : ${user.id}`,
        `Since at : <t:${unixCreatedAt}:F>`,
      ].join("\n")),
    )
    .setThumbnailAccessory((thumbnail) =>
      thumbnail
        .setURL(avatarUrl)
        .setDescription(`${user.tag} avatar`),
    );

  const footer = new TextDisplayBuilder().setContent(`-# ${formatFooterTimestamp(new Date())}`);

  return new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(headline)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addSectionComponents(detailsSection)
    .addTextDisplayComponents(footer);
}

async function resolveGuildChannel(guild, channelId) {
  const cached = guild.channels.cache.get(channelId);
  if (cached) return cached;
  return guild.channels.fetch(channelId).catch(() => null);
}

async function sendGreeterMessage({ guild, user, type, channelId, template, logger }) {
  if (!channelId) return;

  const channel = await resolveGuildChannel(guild, channelId);
  if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
    logger?.warn("Greeter channel is not available", {
      guildId: guild.id,
      channelId,
      type,
    });
    return;
  }

  const card = createGreeterCard({
    type,
    guild,
    user,
    template,
  });

  try {
    await channel.send({
      components: [card],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: {
        users: [user.id],
      },
    });
  } catch (error) {
    const details = formatError(error);
    logger?.warn("Failed to send greeter message", {
      guildId: guild.id,
      channelId,
      userId: user.id,
      type,
      message: details.message,
    });
  }
}

export async function getGreeterConfig(guildId) {
  const config = await loadGuildFeature(guildId, "greeter", GREETER_DEFAULTS, normalizeGreeter);
  return cloneConfig(config);
}

export async function setGreeterChannel(guildId, type, channelId) {
  if (!["welcome", "leave"].includes(type)) {
    throw new Error(`Invalid greeter type: ${type}`);
  }

  const config = await loadGuildFeature(guildId, "greeter", GREETER_DEFAULTS, normalizeGreeter);
  const key = type === "welcome" ? "welcomeChannelId" : "leaveChannelId";
  config[key] = guildFeatureUtils.sanitizeChannelId(channelId);
  return cloneConfig(config);
}

export async function setGreeterMessage(guildId, type, message) {
  if (!["welcome", "leave"].includes(type)) {
    throw new Error(`Invalid greeter type: ${type}`);
  }

  const config = await loadGuildFeature(guildId, "greeter", GREETER_DEFAULTS, normalizeGreeter);
  const key = type === "welcome" ? "welcomeMessage" : "leaveMessage";
  config[key] = sanitizeMessage(message);
  return cloneConfig(config);
}

export async function sendWelcomeGreeting(member, logger) {
  const config = await getGreeterConfig(member.guild.id);
  await sendGreeterMessage({
    guild: member.guild,
    user: member.user,
    type: "welcome",
    channelId: config.welcomeChannelId,
    template: config.welcomeMessage,
    logger,
  });
}

export async function sendLeaveGreeting(member, logger) {
  const config = await getGreeterConfig(member.guild.id);
  await sendGreeterMessage({
    guild: member.guild,
    user: member.user,
    type: "leave",
    channelId: config.leaveChannelId,
    template: config.leaveMessage,
    logger,
  });
}
