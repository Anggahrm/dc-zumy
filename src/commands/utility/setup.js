import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { addAutoroleRole } from "#services/autorole.js";
import { updateAutomodConfig } from "#services/automod.js";
import { setGreeterChannel } from "#services/greeter.js";
import { setLoggingChannel, setLoggingEvent } from "#services/logging.js";
import { createCard, replyError } from "#utils/respond.js";

const PREFIX = "setup:";

const STEPS = ["log", "welcome", "leave", "autorole", "automod"];

const STEP_META = {
  log: {
    title: "Step 1/5 — Log channel",
    body: "Where should moderation and server logs go? This also enables the most-used log events.",
    kind: "channel",
  },
  welcome: {
    title: "Step 2/5 — Welcome channel",
    body: "Where should new members be greeted? (Customize the message later with `/set welcome-message`.)",
    kind: "channel",
  },
  leave: {
    title: "Step 3/5 — Leave channel",
    body: "Where should leave messages go?",
    kind: "channel",
  },
  autorole: {
    title: "Step 4/5 — Autorole",
    body: "Pick a role every new member should receive automatically.",
    kind: "role",
  },
  automod: {
    title: "Step 5/5 — Automod",
    body: [
      "Enable the recommended automod preset?",
      "- Anti-invite links: on",
      "- Mention spam: 8+ mentions",
      "- Message spam: 6 msgs / 5s, duplicates x4",
      "-# Fine-tune anytime with `/automod`.",
    ].join("\n"),
    kind: "confirm",
  },
};

function stepComponents(step) {
  const meta = STEP_META[step];
  const rows = [];

  if (meta.kind === "channel") {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`${PREFIX}${step}`)
          .setPlaceholder("Pick a channel...")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
    );
  } else if (meta.kind === "role") {
    rows.push(
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId(`${PREFIX}${step}`).setPlaceholder("Pick a role..."),
      ),
    );
  }

  const buttons = [];
  if (meta.kind === "confirm") {
    buttons.push(
      new ButtonBuilder().setCustomId(`${PREFIX}${step}:on`).setLabel("Enable preset").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${PREFIX}${step}:off`).setLabel("No thanks").setStyle(ButtonStyle.Secondary),
    );
  } else {
    buttons.push(
      new ButtonBuilder().setCustomId(`${PREFIX}skip:${step}`).setLabel("Skip").setStyle(ButtonStyle.Secondary),
    );
  }
  rows.push(new ActionRowBuilder().addComponents(buttons));

  return rows;
}

function stepPayload(step) {
  const meta = STEP_META[step];
  return {
    components: [
      createCard({ color: 0x5865f2, title: `⚙️ Setup — ${meta.title}`, body: meta.body }),
      ...stepComponents(step),
    ],
  };
}

function summaryPayload(lines) {
  return {
    components: [
      createCard({
        color: 0x57f287,
        title: "⚙️ Setup complete",
        body: [
          ...lines,
          "",
          "Next steps worth a look: `/rolemenu`, `/levelconfig toggle`, `/starboard channel`, `/ticket panel`, `/joinguard`.",
          "Run `/diagnose` anytime to health-check the configuration.",
        ].join("\n"),
      }),
    ],
  };
}

function nextStep(step) {
  const index = STEPS.indexOf(step);
  return index >= 0 && index < STEPS.length - 1 ? STEPS[index + 1] : null;
}

// Wizard progress lives in-memory per admin (bounded); a restart mid-wizard
// just means a shorter summary at the end.
const progress = new Map();

function progressKey(interaction) {
  return `${interaction.guildId}:${interaction.user.id}`;
}

function pushProgress(interaction, line) {
  const key = progressKey(interaction);
  const lines = progress.get(key) ?? [];
  lines.push(line);
  progress.set(key, lines);
  if (progress.size > 500) {
    const oldest = progress.keys().next().value;
    progress.delete(oldest);
  }
  return lines;
}

export default {
  category: "utility",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Guided first-time setup (2 minutes)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild),
  async onComponent({ interaction }) {
    if (!interaction.customId.startsWith(PREFIX)) return false;
    const guild = interaction.guild;
    if (!guild) return false;

    // The wizard is ephemeral, but re-check anyway.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await replyError(interaction, "You need **Manage Server** for setup.");
      return true;
    }

    const parts = interaction.customId.slice(PREFIX.length).split(":");
    const guildId = guild.id;

    let step;
    if (parts[0] === "skip") {
      step = parts[1];
      pushProgress(interaction, `▫️ ${STEP_META[step].title.split("— ")[1]}: skipped`);
    } else {
      step = parts[0];

      if (step === "log" && interaction.isChannelSelectMenu()) {
        const channelId = interaction.values[0];
        await setLoggingChannel(guildId, channelId);
        for (const key of ["deleted_messages", "edited_messages", "joins", "leaves", "bans", "cases", "automod"]) {
          await setLoggingEvent(guildId, key, true);
        }
        pushProgress(interaction, `✅ Log channel: <#${channelId}> (core events enabled)`);
      } else if ((step === "welcome" || step === "leave") && interaction.isChannelSelectMenu()) {
        const channelId = interaction.values[0];
        await setGreeterChannel(guildId, step, channelId);
        pushProgress(interaction, `✅ ${step === "welcome" ? "Welcome" : "Leave"} channel: <#${channelId}>`);
      } else if (step === "autorole" && interaction.isRoleSelectMenu()) {
        const roleId = interaction.values[0];
        const role = guild.roles.cache.get(roleId);
        const me = guild.members.me;
        if (!role || role.managed || role.id === guild.id || (me && role.position >= me.roles.highest.position)) {
          await replyError(interaction, "That role can't be auto-assigned (managed, @everyone, or above my highest role). Pick another.");
          return true;
        }
        await addAutoroleRole(guildId, roleId);
        pushProgress(interaction, `✅ Autorole: <@&${roleId}>`);
      } else if (step === "automod" && interaction.isButton()) {
        const enable = parts[1] === "on";
        if (enable) {
          await updateAutomodConfig(guildId, (config) => {
            config.antiInvite = true;
            config.mentionLimit = 8;
            config.spamEnabled = true;
          });
          pushProgress(interaction, "✅ Automod: recommended preset enabled");
        } else {
          pushProgress(interaction, "▫️ Automod: left off");
        }
      } else {
        return false;
      }
    }

    const next = nextStep(step);
    if (next) {
      await interaction.update(stepPayload(next));
    } else {
      const key = progressKey(interaction);
      const lines = progress.get(key) ?? [];
      progress.delete(key);
      await interaction.update(summaryPayload(lines));
    }
    return true;
  },
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for setup command.");
    }

    progress.delete(progressKey(interaction));
    await interaction.reply({
      ...stepPayload(STEPS[0]),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};
