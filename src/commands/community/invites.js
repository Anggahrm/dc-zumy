import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { getInviteLeaderboard, getInviteStats } from "#services/invites.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("invites", {
  en: {
    show_title: "Invites",
    show_body: "- Member: <@{user_id}>\n- Invites: **{net}**\n- Joined: **{joins}** · Left again: **{leaves}**\n-# Counted since I joined the server; joins through vanity URLs and the app directory can't be tracked.",
    leaderboard_title: "Invite leaderboard",
    leaderboard_empty: "No tracked invites yet. Counts appear as members join through tracked invites.",
    leaderboard_line: "**#{rank}** <@{user_id}> — **{net}** ({joins} joined, {leaves} left)",
  },
  id: {
    show_title: "Invites",
    show_body: "- Member: <@{user_id}>\n- Invite: **{net}**\n- Masuk: **{joins}** · Keluar lagi: **{leaves}**\n-# Dihitung sejak aku bergabung ke server; join lewat vanity URL dan app directory tidak bisa dilacak.",
    leaderboard_title: "Leaderboard invite",
    leaderboard_empty: "Belum ada invite yang terlacak. Hitungan muncul saat member bergabung lewat invite yang terlacak.",
    leaderboard_line: "**#{rank}** <@{user_id}> — **{net}** ({joins} masuk, {leaves} keluar)",
  },
});

export default {
  category: "community",
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
          title: ctx.t("invites.show_title"),
          body: ctx.t("invites.show_body", {
            user_id: target.id,
            net: stats.net,
            joins: stats.joins,
            leaves: stats.leaves,
          }),
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
            title: ctx.t("invites.leaderboard_title"),
            body: ctx.t("invites.leaderboard_empty"),
          }),
          { ephemeral: true },
        );
        return;
      }

      const lines = top.map((entry, index) =>
        ctx.t("invites.leaderboard_line", {
          rank: index + 1,
          user_id: entry.userId,
          net: entry.net,
          joins: entry.joins,
          leaves: entry.leaves,
        }));

      await replyCard(
        interaction,
        createCard({ color: 0x5865f2, title: ctx.t("invites.leaderboard_title"), body: lines.join("\n") }),
      );
    }
  },
};
