import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { getJoinguardConfig, JOINGUARD_ACTIONS, updateJoinguardConfig } from "#services/joinguard.js";
import { getModConfig } from "#services/mod-config.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("joinguard", {
  en: {
    title: "Join Guard",
    current_settings: "**Current settings**",
    age_line_on: "Account age gate: **on** — minimum **{hours}h**",
    age_line_off: "Account age gate: **off**",
    surge_line_on: "Join-surge detection: **on** — **{joins}** joins per **{window}s**",
    surge_line_off: "Join-surge detection: **off**",
    line_action: "- Action: **{action}**",
    actions_footer: "-# Actions: alert (log only), kick, quarantine (needs a `/quarantine role`), ban. Actions show up in the `automod` log event and as cases.",
    age_set: "Accounts younger than **{hours}h** now trigger the **{action}** action.",
    age_disabled: "The account age gate is off.",
    surge_set: "**{joins}+** joins within **{window}s** now trigger the **{action}** action.",
    surge_disabled: "Join-surge detection is off.",
    action_set: "Flagged joiners will now be handled with: **{action}**.{warning}",
    quarantine_warning: "\n-# No quarantine role set yet — flagged joins will only send an alert. Set one with `/quarantine role`.",
  },
  id: {
    title: "Join Guard",
    current_settings: "**Pengaturan saat ini**",
    age_line_on: "Filter umur akun: **aktif** — minimal **{hours} jam**",
    age_line_off: "Filter umur akun: **nonaktif**",
    surge_line_on: "Deteksi lonjakan join: **aktif** — **{joins}** join per **{window} detik**",
    surge_line_off: "Deteksi lonjakan join: **nonaktif**",
    line_action: "- Aksi: **{action}**",
    actions_footer: "-# Aksi: alert (hanya log), kick, quarantine (butuh role dari `/quarantine role`), ban. Semua aksi muncul di log event `automod` dan tercatat sebagai case.",
    age_set: "Akun yang umurnya di bawah **{hours} jam** sekarang memicu aksi **{action}**.",
    age_disabled: "Filter umur akun dimatikan.",
    surge_set: "**{joins}+** join dalam **{window} detik** sekarang memicu aksi **{action}**.",
    surge_disabled: "Deteksi lonjakan join dimatikan.",
    action_set: "Join yang terdeteksi sekarang akan ditangani dengan aksi: **{action}**.{warning}",
    quarantine_warning: "\n-# Belum ada role quarantine — join yang terdeteksi cuma akan mengirim alert. Atur dulu lewat `/quarantine role`.",
  },
});

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("joinguard.title"), body });
}

function configLines(config, t) {
  return [
    t("joinguard.current_settings"),
    config.minAccountAgeHours > 0
      ? t("joinguard.age_line_on", { hours: config.minAccountAgeHours })
      : t("joinguard.age_line_off"),
    config.surgeCount > 0
      ? t("joinguard.surge_line_on", { joins: config.surgeCount, window: config.surgeWindowSeconds })
      : t("joinguard.surge_line_off"),
    t("joinguard.line_action", { action: config.action }),
    "",
    t("joinguard.actions_footer"),
  ];
}

export default {
  category: "automod",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("joinguard")
    .setDescription("Protect against raids and throwaway accounts")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub.setName("show").setDescription("Show join guard settings"))
    .addSubcommand((sub) =>
      sub
        .setName("age")
        .setDescription("Require a minimum account age to join (0 turns it off)")
        .addIntegerOption((option) =>
          option
            .setName("hours")
            .setDescription("Minimum account age in hours (0-2160)")
            .setMinValue(0)
            .setMaxValue(24 * 90)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("surge")
        .setDescription("Detect join surges (0 turns it off)")
        .addIntegerOption((option) =>
          option
            .setName("joins")
            .setDescription("Joins that count as a surge (0-100)")
            .setMinValue(0)
            .setMaxValue(100)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("window")
            .setDescription("Window in seconds (5-300, default 30)")
            .setMinValue(5)
            .setMaxValue(300)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("action")
        .setDescription("What happens to flagged joiners")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action")
            .addChoices(...JOINGUARD_ACTIONS.map((action) => ({ name: action, value: action })))
            .setRequired(true),
        ),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for joinguard command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      const config = await getJoinguardConfig(guildId);
      await replyCard(
        interaction,
        createCard({ color: 0x3498db, title: ctx.t("joinguard.title"), body: configLines(config, ctx.t).join("\n") }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "age") {
      const hours = interaction.options.getInteger("hours", true);
      const config = await updateJoinguardConfig(guildId, (c) => {
        c.minAccountAgeHours = hours;
      });
      await replyCard(
        interaction,
        successCard(
          ctx.t,
          hours > 0
            ? ctx.t("joinguard.age_set", { hours, action: config.action })
            : ctx.t("joinguard.age_disabled"),
        ),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "surge") {
      const joins = interaction.options.getInteger("joins", true);
      const window = interaction.options.getInteger("window");
      const config = await updateJoinguardConfig(guildId, (c) => {
        c.surgeCount = joins;
        if (window != null) c.surgeWindowSeconds = window;
      });
      await replyCard(
        interaction,
        successCard(
          ctx.t,
          joins > 0
            ? ctx.t("joinguard.surge_set", { joins: config.surgeCount, window: config.surgeWindowSeconds, action: config.action })
            : ctx.t("joinguard.surge_disabled"),
        ),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "action") {
      const action = interaction.options.getString("action", true);
      await updateJoinguardConfig(guildId, (c) => {
        c.action = action;
      });

      let warning = "";
      if (action === "quarantine") {
        const { quarantineRoleId } = await getModConfig(guildId);
        if (!quarantineRoleId || !guild.roles.cache.has(quarantineRoleId)) {
          warning = ctx.t("joinguard.quarantine_warning");
        }
      }

      await replyCard(
        interaction,
        successCard(ctx.t, ctx.t("joinguard.action_set", { action, warning })),
        { ephemeral: true },
      );
    }
  },
};
