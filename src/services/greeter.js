import {
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { formatError } from "#utils/error.js";
import { guildFeatureUtils, loadGuildFeature } from "#services/guild-config.js";
import { getGuildLanguage, translate } from "#services/i18n.js";
import { generateGreeterCard } from "#services/welcome-card.js";
import { formatDiscordTimestamp } from "#utils/time.js";

export const GREETER_MESSAGE_MAX_LENGTH = 500;

const GREETER_DEFAULTS = {
  welcomeChannelId: null,
  leaveChannelId: null,
  welcomeMessage: null,
  leaveMessage: null,
  cardEnabled: false,
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
  if (typeof config.cardEnabled !== "boolean") config.cardEnabled = false;
}

function cloneConfig(config) {
  return {
    welcomeChannelId: config.welcomeChannelId,
    leaveChannelId: config.leaveChannelId,
    welcomeMessage: config.welcomeMessage,
    leaveMessage: config.leaveMessage,
    cardEnabled: config.cardEnabled,
  };
}

export async function setGreeterCardEnabled(guildId, enabled) {
  const config = await loadGuildFeature(guildId, "greeter", GREETER_DEFAULTS, normalizeGreeter);
  config.cardEnabled = Boolean(enabled);
  return cloneConfig(config);
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

function createGreeterCard({ type, guild, user, template, language = "en", imageAttachmentName = null }) {
  const isWelcome = type === "welcome";
  const color = isWelcome ? 0x57f287 : 0xed4245;
  const title = isWelcome ? "Welcome To Server" : "Leave From Server";
  const unixCreatedAt = Math.floor(user.createdTimestamp / 1000);
  const avatarUrl = user.displayAvatarURL({ extension: "png", size: 1024 });

  const description = template
    ? renderGreeterTemplate(template, { user, guild })
    : translate(language, isWelcome ? "greeter.welcome_default" : "greeter.leave_default", {
      user: `<@${user.id}>`,
      server: guild.name,
    });

  const headline = new TextDisplayBuilder().setContent([
    `## ${title}`,
    description,
  ].join("\n"));

  if (imageAttachmentName) {
    return new ContainerBuilder()
      .setAccentColor(color)
      .addTextDisplayComponents(headline)
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(`attachment://${imageAttachmentName}`)
            .setDescription(`${user.tag} greeter card`),
        ),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${formatFooterTimestamp(new Date())}`),
      );
  }

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

async function sendGreeterMessage({ guild, user, type, channelId, template, cardEnabled, logger }) {
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

  const files = [];
  let imageAttachmentName = null;
  if (cardEnabled) {
    try {
      const image = await generateGreeterCard({
        type,
        username: user.username ?? user.tag ?? user.id,
        avatarUrl: user.displayAvatarURL({ extension: "png", size: 256 }),
        guildName: guild.name,
        memberCount: guild.memberCount,
      });
      if (image) {
        imageAttachmentName = "greeter-card.png";
        files.push(new AttachmentBuilder(image, { name: imageAttachmentName }));
      }
    } catch (error) {
      logger?.warn("Greeter card render failed, falling back to text", {
        guildId: guild.id,
        message: error?.message || String(error),
      });
    }
  }

  const card = createGreeterCard({
    type,
    guild,
    user,
    template,
    language: await getGuildLanguage(guild.id),
    imageAttachmentName,
  });

  try {
    await channel.send({
      components: [card],
      files,
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

// Builds the exact payload a real greeting would send, for /set test. The
// attachment name must be unique when multiple previews share one message.
export async function buildGreeterPreview({ guild, user, type }) {
  const config = await getGreeterConfig(guild.id);
  const template = type === "welcome" ? config.welcomeMessage : config.leaveMessage;

  const files = [];
  let imageAttachmentName = null;
  if (config.cardEnabled) {
    const image = await generateGreeterCard({
      type,
      username: user.username ?? user.tag ?? user.id,
      avatarUrl: user.displayAvatarURL({ extension: "png", size: 256 }),
      guildName: guild.name,
      memberCount: guild.memberCount,
    }).catch(() => null);
    if (image) {
      imageAttachmentName = `greeter-${type}.png`;
      files.push(new AttachmentBuilder(image, { name: imageAttachmentName }));
    }
  }

  const card = createGreeterCard({
    type,
    guild,
    user,
    template,
    language: await getGuildLanguage(guild.id),
    imageAttachmentName,
  });

  return { components: [card], files };
}

export async function sendWelcomeGreeting(member, logger) {
  const config = await getGreeterConfig(member.guild.id);
  await sendGreeterMessage({
    guild: member.guild,
    user: member.user,
    type: "welcome",
    channelId: config.welcomeChannelId,
    template: config.welcomeMessage,
    cardEnabled: config.cardEnabled,
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
    cardEnabled: config.cardEnabled,
    logger,
  });
}
