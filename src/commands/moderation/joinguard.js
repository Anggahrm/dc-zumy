import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getJoinguardConfig, JOINGUARD_ACTIONS, updateJoinguardConfig } from "#services/joinguard.js";
import { getModConfig } from "#services/mod-config.js";
import { createCard, replyCard } from "#utils/respond.js";

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Join Guard", body });
}

function configLines(config) {
  return [
    "**Current settings**",
    `${config.minAccountAgeHours > 0 ? "✅" : "❌"} Account age gate${config.minAccountAgeHours > 0 ? ` — minimum **${config.minAccountAgeHours}h**` : ""}`,
    `${config.surgeCount > 0 ? "✅" : "❌"} Join-surge detection${config.surgeCount > 0 ? ` — **${config.surgeCount}** joins per **${config.surgeWindowSeconds}s**` : ""}`,
    `- Action: **${config.action}**`,
    "",
    "-# Actions: alert (log only), kick, quarantine (needs /quarantine role), ban. Actions are logged to the `automod` log event and recorded as cases.",
  ];
}

export default {
  category: "moderation",
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
        .setDescription("Require a minimum account age to join (0 disables)")
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
        .setDescription("Detect join surges (0 disables)")
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
        createCard({ color: 0x3498db, title: "Join Guard", body: configLines(config).join("\n") }),
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
          hours > 0
            ? `Accounts younger than **${hours}h** now trigger the **${config.action}** action.`
            : "Account age gate disabled.",
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
          joins > 0
            ? `**${config.surgeCount}+** joins within **${config.surgeWindowSeconds}s** now trigger the **${config.action}** action.`
            : "Join-surge detection disabled.",
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
          warning = "\n-# ⚠️ No quarantine role configured — flagged joins will fall back to alert. Set one with `/quarantine role`.";
        }
      }

      await replyCard(
        interaction,
        successCard(`Flagged joiners will now be handled with: **${action}**.${warning}`),
        { ephemeral: true },
      );
    }
  },
};
