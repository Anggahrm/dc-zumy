import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { temproleJobKey } from "#services/scheduler-jobs.js";
import { createCard, replyCard } from "#utils/respond.js";
import { formatDuration, parseDuration } from "#utils/time.js";

const MAX_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Temp Role", body });
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageRoles],
  },
  data: new SlashCommandBuilder()
    .setName("temprole")
    .setDescription("Give a role that removes itself after a duration")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("target").setDescription("Member").setRequired(true),
    )
    .addRoleOption((option) =>
      option.setName("role").setDescription("Role to give").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("duration").setDescription("e.g. 1h, 3d, 2w (max 90d)").setRequired(true),
    ),
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for temprole command.");
    }

    const scheduler = interaction.client.zumy?.scheduler;
    if (!scheduler) {
      throw new Error("Scheduler is not available.");
    }

    const target = interaction.options.getUser("target", true);
    const role = interaction.options.getRole("role", true);
    const durationMs = parseDuration(interaction.options.getString("duration", true));

    if (!durationMs || durationMs < 60_000 || durationMs > MAX_DURATION_MS) {
      await replyCard(interaction, errorCard("Duration must be between **1m** and **90d** (e.g. `1h`, `3d`)."), {
        ephemeral: true,
      });
      return;
    }

    const me = guild.members.me;
    if (role.id === guild.id || role.managed || (me && role.position >= me.roles.highest.position)) {
      await replyCard(interaction, errorCard("That role can't be assigned (managed, @everyone, or above my highest role)."), {
        ephemeral: true,
      });
      return;
    }

    // Invoker hierarchy: a mod may only grant roles below their own highest,
    // otherwise /temprole is a self-escalation path for anyone with
    // Manage Roles.
    const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (
      interaction.user.id !== guild.ownerId
      && (!actorMember || role.position >= actorMember.roles.highest.position)
    ) {
      await replyCard(interaction, errorCard("You can only grant roles below your own highest role."), {
        ephemeral: true,
      });
      return;
    }

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await replyCard(interaction, errorCard("That user is not in this server."), { ephemeral: true });
      return;
    }

    try {
      await member.roles.add(role, `Temp role by ${interaction.user.tag} (${formatDuration(durationMs / 1000)})`);
    } catch {
      await replyCard(interaction, errorCard("I couldn't assign that role. Check my permissions."), { ephemeral: true });
      return;
    }

    await scheduler.schedule({
      type: "temprole_remove",
      runAt: new Date(Date.now() + durationMs),
      guildId: guild.id,
      payload: { userId: target.id, roleId: role.id },
      dedupeKey: temproleJobKey(guild.id, target.id, role.id),
    });

    const until = Math.floor((Date.now() + durationMs) / 1000);
    await replyCard(
      interaction,
      createCard({
        color: 0x57f287,
        title: "Temp Role",
        body: [
          `<@${target.id}> received <@&${role.id}> for **${formatDuration(durationMs / 1000)}**.`,
          `- Removed automatically: <t:${until}:F> (<t:${until}:R>)`,
        ].join("\n"),
      }),
      { ephemeral: true },
    );
  },
};
