import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { checkActorHierarchy, dmModerationNotice, normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Moderation", body });
}

export default {
  category: "moderation",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.BanMembers],
  },
  data: new SlashCommandBuilder()
    .setName("softban")
    .setDescription("Kick a member and purge their recent messages (ban + instant unban)")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("Member to softban").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("days")
        .setDescription("Delete message history (1-7 days, default 1)")
        .setMinValue(1)
        .setMaxValue(7)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for softban command.");
    }

    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"));
    const days = interaction.options.getInteger("days") ?? 1;

    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actorMember) {
      throw new Error("Failed to resolve invoking member.");
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      await replyCard(interaction, errorCard("I can only softban members currently in this server."), {
        ephemeral: true,
      });
      return;
    }

    const rejection = checkActorHierarchy({
      guild,
      actorUserId: interaction.user.id,
      actorMember,
      targetUserId: target.id,
      targetMember,
    });
    if (rejection) {
      await replyCard(interaction, errorCard(rejection), { ephemeral: true });
      return;
    }

    if (!targetMember.bannable) {
      await replyCard(
        interaction,
        errorCard("I cannot softban that user due to role hierarchy or missing permissions."),
        { ephemeral: true },
      );
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const dmDelivered = await dmModerationNotice(target, {
      guildName: guild.name,
      actionLabel: "Softban",
      color: 0xe67e22,
      reason,
      lines: ["- You may rejoin with a new invite."],
    });

    try {
      await guild.bans.create(target, {
        reason: `Softban by ${interaction.user.tag}: ${reason}`,
        deleteMessageSeconds: days * 24 * 60 * 60,
      });
      await guild.bans.remove(target.id, `Softban release by ${interaction.user.tag}`);
    } catch {
      await replyCard(interaction, errorCard("Softban failed. Please check role hierarchy and bot permissions."), {
        ephemeral: true,
      });
      return;
    }

    const caseRow = await recordCase({
      guild,
      type: "softban",
      target,
      moderator: interaction.user,
      reason,
      metadata: { deleteMessageDays: days },
    });

    await replyCard(
      interaction,
      createCard({
        color: 0xf1c40f,
        title: "Moderation",
        body: [
          `**Softban Complete**${caseRow ? ` — Case #${caseRow.caseNumber}` : ""}`,
          `- Target: **${target.tag}** (\`${target.id}\`)`,
          `- Moderator: **${interaction.user.tag}**`,
          `- Messages purged: **${days}** day(s)`,
          `- Reason: ${reason}`,
          ...(dmDelivered ? [] : ["- Note: could not DM the member."]),
        ].join("\n"),
      }),
      { ephemeral: true },
    );
  },
};
