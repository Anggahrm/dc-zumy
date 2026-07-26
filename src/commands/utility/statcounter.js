import { ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  addStatcounter,
  createCounterChannel,
  getStatcounters,
  MAX_STATCOUNTERS,
  removeStatcounter,
  STATCOUNTER_TYPES,
} from "#services/statcounters.js";
import { createCard, replyCard } from "#utils/respond.js";

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Stat Counters", body });
}

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Stat Counters", body });
}

const DEFAULT_TEMPLATES = {
  members: "👥 Members: {count}",
  bots: "🤖 Bots: {count}",
  channels: "📁 Channels: {count}",
  roles: "🏷️ Roles: {count}",
};

export default {
  category: "utility",
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
      const template = interaction.options.getString("template")?.trim() || DEFAULT_TEMPLATES[type];

      if (!template.includes("{count}")) {
        await replyCard(interaction, errorCard("The template must contain `{count}`."), { ephemeral: true });
        return;
      }

      const counters = await getStatcounters(guildId);
      if (Object.keys(counters).length >= MAX_STATCOUNTERS) {
        await replyCard(interaction, errorCard(`Counter limit reached (max ${MAX_STATCOUNTERS}).`), { ephemeral: true });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const channel = await createCounterChannel(guild, { type, template });
      if (!channel) {
        await replyCard(interaction, errorCard("I couldn't create the channel. I need **Manage Channels**."), {
          ephemeral: true,
        });
        return;
      }

      await addStatcounter(guildId, channel.id, { type, template });
      await replyCard(
        interaction,
        successCard([
          `Counter created: **${channel.name}**`,
          "- Updates every ~10 minutes (Discord limits channel renames).",
        ].join("\n")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const channel = interaction.options.getChannel("channel", true);
      const removed = await removeStatcounter(guildId, channel.id);
      if (!removed) {
        await replyCard(interaction, errorCard("That channel is not a stat counter."), { ephemeral: true });
        return;
      }

      await channel.delete("Stat counter removed").catch(() => {});
      await replyCard(interaction, successCard("Counter removed."), { ephemeral: true });
      return;
    }

    if (subcommand === "list") {
      const counters = await getStatcounters(guildId);
      const entries = Object.entries(counters);
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Stat Counters",
          body: entries.length > 0
            ? entries.map(([channelId, entry]) => `- <#${channelId}> — ${entry.type} (\`${entry.template}\`)`).join("\n")
            : "No counters yet. Use `/statcounter add`.",
        }),
        { ephemeral: true },
      );
    }
  },
};
