import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getRolepersistConfig, setRolepersistEnabled } from "#services/rolepersist.js";
import { createCard, replyCard } from "#utils/respond.js";

export default {
  category: "moderation",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("rolepersist")
    .setDescription("Restore members' roles when they rejoin")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("toggle")
        .setDescription("Enable or disable role persistence")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Enable role persist").setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("show").setDescription("Show role persist status")),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for rolepersist command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "toggle") {
      const enabled = interaction.options.getBoolean("enabled", true);
      await setRolepersistEnabled(guildId, enabled);
      await replyCard(
        interaction,
        createCard({
          color: enabled ? 0x57f287 : 0xf1c40f,
          title: "Role Persist",
          body: enabled
            ? [
              "Role persist is now ✅ **enabled**.",
              "- Members who leave get their roles snapshotted and restored on rejoin.",
              "- This also stops mute evasion: the mute role comes back with them.",
            ].join("\n")
            : "Role persist is now ❌ **disabled**. Stored snapshots were cleared.",
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "show") {
      const config = await getRolepersistConfig(guildId);
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Role Persist",
          body: [
            `- Status: ${config.enabled ? "✅ enabled" : "❌ disabled"}`,
            `- Stored snapshots: **${config.snapshotCount}**`,
          ].join("\n"),
        }),
        { ephemeral: true },
      );
    }
  },
};
