import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

const ID_PATTERN = /^\d{5,30}$/;

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Moderation", body });
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.BanMembers],
  },
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by their user ID")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option.setName("user_id").setDescription("ID of the banned user").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason for the unban").setMaxLength(400).setRequired(false),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for unban command.");
    }

    const userId = interaction.options.getString("user_id", true).trim();
    const reason = normalizeReason(interaction.options.getString("reason"));

    if (!ID_PATTERN.test(userId)) {
      await replyCard(interaction, errorCard("That doesn't look like a valid user ID."), { ephemeral: true });
      return;
    }

    const ban = await guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
      await replyCard(interaction, errorCard("That user is not banned from this server."), { ephemeral: true });
      return;
    }

    try {
      await guild.bans.remove(userId, reason);
    } catch {
      await replyCard(interaction, errorCard("Unban failed. Please check bot permissions."), { ephemeral: true });
      return;
    }

    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: "Moderation",
        body: [
          "**Unban Complete**",
          `- Target: **${ban.user?.tag ?? userId}** (\`${userId}\`)`,
          `- Moderator: **${interaction.user.tag}**`,
          `- Reason: ${reason}`,
        ].join("\n"),
      }),
    );
  },
};
