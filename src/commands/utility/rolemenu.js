import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from "discord.js";
import {
  addMenuRole,
  createMenu,
  deleteMenu,
  getMenu,
  getMenus,
  MAX_MENU_ROLES,
  MAX_MENUS,
  removeMenuRole,
  sanitizeMenuName,
  setMenuMessage,
} from "#services/rolemenus.js";
import { createCard, replyCard, replyError } from "#utils/respond.js";

const BUTTON_PREFIX = "rolemenu:";
const SELECT_PREFIX = "rolemenu-select:";

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Role Menu", body });
}

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Role Menu", body });
}

function validateMenuRole(guild, role) {
  if (!role) return "That role no longer exists.";
  if (role.id === guild.id) return "The @everyone role cannot be used in a role menu.";
  if (role.managed) return `Role <@&${role.id}> is managed by an integration and cannot be self-assigned.`;
  const me = guild.members.me;
  if (me && role.position >= me.roles.highest.position) {
    return `Role <@&${role.id}> is equal to or higher than my highest role, so I can't assign it.`;
  }
  return null;
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

function buildMenuMessage(guild, menu) {
  const roles = menu.roles
    .map((roleId) => guild.roles.cache.get(roleId))
    .filter(Boolean);

  const lines = roles.map((role) => `- <@&${role.id}>`);
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [`## ${menu.title}`, ...(menu.description ? [menu.description] : [])].join("\n"),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          menu.mode === "select"
            ? menu.unique
              ? "Pick one role from the menu below."
              : "Pick your roles from the menu below."
            : menu.unique
              ? "Click a button to pick one role (it replaces the others)."
              : "Use the buttons below to add or remove roles.",
          "",
          ...lines,
        ].join("\n"),
      ),
    );

  const rows = [];
  if (menu.mode === "select") {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`${SELECT_PREFIX}${menu.name}`)
      .setPlaceholder(menu.unique ? "Pick one role..." : "Pick your roles...")
      .setMinValues(0)
      .setMaxValues(menu.unique ? 1 : roles.length)
      .addOptions(
        roles.map((role) =>
          new StringSelectMenuOptionBuilder().setLabel(role.name.slice(0, 100)).setValue(role.id),
        ),
      );
    rows.push(new ActionRowBuilder().addComponents(select));
  } else {
    for (const group of chunk(roles, 5)) {
      rows.push(
        new ActionRowBuilder().addComponents(
          group.map((role) =>
            new ButtonBuilder()
              .setCustomId(`${BUTTON_PREFIX}${menu.name}:${role.id}`)
              .setLabel(role.name.slice(0, 80))
              .setStyle(ButtonStyle.Secondary),
          ),
        ),
      );
    }
  }

  return {
    components: [container, ...rows],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

async function resolveMember(interaction, guild) {
  return interaction.member?.roles?.cache
    ? interaction.member
    : guild.members.fetch(interaction.user.id).catch(() => null);
}

async function confirmRoles(interaction, added, removed) {
  const lines = [];
  if (added.length > 0) lines.push(`Added: ${added.map((id) => `<@&${id}>`).join(", ")}`);
  if (removed.length > 0) lines.push(`Removed: ${removed.map((id) => `<@&${id}>`).join(", ")}`);
  if (lines.length === 0) lines.push("No role changes.");

  await interaction.reply({
    components: [createCard({ color: 0x57f287, title: "Role Menu", body: lines.join("\n") })],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function handleButton(interaction) {
  const parts = interaction.customId.split(":");
  const guild = interaction.guild;
  if (!guild) {
    await replyError(interaction, "Role menus only work in a server.");
    return true;
  }

  // New format: rolemenu:<menuName>:<roleId>; legacy: rolemenu:<roleId>.
  const [menuName, roleId] = parts.length >= 3 ? [parts[1], parts[2]] : [null, parts[1]];

  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
  const invalidReason = validateMenuRole(guild, role);
  if (invalidReason) {
    await replyError(interaction, invalidReason);
    return true;
  }

  const member = await resolveMember(interaction, guild);
  if (!member) {
    await replyError(interaction, "I couldn't resolve your membership.");
    return true;
  }

  const menu = menuName ? await getMenu(guild.id, menuName) : null;
  const hasRole = member.roles.cache.has(role.id);

  try {
    if (hasRole) {
      await member.roles.remove(role.id, "Role menu self-remove");
      await confirmRoles(interaction, [], [role.id]);
      return true;
    }

    const removed = [];
    if (menu?.unique) {
      for (const otherId of menu.roles) {
        if (otherId !== role.id && member.roles.cache.has(otherId)) {
          removed.push(otherId);
        }
      }
    }

    if (removed.length > 0) {
      await member.roles.remove(removed, "Role menu unique mode");
    }
    await member.roles.add(role.id, "Role menu self-assign");
    await confirmRoles(interaction, [role.id], removed);
  } catch {
    await replyError(interaction, "I couldn't update your roles. Check my permissions and role position.");
  }
  return true;
}

async function handleSelect(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    await replyError(interaction, "Role menus only work in a server.");
    return true;
  }

  const menuName = interaction.customId.slice(SELECT_PREFIX.length);
  const menu = await getMenu(guild.id, menuName);
  if (!menu) {
    await replyError(interaction, "This role menu no longer exists.");
    return true;
  }

  const member = await resolveMember(interaction, guild);
  if (!member) {
    await replyError(interaction, "I couldn't resolve your membership.");
    return true;
  }

  const chosen = new Set(interaction.values);
  const added = [];
  const removed = [];

  for (const roleId of menu.roles) {
    const role = guild.roles.cache.get(roleId);
    if (validateMenuRole(guild, role)) continue;

    const has = member.roles.cache.has(roleId);
    if (chosen.has(roleId) && !has) added.push(roleId);
    if (!chosen.has(roleId) && has) removed.push(roleId);
  }

  try {
    if (removed.length > 0) await member.roles.remove(removed, "Role menu selection");
    if (added.length > 0) await member.roles.add(added, "Role menu selection");
    await confirmRoles(interaction, added, removed);
  } catch {
    await replyError(interaction, "I couldn't update your roles. Check my permissions and role position.");
  }
  return true;
}

export default {
  category: "utility",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageRoles],
  },
  data: new SlashCommandBuilder()
    .setName("rolemenu")
    .setDescription("Create and manage self-assign role menus")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a role menu")
        .addStringOption((option) =>
          option.setName("name").setDescription("Menu name (lowercase, no spaces)").setMaxLength(32).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("title").setDescription("Menu title").setMaxLength(100).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("description").setDescription("Optional description").setMaxLength(300).setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("How members pick roles (default: buttons)")
            .addChoices({ name: "Buttons", value: "buttons" }, { name: "Select menu", value: "select" })
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option.setName("unique").setDescription("Only one role from this menu at a time").setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a role to a menu")
        .addStringOption((option) =>
          option.setName("name").setDescription("Menu name").setMaxLength(32).setAutocomplete(true).setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to add").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a role from a menu")
        .addStringOption((option) =>
          option.setName("name").setDescription("Menu name").setMaxLength(32).setAutocomplete(true).setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to remove").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("post")
        .setDescription("Post the menu (or update the existing message)")
        .addStringOption((option) =>
          option.setName("name").setDescription("Menu name").setMaxLength(32).setAutocomplete(true).setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Target channel (defaults to current channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a menu (and its posted message)")
        .addStringOption((option) =>
          option.setName("name").setDescription("Menu name").setMaxLength(32).setAutocomplete(true).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List role menus"),
    ),
  async autocomplete({ interaction }) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const query = String(interaction.options.getFocused() ?? "").toLowerCase();
    const menus = await getMenus(interaction.guildId);
    const matches = Object.keys(menus)
      .filter((name) => !query || name.includes(query))
      .sort()
      .slice(0, 25)
      .map((name) => ({ name, value: name }));
    await interaction.respond(matches);
  },
  async onComponent({ interaction }) {
    if (interaction.isButton() && interaction.customId.startsWith(BUTTON_PREFIX)) {
      return handleButton(interaction);
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(SELECT_PREFIX)) {
      return handleSelect(interaction);
    }
    return false;
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for rolemenu command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const result = await createMenu(guildId, interaction.options.getString("name", true), {
        title: interaction.options.getString("title", true).trim(),
        description: interaction.options.getString("description")?.trim() || null,
        mode: interaction.options.getString("mode") ?? "buttons",
        unique: interaction.options.getBoolean("unique") ?? false,
      });

      if (!result.ok) {
        const reasons = {
          invalid_name: "Menu names must be 1-32 chars: lowercase letters, numbers, `-`, `_`.",
          exists: "A menu with that name already exists.",
          full: `Menu limit reached (max ${MAX_MENUS}).`,
        };
        await replyCard(interaction, errorCard(reasons[result.reason] ?? "Could not create the menu."), { ephemeral: true });
        return;
      }

      await replyCard(
        interaction,
        successCard([
          `Menu \`${result.name}\` created.`,
          `- Add roles: \`/rolemenu add name:${result.name}\``,
          `- Then post it: \`/rolemenu post name:${result.name}\``,
        ].join("\n")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "list") {
      const menus = await getMenus(guildId);
      const names = Object.keys(menus).sort();
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Role Menus",
          body: names.length > 0
            ? names
              .map((name) => {
                const menu = menus[name];
                const status = menu.messageId ? "posted" : "not posted";
                return `- \`${name}\` — ${menu.roles.length} role(s), ${menu.mode}${menu.unique ? ", unique" : ""}, ${status}`;
              })
              .join("\n")
            : "No role menus yet. Create one with `/rolemenu create`.",
        }),
        { ephemeral: true },
      );
      return;
    }

    const name = sanitizeMenuName(interaction.options.getString("name", true));
    const menu = name ? await getMenu(guildId, name) : null;
    if (!menu) {
      await replyCard(interaction, errorCard("No menu with that name. Try `/rolemenu list`."), { ephemeral: true });
      return;
    }

    if (subcommand === "add") {
      const role = interaction.options.getRole("role", true);
      const invalidReason = validateMenuRole(guild, role);
      if (invalidReason) {
        await replyCard(interaction, errorCard(invalidReason), { ephemeral: true });
        return;
      }

      const result = await addMenuRole(guildId, name, role.id);
      if (!result.ok) {
        const reasons = {
          exists: "That role is already in the menu.",
          full: `This menu is full (max ${MAX_MENU_ROLES} roles).`,
          not_found: "No menu with that name.",
        };
        await replyCard(interaction, errorCard(reasons[result.reason] ?? "Could not add the role."), { ephemeral: true });
        return;
      }

      await replyCard(
        interaction,
        successCard([
          `Added <@&${role.id}> to \`${name}\` (${result.count}/${MAX_MENU_ROLES}).`,
          ...(menu.messageId ? ["- Run `/rolemenu post` to update the posted message."] : []),
        ].join("\n")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const role = interaction.options.getRole("role", true);
      const result = await removeMenuRole(guildId, name, role.id);
      await replyCard(
        interaction,
        result.ok
          ? successCard([
            `Removed <@&${role.id}> from \`${name}\` (${result.count} left).`,
            ...(menu.messageId ? ["- Run `/rolemenu post` to update the posted message."] : []),
          ].join("\n"))
          : errorCard("That role is not in the menu."),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "post") {
      if (menu.roles.length === 0) {
        await replyCard(interaction, errorCard("Add at least one role before posting."), { ephemeral: true });
        return;
      }

      for (const roleId of menu.roles) {
        const invalidReason = validateMenuRole(guild, guild.roles.cache.get(roleId));
        if (invalidReason) {
          await replyCard(
            interaction,
            errorCard([invalidReason, `Remove it with \`/rolemenu remove name:${name}\`.`].join("\n")),
            { ephemeral: true },
          );
          return;
        }
      }

      const channel = interaction.options.getChannel("channel")
        ?? (menu.channelId ? guild.channels.cache.get(menu.channelId) : null)
        ?? interaction.channel;
      if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
        await replyCard(interaction, errorCard("Pick a text channel I can post in."), { ephemeral: true });
        return;
      }

      const payload = buildMenuMessage(guild, menu);

      let updated = false;
      if (menu.messageId && menu.channelId === channel.id) {
        const existing = await channel.messages.fetch(menu.messageId).catch(() => null);
        if (existing) {
          await existing.edit({ components: payload.components, allowedMentions: { parse: [] } });
          updated = true;
        }
      }

      if (!updated) {
        const message = await channel.send(payload);
        await setMenuMessage(guildId, name, channel.id, message.id);
      }

      await replyCard(
        interaction,
        successCard(`Menu \`${name}\` ${updated ? "updated" : "posted"} in <#${channel.id}>.`),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "delete") {
      const removed = await deleteMenu(guildId, name);
      if (removed?.messageId && removed.channelId) {
        const channel = guild.channels.cache.get(removed.channelId);
        const message = await channel?.messages.fetch(removed.messageId).catch(() => null);
        await message?.delete().catch(() => {});
      }

      await replyCard(interaction, successCard(`Menu \`${name}\` deleted.`), { ephemeral: true });
    }
  },
};
