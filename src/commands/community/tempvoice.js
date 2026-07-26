import { ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { getTempvoiceConfig, setTempvoiceTrigger } from "#services/tempvoice.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("tempvoice", {
  en: {
    title: "Temp Voice",
    create_failed: "I couldn't create the trigger channel. I need **Manage Channels**.",
    enabled: "Join-to-create enabled: **{channel}**",
    enabled_line_spawn: "- Joining it spawns a personal voice channel (creator can rename/manage it).",
    enabled_line_cleanup: "- Channels are deleted automatically when everyone leaves.",
    disabled: "Temp voice disabled. Existing temp channels clean up as they empty.",
    show_trigger: "- Trigger: {trigger}",
    show_trigger_disabled: "(disabled)",
    show_active: "- Active temp channels: **{count}**",
  },
  id: {
    title: "Temp Voice",
    create_failed: "Aku tidak bisa membuat channel trigger-nya. Aku butuh permission **Manage Channels**.",
    enabled: "Join-to-create aktif: **{channel}**",
    enabled_line_spawn: "- Kalau ada yang join, voice channel pribadi langsung dibuat (pembuatnya bisa rename/mengaturnya).",
    enabled_line_cleanup: "- Channel dihapus otomatis saat semua orang keluar.",
    disabled: "Temp voice dimatikan. Temp channel yang masih ada akan terhapus sendiri saat kosong.",
    show_trigger: "- Trigger: {trigger}",
    show_trigger_disabled: "(nonaktif)",
    show_active: "- Temp channel aktif: **{count}**",
  },
});

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("tempvoice.title"), body });
}

export default {
  category: "community",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageChannels],
  },
  data: new SlashCommandBuilder()
    .setName("tempvoice")
    .setDescription("Join-to-create temporary voice channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("trigger")
        .setDescription("Set the join-to-create channel (empty creates one)")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Existing voice channel to use as trigger")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName("off").setDescription("Disable temp voice channels"))
    .addSubcommand((sub) => sub.setName("show").setDescription("Show temp voice status")),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for tempvoice command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "trigger") {
      let channel = interaction.options.getChannel("channel");

      if (!channel) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        channel = await guild.channels
          .create({
            name: "➕ Join to Create",
            type: ChannelType.GuildVoice,
            reason: `Temp voice trigger by ${interaction.user.tag}`,
          })
          .catch(() => null);

        if (!channel) {
          await replyCard(
            interaction,
            createCard({
              color: 0xed4245,
              title: ctx.t("tempvoice.title"),
              body: ctx.t("tempvoice.create_failed"),
            }),
            { ephemeral: true },
          );
          return;
        }
      }

      await setTempvoiceTrigger(guildId, channel.id);
      await replyCard(
        interaction,
        successCard(ctx.t, [
          ctx.t("tempvoice.enabled", { channel: channel.name }),
          ctx.t("tempvoice.enabled_line_spawn"),
          ctx.t("tempvoice.enabled_line_cleanup"),
        ].join("\n")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "off") {
      await setTempvoiceTrigger(guildId, null);
      await replyCard(interaction, successCard(ctx.t, ctx.t("tempvoice.disabled")), {
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "show") {
      const config = await getTempvoiceConfig(guildId);
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: ctx.t("tempvoice.title"),
          body: [
            ctx.t("tempvoice.show_trigger", {
              trigger: config.triggerChannelId ? `<#${config.triggerChannelId}>` : ctx.t("tempvoice.show_trigger_disabled"),
            }),
            ctx.t("tempvoice.show_active", { count: config.active.length }),
          ].join("\n"),
        }),
        { ephemeral: true },
      );
    }
  },
};
