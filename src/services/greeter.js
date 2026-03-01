import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { formatError } from "#utils/error.js";
import { PROJECT_ROOT } from "#utils/paths.js";

const STORE_PATH = path.join(PROJECT_ROOT, "data", "greeter.json");
let mutationQueue = Promise.resolve();

function sanitizeChannelId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeGuildConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {
      welcomeChannelId: null,
      leaveChannelId: null,
    };
  }

  return {
    welcomeChannelId: sanitizeChannelId(config.welcomeChannelId),
    leaveChannelId: sanitizeChannelId(config.leaveChannelId),
  };
}

function normalizeDb(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { guilds: {} };
  }

  const guilds = {};
  const source = raw.guilds;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    for (const [guildId, config] of Object.entries(source)) {
      if (!guildId) continue;
      guilds[guildId] = normalizeGuildConfig(config);
    }
  }

  return { guilds };
}

function cloneConfig(config) {
  return {
    welcomeChannelId: config.welcomeChannelId,
    leaveChannelId: config.leaveChannelId,
  };
}

async function readDb() {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return normalizeDb(JSON.parse(raw));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { guilds: {} };
    }
    throw error;
  }
}

async function writeDb(db) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function ensureGuildConfig(db, guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      welcomeChannelId: null,
      leaveChannelId: null,
    };
  } else {
    db.guilds[guildId] = normalizeGuildConfig(db.guilds[guildId]);
  }
  return db.guilds[guildId];
}

function runMutation(task) {
  const pending = mutationQueue.then(task, task);
  mutationQueue = pending.catch(() => {});
  return pending;
}

function formatFooterTimestamp(now = new Date()) {
  const timeOnly = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const fullDate = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const targetStart = new Date(now);
  targetStart.setHours(0, 0, 0, 0);

  const daysDiff = Math.floor((todayStart.getTime() - targetStart.getTime()) / 86_400_000);
  if (daysDiff === 0) {
    return timeOnly.format(now);
  }
  if (daysDiff === 1) {
    return `Yesterday ${timeOnly.format(now)}`;
  }
  return fullDate.format(now);
}

function createGreeterCard({ type, guildName, user }) {
  const isWelcome = type === "welcome";
  const color = isWelcome ? 0x57f287 : 0xed4245;
  const title = isWelcome ? "Welcome To Server" : "Leave From Server";
  const unixCreatedAt = Math.floor(user.createdTimestamp / 1000);
  const avatarUrl = user.displayAvatarURL({ extension: "png", size: 1024 });

  const description = isWelcome
    ? `Hi <@${user.id}> Welcome to ${guildName}, Have a nice day`
    : `Bye <@${user.id}> from ${guildName}, Have a nice day`;

  const headline = new TextDisplayBuilder().setContent(
    [
      `## ${title}`,
      description,
    ].join("\n"),
  );

  const detailsSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "**Details Info**",
          `Username : ${user.tag}`,
          `UserID : ${user.id}`,
          `Since at : <t:${unixCreatedAt}:F>`,
        ].join("\n"),
      ),
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

async function sendGreeterMessage({ guild, user, type, channelId, logger }) {
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
    guildName: guild.name,
    user,
  });

  try {
    await channel.send({
      components: [card],
      flags: MessageFlags.IsComponentsV2,
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
  const db = await readDb();
  return normalizeGuildConfig(db.guilds[guildId]);
}

export async function setGreeterChannel(guildId, type, channelId) {
  if (!["welcome", "leave"].includes(type)) {
    throw new Error(`Invalid greeter type: ${type}`);
  }

  return runMutation(async () => {
    const db = await readDb();
    const config = ensureGuildConfig(db, guildId);
    const key = type === "welcome" ? "welcomeChannelId" : "leaveChannelId";
    config[key] = sanitizeChannelId(channelId);
    await writeDb(db);
    return cloneConfig(config);
  });
}

export async function sendWelcomeGreeting(member, logger) {
  const config = await getGreeterConfig(member.guild.id);
  await sendGreeterMessage({
    guild: member.guild,
    user: member.user,
    type: "welcome",
    channelId: config.welcomeChannelId,
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
    logger,
  });
}
