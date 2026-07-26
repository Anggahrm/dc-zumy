import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getInviteLeaderboard, getInviteStats } from "#services/invites.js";
import { createCard, replyCard } from "#utils/respond.js";

export default {
  category: "utility",
  cooldown: 3,
  permissions: {
    guildOnly: true,
  },
  data: new SlashCommandBuilder()
    .setName("invites")
    .setDescription("Invite tracking")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("Show a member's invite count")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member (defaults to you)").setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName("leaderboard").setDescription("Top inviters")),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for invites command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      const target = interaction.options.getUser("target") ?? interaction.user;
      const stats = await getInviteStats(guildId, target.id);

      await replyCard(
        interaction,
        createCard({
          color: 0x5865f2,
          title: "Invites",
          body: [
            `- Member: <@${target.id}>`,
            `- Invites: **${stats.net}**`,
            `- Joined: **${stats.joins}** · Left again: **${stats.leaves}**`,
            "-# Tracked since the bot joined; vanity URLs and app-directory joins can't be attributed.",
          ].join("\n"),
        }),
      );
      return;
    }

    if (subcommand === "leaderboard") {
      const top = await getInviteLeaderboard(guildId, 10);
      if (top.length === 0) {
        await replyCard(
          interaction,
          createCard({
            color: 0x3498db,
            title: "Invite leaderboard",
            body: "No tracked invites yet. Counts appear as members join through tracked invites.",
          }),
          { ephemeral: true },
        );
        return;
      }

      const lines = top.map((entry, index) =>
        `**#${index + 1}** <@${entry.userId}> — **${entry.net}** (${entry.joins} joined, ${entry.leaves} left)`);

      await replyCard(
        interaction,
        createCard({ color: 0x5865f2, title: "Invite leaderboard", body: lines.join("\n") }),
      );
    }
  },
};
