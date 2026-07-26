import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
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
    .setName("untimeout")
    .setDescription("Remove a member's timeout")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("Member to release").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for untimeout command.");
    }

    const target = interaction.options.getUser("target", true);
    const reason = normalizeReason(interaction.options.getString("reason"));
    const targetMember = await guild.members.fetch(target.id).catch(() => null);

    if (!targetMember) {
      await replyCard(interaction, errorCard("That user is not in this server."), { ephemeral: true });
      return;
    }

    if (!targetMember.isCommunicationDisabled()) {
      await replyCard(interaction, errorCard(`**${target.tag}** is not timed out.`), { ephemeral: true });
      return;
    }

    try {
      await targetMember.timeout(null, reason);
    } catch {
      await replyCard(
        interaction,
        errorCard("Failed to remove the timeout. Please check role hierarchy and bot permissions."),
        { ephemeral: true },
      );
      return;
    }

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: "Moderation",
        body: [
          "**Timeout Removed**",
          `- Target: **${target.tag}** (\`${target.id}\`)`,
          `- Moderator: **${interaction.user.tag}**`,
          `- Reason: ${reason}`,
        ].join("\n"),
      }),
    );
  },
};
