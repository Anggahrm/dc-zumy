import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  getStickies,
  MAX_STICKIES_PER_GUILD,
  MAX_STICKY_LENGTH,
  cancelStickyRepost,
  removeSticky,
  repostSticky,
  setSticky,
} from "#services/stickies.js";
import { createCard, replyCard } from "#utils/respond.js";

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Sticky", body });
}

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Sticky", body });
}

export default {
  category: "utility",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageMessages],
  },
  data: new SlashCommandBuilder()
    .setName("sticky")
    .setDescription("Keep a message pinned to the bottom of a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set the sticky for a channel")
        .addStringOption((option) =>
          option.setName("content").setDescription("Sticky text").setMaxLength(MAX_STICKY_LENGTH).setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Target channel (defaults to current channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a channel's sticky")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Target channel (defaults to current channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List stickies in this server")),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for sticky command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "list") {
      const stickies = await getStickies(guildId);
      const ids = Object.keys(stickies);
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Sticky",
          body: ids.length > 0
            ? [
              `**${ids.length}/${MAX_STICKIES_PER_GUILD} stickies**`,
              ...ids.map((id) => `- <#${id}>: ${stickies[id].content.slice(0, 60)}${stickies[id].content.length > 60 ? "…" : ""}`),
            ].join("\n")
            : "No stickies yet. Use `/sticky set`.",
        }),
        { ephemeral: true },
      );
      return;
    }

    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    if (!channel?.isTextBased() || typeof channel.send !== "function" || channel.guildId !== guild.id) {
      await replyCard(interaction, errorCard("Pick a text channel in this server."), { ephemeral: true });
      return;
    }

    if (subcommand === "set") {
      const content = interaction.options.getString("content", true).trim();
      if (!content) {
        await replyCard(interaction, errorCard("Sticky content cannot be empty."), { ephemeral: true });
        return;
      }

      const result = await setSticky(guildId, channel.id, content);
      if (!result.ok) {
        await replyCard(
          interaction,
          errorCard(`Sticky limit reached (max ${MAX_STICKIES_PER_GUILD} per server). Remove one first.`),
          { ephemeral: true },
        );
        return;
      }

      await repostSticky({ guild, channelId: channel.id, logger: interaction.client.zumy?.logger });
      await replyCard(interaction, successCard(`Sticky set for <#${channel.id}>.`), { ephemeral: true });
      return;
    }

    if (subcommand === "remove") {
      cancelStickyRepost(guildId, channel.id);
      const removed = await removeSticky(guildId, channel.id);
      if (!removed) {
        await replyCard(interaction, errorCard("That channel has no sticky."), { ephemeral: true });
        return;
      }

      if (removed.lastMessageId) {
        const old = await channel.messages.fetch(removed.lastMessageId).catch(() => null);
        await old?.delete().catch(() => {});
      }

      await replyCard(interaction, successCard(`Sticky removed from <#${channel.id}>.`), { ephemeral: true });
    }
  },
};
