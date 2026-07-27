import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
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

registerStrings("sticky", {
  en: {
    title: "Sticky",
    list_header: "**{count}/{max} stickies**",
    list_empty: "No stickies yet. Use `/sticky set`.",
    pick_text_channel: "Pick a text channel in this server.",
    content_empty: "Type the message you want to stick.",
    limit_reached: "You've reached the sticky limit (max {max} per server). Remove one first.",
    set_done: "Sticky set for <#{channel_id}>.",
    no_sticky: "That channel has no sticky.",
    removed: "Sticky removed from <#{channel_id}>.",
  },
  id: {
    title: "Sticky",
    list_header: "**{count}/{max} sticky**",
    list_empty: "Belum ada sticky. Pakai `/sticky set`.",
    pick_text_channel: "Pilih text channel di server ini.",
    content_empty: "Ketik pesan yang mau kamu tempel.",
    limit_reached: "Batas sticky sudah tercapai (maksimal {max} per server). Hapus satu dulu.",
    set_done: "Sticky dipasang untuk <#{channel_id}>.",
    no_sticky: "Channel itu tidak punya sticky.",
    removed: "Sticky dihapus dari <#{channel_id}>.",
  },
});

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("sticky.title"), body });
}

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("sticky.title"), body });
}

export default {
  category: "server",
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
          title: ctx.t("sticky.title"),
          body: ids.length > 0
            ? [
              ctx.t("sticky.list_header", { count: ids.length, max: MAX_STICKIES_PER_GUILD }),
              ...ids.map((id) => `- <#${id}>: ${stickies[id].content.slice(0, 60)}${stickies[id].content.length > 60 ? "…" : ""}`),
            ].join("\n")
            : ctx.t("sticky.list_empty"),
        }),
        { ephemeral: true },
      );
      return;
    }

    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    if (!channel?.isTextBased() || typeof channel.send !== "function" || channel.guildId !== guild.id) {
      await replyCard(interaction, errorCard(ctx.t, ctx.t("sticky.pick_text_channel")), { ephemeral: true });
      return;
    }

    if (subcommand === "set") {
      const content = interaction.options.getString("content", true).trim();
      if (!content) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("sticky.content_empty")), { ephemeral: true });
        return;
      }

      const result = await setSticky(guildId, channel.id, content);
      if (!result.ok) {
        await replyCard(
          interaction,
          errorCard(ctx.t, ctx.t("sticky.limit_reached", { max: MAX_STICKIES_PER_GUILD })),
          { ephemeral: true },
        );
        return;
      }

      await repostSticky({ guild, channelId: channel.id, logger: interaction.client.zumy?.logger });
      await replyCard(interaction, successCard(ctx.t, ctx.t("sticky.set_done", { channel_id: channel.id })), { ephemeral: true });
      return;
    }

    if (subcommand === "remove") {
      cancelStickyRepost(guildId, channel.id);
      const removed = await removeSticky(guildId, channel.id);
      if (!removed) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("sticky.no_sticky")), { ephemeral: true });
        return;
      }

      if (removed.lastMessageId) {
        const old = await channel.messages.fetch(removed.lastMessageId).catch(() => null);
        await old?.delete().catch(() => {});
      }

      await replyCard(interaction, successCard(ctx.t, ctx.t("sticky.removed", { channel_id: channel.id })), { ephemeral: true });
    }
  },
};
