import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { createCard, replyCard, replyError } from "#utils/respond.js";

const CUSTOM_ID_PREFIX = "rolemenu:";
const MAX_ROLES = 5;

function validateMenuRole(guild, role) {
  if (role.id === guild.id) {
    return "The @everyone role cannot be used in a role menu.";
  }
  if (role.managed) {
    return `Role <@&${role.id}> is managed by an integration and cannot be self-assigned.`;
  }
  const me = guild.members.me;
  if (me && role.position >= me.roles.highest.position) {
    return `Role <@&${role.id}> is equal to or higher than my highest role, so I can't assign it.`;
  }
  return null;
}

function buildMenuMessage(title, description, roles) {
  const lines = roles.map((role) => `- <@&${role.id}>`);
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [`## ${title}`, ...(description ? [description] : [])].join("\n"),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        ["Use the buttons below to add or remove a role.", "", ...lines].join("\n"),
      ),
    );

  const row = new ActionRowBuilder().addComponents(
    roles.map((role) =>
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_ID_PREFIX}${role.id}`)
        .setLabel(role.name.slice(0, 80))
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return {
    components: [container, row],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export default {
  category: "utility",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageRoles],
  },
  data: new SlashCommandBuilder()
    .setName("rolemenu")
    .setDescription("Post a self-assign role menu with buttons")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option.setName("title").setDescription("Menu title").setMaxLength(100).setRequired(true),
    )
    .addRoleOption((option) =>
      option.setName("role1").setDescription("First role").setRequired(true),
    )
    .addRoleOption((option) => option.setName("role2").setDescription("Second role").setRequired(false))
    .addRoleOption((option) => option.setName("role3").setDescription("Third role").setRequired(false))
    .addRoleOption((option) => option.setName("role4").setDescription("Fourth role").setRequired(false))
    .addRoleOption((option) => option.setName("role5").setDescription("Fifth role").setRequired(false))
    .addStringOption((option) =>
      option.setName("description").setDescription("Optional description").setMaxLength(300).setRequired(false),
    ),
  async onComponent({ interaction }) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith(CUSTOM_ID_PREFIX)) return false;

    const roleId = interaction.customId.slice(CUSTOM_ID_PREFIX.length);
    const guild = interaction.guild;
    if (!guild) {
      await replyError(interaction, "Role menus only work in a server.");
      return true;
    }

    const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
    if (!role) {
      await replyError(interaction, "That role no longer exists.");
      return true;
    }

    const invalidReason = validateMenuRole(guild, role);
    if (invalidReason) {
      await replyError(interaction, invalidReason);
      return true;
    }

    const member = interaction.member?.roles?.cache
      ? interaction.member
      : await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      await replyError(interaction, "I couldn't resolve your membership.");
      return true;
    }

    const hasRole = member.roles.cache.has(role.id);
    try {
      if (hasRole) {
        await member.roles.remove(role.id, "Role menu self-remove");
      } else {
        await member.roles.add(role.id, "Role menu self-assign");
      }
    } catch {
      await replyError(interaction, "I couldn't update your roles. Check my permissions and role position.");
      return true;
    }

    await interaction.reply({
      components: [
        createCard({
          color: hasRole ? 0xed4245 : 0x57f287,
          title: "Role Menu",
          body: hasRole
            ? `Removed <@&${role.id}> from you.`
            : `Added <@&${role.id}> to you.`,
        }),
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return true;
  },
  async execute({ interaction }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for rolemenu command.");
    }

    const title = interaction.options.getString("title", true).trim();
    const description = interaction.options.getString("description")?.trim() || null;

    const roles = [];
    const seen = new Set();
    for (let i = 1; i <= MAX_ROLES; i += 1) {
      const role = interaction.options.getRole(`role${i}`);
      if (!role || seen.has(role.id)) continue;
      seen.add(role.id);
      roles.push(role);
    }

    for (const role of roles) {
      const invalidReason = validateMenuRole(guild, role);
      if (invalidReason) {
        await replyCard(
          interaction,
          createCard({ color: 0xf1c40f, title: "Role Menu", body: invalidReason }),
          { ephemeral: true },
        );
        return;
      }
    }

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await replyCard(
        interaction,
        createCard({
          color: 0xf1c40f,
          title: "Role Menu",
          body: "I need the **Manage Roles** permission to run role menus.",
        }),
        { ephemeral: true },
      );
      return;
    }

    await interaction.reply(buildMenuMessage(title, description, roles));
  },
};
