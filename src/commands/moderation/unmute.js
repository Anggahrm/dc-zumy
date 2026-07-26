import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { getModConfig } from "#services/mod-config.js";
import { unmuteJobKey } from "#services/scheduler-jobs.js";
import { normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Moderation", body });
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ModerateMembers],
  },
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove a member's mute role")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("Member to unmute").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for unmute command.");
    }

    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"));

    const { muteRoleId } = await getModConfig(guild.id);
    if (!muteRoleId) {
      await replyCard(interaction, errorCard("No mute role configured."), { ephemeral: true });
      return;
    }

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      await replyCard(interaction, errorCard("That user is not in this server."), { ephemeral: true });
      return;
    }

    if (!targetMember.roles.cache.has(muteRoleId)) {
      await replyCard(interaction, errorCard(`**${target.tag}** is not muted.`), { ephemeral: true });
      return;
    }

    try {
      await targetMember.roles.remove(muteRoleId, `Unmuted by ${interaction.user.tag}: ${reason}`);
    } catch {
      await replyCard(interaction, errorCard("Unmute failed. Check my role position and permissions."), { ephemeral: true });
      return;
    }

    await interaction.client.zumy?.scheduler?.cancelByKey(unmuteJobKey(guild.id, target.id)).catch(() => {});

    const caseRow = await recordCase({
      guild,
      type: "unmute",
      target,
      moderator: interaction.user,
      reason,
    });

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: "Moderation",
        body: [
          `**Mute Removed**${caseRow ? ` — Case #${caseRow.caseNumber}` : ""}`,
          `- Target: **${target.tag}** (\`${target.id}\`)`,
          `- Moderator: **${interaction.user.tag}**`,
          `- Reason: ${reason}`,
        ].join("\n"),
      }),
    );
  },
};
