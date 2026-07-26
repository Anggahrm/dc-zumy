import { ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import { getModConfig, setMuteRole } from "#services/mod-config.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("muterole", {
  en: {
    title: "Mute Role",
    current_role: "Current mute role: <@&{role}>",
    role_missing: "Configured role `{roleId}` no longer exists. Run `/muterole set` or `/muterole create`.",
    none_configured: "No mute role configured. Run `/muterole set` or `/muterole create`.",
    need_manage_roles: "I need the **Manage Roles** permission for this.",
    role_unusable: "That role can't be used as a mute role.",
    role_too_high: "That role is equal to or higher than my highest role, so I can't assign it.",
    set_success: "Mute role set to <@&{role}>.",
    set_tip: "-# Tip: make sure this role denies Send Messages in your channels, or use `/muterole create` to set overwrites automatically.",
    create_failed: "Failed to create the role. Check my permissions.",
    created: "Created <@&{role}> and set it as the mute role.",
    overwrites_line: "- Channel overwrites applied: **{applied}/{total}**",
    skipped_channels_line: "- Some channels were skipped (missing permission there).",
  },
  id: {
    title: "Role Mute",
    current_role: "Role mute saat ini: <@&{role}>",
    role_missing: "Role `{roleId}` yang tersimpan sudah tidak ada. Jalankan `/muterole set` atau `/muterole create` lagi ya.",
    none_configured: "Role mute belum diatur. Jalankan `/muterole set` atau `/muterole create` dulu.",
    need_manage_roles: "Aku butuh permission **Manage Roles** untuk ini.",
    role_unusable: "Role itu tidak bisa dipakai sebagai role mute.",
    role_too_high: "Role itu posisinya sama atau lebih tinggi dari role tertinggiku, jadi aku tidak bisa memberikannya.",
    set_success: "Role mute diatur ke <@&{role}>.",
    set_tip: "-# Tips: pastikan role ini menolak Send Messages di channel-mu, atau pakai `/muterole create` biar overwrites-nya diatur otomatis.",
    create_failed: "Gagal membuat role. Cek permission-ku ya.",
    created: "Berhasil membuat <@&{role}> dan mengaturnya sebagai role mute.",
    overwrites_line: "- Channel overwrites diterapkan: **{applied}/{total}**",
    skipped_channels_line: "- Beberapa channel dilewati (aku tidak punya permission di sana).",
  },
});

const LOCKED_OVERWRITES = {
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false,
  Speak: false,
};

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("muterole.title"), body });
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

    const t = ctx.t;
    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      const { muteRoleId } = await getModConfig(guildId);
      const role = muteRoleId ? guild.roles.cache.get(muteRoleId) : null;
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: t("muterole.title"),
          body: role
            ? t("muterole.current_role", { role: role.id })
            : muteRoleId
              ? t("muterole.role_missing", { roleId: muteRoleId })
              : t("muterole.none_configured"),
        }),
        { ephemeral: true },
      );
      return;
    }

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await replyCard(interaction, errorCard(t, t("muterole.need_manage_roles")), { ephemeral: true });
      return;
    }

    if (subcommand === "set") {
      const role = interaction.options.getRole("role", true);
      if (role.id === guild.id || role.managed) {
        await replyCard(interaction, errorCard(t, t("muterole.role_unusable")), { ephemeral: true });
        return;
      }
      if (role.position >= me.roles.highest.position) {
        await replyCard(
          interaction,
          errorCard(t, t("muterole.role_too_high")),
          { ephemeral: true },
        );
        return;
      }

      await setMuteRole(guildId, role.id);
      await replyCard(
        interaction,
        createCard({
          color: 0x57f287,
          title: t("muterole.title"),
          body: [
            t("muterole.set_success", { role: role.id }),
            t("muterole.set_tip"),
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
        await replyCard(interaction, errorCard(t, t("muterole.create_failed")), { ephemeral: true });
        return;
      }

      const { applied, total } = await applyMuteOverwrites(guild, role);
      await setMuteRole(guildId, role.id);

      await replyCard(
        interaction,
        createCard({
          color: 0x57f287,
          title: t("muterole.title"),
          body: [
            t("muterole.created", { role: role.id }),
            t("muterole.overwrites_line", { applied, total }),
            ...(applied < total ? [t("muterole.skipped_channels_line")] : []),
          ].join("\n"),
        }),
        { ephemeral: true },
      );
    }
  },
};
