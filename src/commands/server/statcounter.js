import { ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import {
  addStatcounter,
  createCounterChannel,
  getStatcounters,
  MAX_STATCOUNTERS,
  removeStatcounter,
  STATCOUNTER_TYPES,
} from "#services/statcounters.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("statcounter", {
  en: {
    title: "Stat Counters",
    template_members: "👥 Members: {count}",
    template_bots: "🤖 Bots: {count}",
    template_channels: "📁 Channels: {count}",
    template_roles: "🏷️ Roles: {count}",
    template_missing_count: "The template must contain `{count}`.",
    limit_reached: "Counter limit reached (max {max}).",
    create_failed: "I couldn't create the channel. I need **Manage Channels**.",
    created: "Counter created: **{name}**\n- Updates every ~10 minutes (Discord limits channel renames).",
    not_counter: "That channel is not a stat counter.",
    removed: "Counter removed.",
    list_empty: "No counters yet. Use `/statcounter add`.",
  },
  id: {
    title: "Stat Counter",
    template_members: "👥 Member: {count}",
    template_bots: "🤖 Bot: {count}",
    template_channels: "📁 Channel: {count}",
    template_roles: "🏷️ Role: {count}",
    template_missing_count: "Template harus mengandung `{count}`.",
    limit_reached: "Batas counter tercapai (maksimal {max}).",
    create_failed: "Aku tidak bisa membuat channel-nya. Aku butuh permission **Manage Channels**.",
    created: "Counter dibuat: **{name}**\n- Update tiap ~10 menit (Discord membatasi rename channel).",
    not_counter: "Channel itu bukan stat counter.",
    removed: "Counter dihapus.",
    list_empty: "Belum ada counter. Pakai `/statcounter add`.",
  },
});

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("statcounter.title"), body });
}

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("statcounter.title"), body });
}

export default {
  category: "server",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageChannels],
  },
  data: new SlashCommandBuilder()
    .setName("statcounter")
    .setDescription("Live server-stat channels (member count etc.)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Create a locked voice channel showing a stat")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Which stat")
            .addChoices(...STATCOUNTER_TYPES.map((type) => ({ name: type, value: type })))
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("template")
            .setDescription("Channel name template with {count} (default per type)")
            .setMaxLength(90)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a stat counter")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Counter channel to remove")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List stat counters")),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for statcounter command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const type = interaction.options.getString("type", true);
      const template = interaction.options.getString("template")?.trim() || ctx.t(`statcounter.template_${type}`);

      if (!template.includes("{count}")) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("statcounter.template_missing_count")), { ephemeral: true });
        return;
      }

      const counters = await getStatcounters(guildId);
      if (Object.keys(counters).length >= MAX_STATCOUNTERS) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("statcounter.limit_reached", { max: MAX_STATCOUNTERS })), { ephemeral: true });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const channel = await createCounterChannel(guild, { type, template });
      if (!channel) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("statcounter.create_failed")), {
          ephemeral: true,
        });
        return;
      }

      await addStatcounter(guildId, channel.id, { type, template });
      await replyCard(
        interaction,
        successCard(ctx.t, ctx.t("statcounter.created", { name: channel.name })),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const channel = interaction.options.getChannel("channel", true);
      const removed = await removeStatcounter(guildId, channel.id);
      if (!removed) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("statcounter.not_counter")), { ephemeral: true });
        return;
      }

      await channel.delete("Stat counter removed").catch(() => {});
      await replyCard(interaction, successCard(ctx.t, ctx.t("statcounter.removed")), { ephemeral: true });
      return;
    }

    if (subcommand === "list") {
      const counters = await getStatcounters(guildId);
      const entries = Object.entries(counters);
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: ctx.t("statcounter.title"),
          body: entries.length > 0
            ? entries.map(([channelId, entry]) => `- <#${channelId}> — ${entry.type} (\`${entry.template}\`)`).join("\n")
            : ctx.t("statcounter.list_empty"),
        }),
        { ephemeral: true },
      );
    }
  },
};
