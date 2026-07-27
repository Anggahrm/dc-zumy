import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { getRolepersistConfig, setRolepersistEnabled } from "#services/rolepersist.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("rolepersist", {
  en: {
    title: "Role Persist",
    enabled_body: "Role persist is now **on**.\n- When members leave, their roles are saved and given back when they rejoin.\n- This also stops mute evasion: the mute role comes back with them.",
    disabled_body: "Role persist is now **off**. The saved roles were deleted.",
    status_line: "- Status: {status}",
    status_enabled: "on",
    status_disabled: "off",
    snapshots_line: "- Members with saved roles: **{count}**",
  },
  id: {
    title: "Role Persist",
    enabled_body: "Role persist sekarang **aktif**.\n- Saat member keluar, role-nya disimpan dan dikembalikan saat mereka join lagi.\n- Ini juga mencegah kabur dari mute: role mute-nya ikut balik bareng mereka.",
    disabled_body: "Role persist sekarang **nonaktif**. Role yang tersimpan sudah dihapus.",
    status_line: "- Status: {status}",
    status_enabled: "aktif",
    status_disabled: "nonaktif",
    snapshots_line: "- Member dengan role tersimpan: **{count}**",
  },
});

export default {
  category: "roles",
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
        .setDescription("Turn role persist on or off")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Turn role persist on or off").setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("show").setDescription("Show role persist status")),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for rolepersist command.");
    }

    const t = ctx.t;
    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "toggle") {
      const enabled = interaction.options.getBoolean("enabled", true);
      await setRolepersistEnabled(guildId, enabled);
      await replyCard(
        interaction,
        createCard({
          color: enabled ? 0x57f287 : 0xf1c40f,
          title: t("rolepersist.title"),
          body: enabled
            ? t("rolepersist.enabled_body")
            : t("rolepersist.disabled_body"),
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
          title: t("rolepersist.title"),
          body: [
            t("rolepersist.status_line", {
              status: config.enabled ? t("rolepersist.status_enabled") : t("rolepersist.status_disabled"),
            }),
            t("rolepersist.snapshots_line", { count: config.snapshotCount }),
          ].join("\n"),
        }),
        { ephemeral: true },
      );
    }
  },
};
