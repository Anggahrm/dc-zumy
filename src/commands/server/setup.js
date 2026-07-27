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
import { registerStrings } from "#services/i18n.js";
import { setLoggingChannel, setLoggingEvent } from "#services/logging.js";
import { createCard, replyError } from "#utils/respond.js";

const PREFIX = "setup:";

const STEPS = ["log", "welcome", "leave", "autorole", "automod"];

registerStrings("setup", {
  en: {
    step_log_title: "Step 1/5 — Log channel",
    step_log_body: "Where should moderation and server logs go? This also turns on the most-used log events.",
    step_log_label: "Log channel",
    step_welcome_title: "Step 2/5 — Welcome channel",
    step_welcome_body: "Where should new members be greeted? (Customize the message later with `/set welcome-message`.)",
    step_welcome_label: "Welcome channel",
    step_leave_title: "Step 3/5 — Leave channel",
    step_leave_body: "Where should leave messages go?",
    step_leave_label: "Leave channel",
    step_autorole_title: "Step 4/5 — Autorole",
    step_autorole_body: "Pick a role every new member should receive automatically.",
    step_autorole_label: "Autorole",
    step_automod_title: "Step 5/5 — Automod",
    step_automod_body: "Turn on the recommended automod preset?\n- Anti-invite links: on\n- Mention spam: 8+ mentions\n- Message spam: 6 msgs / 5s, duplicates x4\n-# Fine-tune anytime with `/automod`.",
    step_automod_label: "Automod",
    wizard_title: "Setup — {title}",
    pick_channel_placeholder: "Pick a channel...",
    pick_role_placeholder: "Pick a role...",
    enable_preset: "Turn it on",
    no_thanks: "No thanks",
    skip: "Skip",
    summary_title: "Setup complete",
    summary_next: "Next steps worth a look: `/rolemenu`, `/levelconfig toggle`, `/starboard channel`, `/ticket panel`, `/joinguard`.\nRun `/diagnose` anytime to check your setup.",
    need_manage_server: "You need **Manage Server** for setup.",
    progress_skipped: "- {label}: skipped",
    progress_log: "- Log channel: <#{channel_id}> (core log events turned on)",
    progress_welcome: "- Welcome channel: <#{channel_id}>",
    progress_leave: "- Leave channel: <#{channel_id}>",
    autorole_invalid: "I can't give out that role — it's @everyone, managed by an integration, or above my highest role. Pick another.",
    progress_autorole: "- Autorole: <@&{role_id}>",
    progress_automod_on: "- Automod: recommended preset turned on",
    progress_automod_off: "- Automod: left off",
  },
  id: {
    step_log_title: "Langkah 1/5 — Channel log",
    step_log_body: "Ke mana log moderasi dan server dikirim? Ini juga menyalakan event log yang paling sering dipakai.",
    step_log_label: "Channel log",
    step_welcome_title: "Langkah 2/5 — Channel welcome",
    step_welcome_body: "Di mana member baru disambut? (Pesannya bisa diubah nanti lewat `/set welcome-message`.)",
    step_welcome_label: "Channel welcome",
    step_leave_title: "Langkah 3/5 — Channel leave",
    step_leave_body: "Ke mana pesan perpisahan dikirim?",
    step_leave_label: "Channel leave",
    step_autorole_title: "Langkah 4/5 — Autorole",
    step_autorole_body: "Pilih role yang otomatis diberikan ke setiap member baru.",
    step_autorole_label: "Autorole",
    step_automod_title: "Langkah 5/5 — Automod",
    step_automod_body: "Nyalakan preset automod yang direkomendasikan?\n- Anti-link invite: aktif\n- Spam mention: 8+ mention\n- Spam pesan: 6 pesan / 5 detik, duplikat x4\n-# Bisa diatur lebih detail kapan saja lewat `/automod`.",
    step_automod_label: "Automod",
    wizard_title: "Setup — {title}",
    pick_channel_placeholder: "Pilih channel...",
    pick_role_placeholder: "Pilih role...",
    enable_preset: "Nyalakan",
    no_thanks: "Tidak usah",
    skip: "Lewati",
    summary_title: "Setup selesai",
    summary_next: "Langkah berikutnya yang layak dicek: `/rolemenu`, `/levelconfig toggle`, `/starboard channel`, `/ticket panel`, `/joinguard`.\nJalankan `/diagnose` kapan saja untuk mengecek pengaturanmu.",
    need_manage_server: "Kamu butuh permission **Manage Server** untuk setup.",
    progress_skipped: "- {label}: dilewati",
    progress_log: "- Channel log: <#{channel_id}> (event log inti dinyalakan)",
    progress_welcome: "- Channel welcome: <#{channel_id}>",
    progress_leave: "- Channel leave: <#{channel_id}>",
    autorole_invalid: "Aku tidak bisa memberikan role itu — @everyone, dikelola integrasi, atau di atas role tertinggiku. Pilih yang lain.",
    progress_autorole: "- Autorole: <@&{role_id}>",
    progress_automod_on: "- Automod: preset rekomendasi dinyalakan",
    progress_automod_off: "- Automod: dibiarkan mati",
  },
});

