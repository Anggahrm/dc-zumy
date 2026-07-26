import { ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getModConfig, setMuteRole } from "#services/mod-config.js";
import { createCard, replyCard } from "#utils/respond.js";

const LOCKED_OVERWRITES = {
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false,
  Speak: false,
};

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Mute Role", body });
}

async function applyMuteOverwrites(guild, role) {
  const channels = guild.channels.cache.filter((channel) =>
    channel.type !== ChannelType.GuildCategory && typeof channel.permissionOverwrites?.edit === "function");

  const results = await Promise.allSettled(
    channels.map((channel) =>
      channel.permissionOverwrites.edit(role, LOCKED_OVERWRITES, { reason: "Mute role setup" }),
    ),
  );

  const applied = results.filter((result) => result.status === "fulfilled").length;
  return { applied, total: channels.size };
}

export default {
  category: "moderation",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("muterole")
    .setDescription("Configure the mute role used by /mute")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Use an existing role as mute role")
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to use").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a Muted role and apply channel overwrites"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("show").setDescription("Show the configured mute role"),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for muterole command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      const { muteRoleId } = await getModConfig(guildId);
      const role = muteRoleId ? guild.roles.cache.get(muteRoleId) : null;
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Mute Role",
          body: role
            ? `Current mute role: <@&${role.id}>`
            : muteRoleId
              ? `Configured role \`${muteRoleId}\` no longer exists. Run \`/muterole set\` or \`/muterole create\`.`
              : "No mute role configured. Run `/muterole set` or `/muterole create`.",
        }),
        { ephemeral: true },
      );
      return;
    }

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await replyCard(interaction, errorCard("I need the **Manage Roles** permission for this."), { ephemeral: true });
      return;
    }

    if (subcommand === "set") {
      const role = interaction.options.getRole("role", true);
      if (role.id === guild.id || role.managed) {
        await replyCard(interaction, errorCard("That role can't be used as a mute role."), { ephemeral: true });
        return;
      }
      if (role.position >= me.roles.highest.position) {
        await replyCard(
          interaction,
          errorCard("That role is equal to or higher than my highest role, so I can't assign it."),
          { ephemeral: true },
        );
        return;
      }

      await setMuteRole(guildId, role.id);
      await replyCard(
        interaction,
        createCard({
          color: 0x57f287,
          title: "Mute Role",
          body: [
            `Mute role set to <@&${role.id}>.`,
            "-# Tip: make sure this role denies Send Messages in your channels, or use `/muterole create` to set overwrites automatically.",
          ].join("\n"),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "create") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let role;
      try {
        role = await guild.roles.create({
          name: "Muted",
          permissions: [],
          reason: `Mute role created by ${interaction.user.tag}`,
        });
      } catch {
        await replyCard(interaction, errorCard("Failed to create the role. Check my permissions."), { ephemeral: true });
        return;
      }

      const { applied, total } = await applyMuteOverwrites(guild, role);
      await setMuteRole(guildId, role.id);

      await replyCard(
        interaction,
        createCard({
          color: 0x57f287,
          title: "Mute Role",
          body: [
            `Created <@&${role.id}> and set it as the mute role.`,
            `- Channel overwrites applied: **${applied}/${total}**`,
            ...(applied < total ? ["- Some channels were skipped (missing permission there)."] : []),
          ].join("\n"),
        }),
        { ephemeral: true },
      );
    }
  },
};
