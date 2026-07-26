import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getSnipe } from "#services/snipe.js";
import { createCard, replyCard } from "#utils/respond.js";

export default {
  category: "utility",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageMessages],
  },
  data: new SlashCommandBuilder()
    .setName("snipe")
    .setDescription("Show the most recently deleted message in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild),
  async execute({ interaction }) {
    const entry = getSnipe(interaction.channelId);

    if (!entry) {
      await replyCard(
        interaction,
        createCard({
          color: 0xf1c40f,
          title: "Snipe",
          body: "Nothing to snipe — no recently deleted message here (kept for 5 minutes).",
        }),
        { ephemeral: true },
      );
      return;
    }

    await replyCard(
      interaction,
      createCard({
        color: 0xed4245,
        title: "Snipe",
        body: entry.content,
        actorName: entry.authorTag,
        actorAvatarUrl: entry.avatarUrl,
        footer: `Deleted ${Math.max(1, Math.round((Date.now() - entry.deletedAt) / 1000))}s ago`,
      }),
      { ephemeral: true },
    );
  },
};