const STEP_META = {
  log: { title: "setup.step_log_title", body: "setup.step_log_body", label: "setup.step_log_label", kind: "channel" },
  welcome: { title: "setup.step_welcome_title", body: "setup.step_welcome_body", label: "setup.step_welcome_label", kind: "channel" },
  leave: { title: "setup.step_leave_title", body: "setup.step_leave_body", label: "setup.step_leave_label", kind: "channel" },
  autorole: { title: "setup.step_autorole_title", body: "setup.step_autorole_body", label: "setup.step_autorole_label", kind: "role" },
  automod: { title: "setup.step_automod_title", body: "setup.step_automod_body", label: "setup.step_automod_label", kind: "confirm" },
};

function stepComponents(t, step) {
  const meta = STEP_META[step];
  const rows = [];

  if (meta.kind === "channel") {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`${PREFIX}${step}`)
          .setPlaceholder(t("setup.pick_channel_placeholder"))
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
    );
  } else if (meta.kind === "role") {
    rows.push(
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId(`${PREFIX}${step}`).setPlaceholder(t("setup.pick_role_placeholder")),
      ),
    );
  }

  const buttons = [];
  if (meta.kind === "confirm") {
    buttons.push(
      new ButtonBuilder().setCustomId(`${PREFIX}${step}:on`).setLabel(t("setup.enable_preset")).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${PREFIX}${step}:off`).setLabel(t("setup.no_thanks")).setStyle(ButtonStyle.Secondary),
    );
  } else {
    buttons.push(
      new ButtonBuilder().setCustomId(`${PREFIX}skip:${step}`).setLabel(t("setup.skip")).setStyle(ButtonStyle.Secondary),
    );
  }
  rows.push(new ActionRowBuilder().addComponents(buttons));

  return rows;
}

function stepPayload(t, step) {
  const meta = STEP_META[step];
  return {
    components: [
      createCard({ color: 0x5865f2, title: t("setup.wizard_title", { title: t(meta.title) }), body: t(meta.body) }),
      ...stepComponents(t, step),
    ],
  };
}

function summaryPayload(t, lines) {
  return {
    components: [
      createCard({
        color: 0x57f287,
        title: t("setup.summary_title"),
        body: [
          ...lines,
          "",
          t("setup.summary_next"),
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
  category: "server",
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
  async onComponent({ interaction, t }) {
    if (!interaction.customId.startsWith(PREFIX)) return false;
    const guild = interaction.guild;
    if (!guild) return false;

    // The wizard is ephemeral, but re-check anyway.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await replyError(interaction, t("setup.need_manage_server"));
      return true;
    }

    const parts = interaction.customId.slice(PREFIX.length).split(":");
    const guildId = guild.id;

    let step;
    if (parts[0] === "skip") {
      step = parts[1];
      pushProgress(interaction, t("setup.progress_skipped", { label: t(STEP_META[step].label) }));
    } else {
      step = parts[0];

      if (step === "log" && interaction.isChannelSelectMenu()) {
        const channelId = interaction.values[0];
        await setLoggingChannel(guildId, channelId);
        for (const key of ["deleted_messages", "edited_messages", "joins", "leaves", "bans", "cases", "automod"]) {
          await setLoggingEvent(guildId, key, true);
        }
        pushProgress(interaction, t("setup.progress_log", { channel_id: channelId }));
      } else if ((step === "welcome" || step === "leave") && interaction.isChannelSelectMenu()) {
        const channelId = interaction.values[0];
        await setGreeterChannel(guildId, step, channelId);
        pushProgress(interaction, t(step === "welcome" ? "setup.progress_welcome" : "setup.progress_leave", { channel_id: channelId }));
      } else if (step === "autorole" && interaction.isRoleSelectMenu()) {
        const roleId = interaction.values[0];
        const role = guild.roles.cache.get(roleId);
        const me = guild.members.me;
        if (!role || role.managed || role.id === guild.id || (me && role.position >= me.roles.highest.position)) {
          await replyError(interaction, t("setup.autorole_invalid"));
          return true;
        }
        await addAutoroleRole(guildId, roleId);
        pushProgress(interaction, t("setup.progress_autorole", { role_id: roleId }));
      } else if (step === "automod" && interaction.isButton()) {
        const enable = parts[1] === "on";
        if (enable) {
          await updateAutomodConfig(guildId, (config) => {
            config.antiInvite = true;
            config.mentionLimit = 8;
            config.spamEnabled = true;
          });
          pushProgress(interaction, t("setup.progress_automod_on"));
        } else {
          pushProgress(interaction, t("setup.progress_automod_off"));
        }
      } else {
        return false;
      }
    }

    const next = nextStep(step);
    if (next) {
      await interaction.update(stepPayload(t, next));
    } else {
      const key = progressKey(interaction);
      const lines = progress.get(key) ?? [];
      progress.delete(key);
      await interaction.update(summaryPayload(t, lines));
    }
    return true;
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for setup command.");
    }

    progress.delete(progressKey(interaction));
    await interaction.reply({
      ...stepPayload(ctx.t, STEPS[0]),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};
