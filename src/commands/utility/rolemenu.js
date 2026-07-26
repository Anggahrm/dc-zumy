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
import { registerStrings } from "#services/i18n.js";
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
import { awaitConfirmation, createCard, replyCard, replyError } from "#utils/respond.js";

const BUTTON_PREFIX = "rolemenu:";
const SELECT_PREFIX = "rolemenu-select:";

registerStrings("rolemenu", {
  en: {
    confirm_delete: "Delete the role menu `{name}` and its posted message? This cannot be undone.",
    title: "Role Menu",
    list_title: "Role Menus",
    role_gone: "That role no longer exists.",
    role_everyone: "The @everyone role cannot be used in a role menu.",
    role_managed: "Role <@&{role_id}> is managed by an integration and cannot be self-assigned.",
    role_too_high: "Role <@&{role_id}> is equal to or higher than my highest role, so I can't assign it.",
    menu_pick_one_select: "Pick one role from the menu below.",
    menu_pick_many_select: "Pick your roles from the menu below.",
    menu_pick_one_buttons: "Click a button to pick one role (it replaces the others).",
    menu_pick_many_buttons: "Use the buttons below to add or remove roles.",
    select_placeholder_one: "Pick one role...",
    select_placeholder_many: "Pick your roles...",
    guild_only: "Role menus only work in a server.",
    membership_unresolved: "I couldn't resolve your membership.",
    menu_outdated: "This role menu is outdated. Ask an admin to repost or remove it.",
    menu_gone: "This role menu no longer exists.",
    roles_update_failed: "I couldn't update your roles. Check my permissions and role position.",
    confirm_added: "Added: {roles}",
    confirm_removed: "Removed: {roles}",
    confirm_none: "No role changes.",
    create_invalid_name: "Menu names must be 1-32 chars: lowercase letters, numbers, `-`, `_`.",
    create_exists: "A menu with that name already exists.",
    create_full: "Menu limit reached (max {max}).",
    create_failed: "Could not create the menu.",
    created: "Menu `{name}` created.\n- Add roles: `/rolemenu add name:{name}`\n- Then post it: `/rolemenu post name:{name}`",
    list_line: "- `{name}` — {count} role(s), {mode}{unique}, {status}",
    list_unique: ", unique",
    list_posted: "posted",
    list_not_posted: "not posted",
    list_empty: "No role menus yet. Create one with `/rolemenu create`.",
    not_found: "No menu with that name. Try `/rolemenu list`.",
    add_exists: "That role is already in the menu.",
    add_full: "This menu is full (max {max} roles).",
    add_not_found: "No menu with that name.",
    add_failed: "Could not add the role.",
    added: "Added <@&{role_id}> to `{name}` ({count}/{max}).",
    repost_hint: "- Run `/rolemenu post` to update the posted message.",
    removed: "Removed <@&{role_id}> from `{name}` ({count} left).",
    remove_not_in_menu: "That role is not in the menu.",
    post_empty: "Add at least one role before posting.",
    post_remove_hint: "Remove it with `/rolemenu remove name:{name}`.",
    pick_text_channel: "Pick a text channel I can post in.",
    post_posted: "Menu `{name}` posted in <#{channel_id}>.",
    post_updated: "Menu `{name}` updated in <#{channel_id}>.",
    deleted: "Menu `{name}` deleted.",
  },
  id: {
    confirm_delete: "Hapus role menu `{name}` beserta pesan yang sudah diposting? Tidak bisa dibatalkan.",
    title: "Role Menu",
    list_title: "Role Menu",
    role_gone: "Role itu sudah tidak ada.",
    role_everyone: "Role @everyone tidak bisa dipakai di role menu.",
    role_managed: "Role <@&{role_id}> dikelola oleh integrasi dan tidak bisa diambil sendiri.",
    role_too_high: "Role <@&{role_id}> setara atau lebih tinggi dari role tertinggiku, jadi aku tidak bisa memberikannya.",
    menu_pick_one_select: "Pilih satu role dari menu di bawah.",
    menu_pick_many_select: "Pilih role-mu dari menu di bawah.",
    menu_pick_one_buttons: "Klik tombol untuk memilih satu role (menggantikan yang lain).",
    menu_pick_many_buttons: "Pakai tombol di bawah untuk menambah atau melepas role.",
    select_placeholder_one: "Pilih satu role...",
    select_placeholder_many: "Pilih role-mu...",
    guild_only: "Role menu hanya bisa dipakai di server.",
    membership_unresolved: "Aku tidak bisa membaca data keanggotaanmu.",
    menu_outdated: "Role menu ini sudah usang. Minta admin untuk memposting ulang atau menghapusnya.",
    menu_gone: "Role menu ini sudah tidak ada.",
    roles_update_failed: "Aku tidak bisa mengubah role-mu. Cek permission dan posisi role-ku.",
    confirm_added: "Ditambahkan: {roles}",
    confirm_removed: "Dilepas: {roles}",
    confirm_none: "Tidak ada perubahan role.",
    create_invalid_name: "Nama menu harus 1-32 karakter: huruf kecil, angka, `-`, `_`.",
    create_exists: "Menu dengan nama itu sudah ada.",
    create_full: "Batas menu tercapai (maksimal {max}).",
    create_failed: "Tidak bisa membuat menu.",
    created: "Menu `{name}` dibuat.\n- Tambah role: `/rolemenu add name:{name}`\n- Lalu posting: `/rolemenu post name:{name}`",
    list_line: "- `{name}` — {count} role, {mode}{unique}, {status}",
    list_unique: ", unique",
    list_posted: "sudah diposting",
    list_not_posted: "belum diposting",
    list_empty: "Belum ada role menu. Buat satu dengan `/rolemenu create`.",
    not_found: "Tidak ada menu dengan nama itu. Coba `/rolemenu list`.",
    add_exists: "Role itu sudah ada di menu.",
    add_full: "Menu ini penuh (maksimal {max} role).",
    add_not_found: "Tidak ada menu dengan nama itu.",
    add_failed: "Tidak bisa menambahkan role.",
    added: "<@&{role_id}> ditambahkan ke `{name}` ({count}/{max}).",
    repost_hint: "- Jalankan `/rolemenu post` untuk memperbarui pesan yang sudah diposting.",
    removed: "<@&{role_id}> dilepas dari `{name}` (sisa {count}).",
    remove_not_in_menu: "Role itu tidak ada di menu.",
    post_empty: "Tambahkan minimal satu role sebelum posting.",
    post_remove_hint: "Hapus dengan `/rolemenu remove name:{name}`.",
    pick_text_channel: "Pilih text channel yang bisa aku pakai untuk posting.",
    post_posted: "Menu `{name}` diposting di <#{channel_id}>.",
    post_updated: "Menu `{name}` diperbarui di <#{channel_id}>.",
    deleted: "Menu `{name}` dihapus.",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("rolemenu.title"), body });
}

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("rolemenu.title"), body });
}

function validateMenuRole(t, guild, role) {
  if (!role) return t("rolemenu.role_gone");
  if (role.id === guild.id) return t("rolemenu.role_everyone");
  if (role.managed) return t("rolemenu.role_managed", { role_id: role.id });
  const me = guild.members.me;
  if (me && role.position >= me.roles.highest.position) {
    return t("rolemenu.role_too_high", { role_id: role.id });
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

function buildMenuMessage(t, guild, menu) {
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
              ? t("rolemenu.menu_pick_one_select")
              : t("rolemenu.menu_pick_many_select")
            : menu.unique
              ? t("rolemenu.menu_pick_one_buttons")
              : t("rolemenu.menu_pick_many_buttons"),
          "",
          ...lines,
        ].join("\n"),
      ),
    );

  const rows = [];
  if (menu.mode === "select") {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`${SELECT_PREFIX}${menu.name}`)
      .setPlaceholder(menu.unique ? t("rolemenu.select_placeholder_one") : t("rolemenu.select_placeholder_many"))
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

async function confirmRoles(t, interaction, added, removed) {
  const lines = [];
  if (added.length > 0) lines.push(t("rolemenu.confirm_added", { roles: added.map((id) => `<@&${id}>`).join(", ") }));
  if (removed.length > 0) lines.push(t("rolemenu.confirm_removed", { roles: removed.map((id) => `<@&${id}>`).join(", ") }));
  if (lines.length === 0) lines.push(t("rolemenu.confirm_none"));

  await interaction.reply({
    components: [createCard({ color: 0x57f287, title: t("rolemenu.title"), body: lines.join("\n") })],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function handleButton(interaction, t) {
  const parts = interaction.customId.split(":");
  const guild = interaction.guild;
  if (!guild) {
    await replyError(interaction, t("rolemenu.guild_only"));
    return true;
  }

  // New format: rolemenu:<menuName>:<roleId>; legacy: rolemenu:<roleId>.
  const [menuName, roleId] = parts.length >= 3 ? [parts[1], parts[2]] : [null, parts[1]];

  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
  const invalidReason = validateMenuRole(t, guild, role);
  if (invalidReason) {
    await replyError(interaction, invalidReason);
    return true;
  }

  const member = await resolveMember(interaction, guild);
  if (!member) {
    await replyError(interaction, t("rolemenu.membership_unresolved"));
    return true;
  }

  const menu = menuName ? await getMenu(guild.id, menuName) : null;
  // Refuse buttons on orphaned messages: menu deleted, or role removed from
  // the menu after posting.
  if (menuName && (!menu || !menu.roles.includes(role.id))) {
    await replyError(interaction, t("rolemenu.menu_outdated"));
    return true;
  }

  const hasRole = member.roles.cache.has(role.id);

  try {
    if (hasRole) {
      await member.roles.remove(role.id, "Role menu self-remove");
      await confirmRoles(t, interaction, [], [role.id]);
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
    await confirmRoles(t, interaction, [role.id], removed);
  } catch {
    await replyError(interaction, t("rolemenu.roles_update_failed"));
  }
  return true;
}

async function handleSelect(interaction, t) {
  const guild = interaction.guild;
  if (!guild) {
    await replyError(interaction, t("rolemenu.guild_only"));
    return true;
  }

  const menuName = interaction.customId.slice(SELECT_PREFIX.length);
  const menu = await getMenu(guild.id, menuName);
  if (!menu) {
    await replyError(interaction, t("rolemenu.menu_gone"));
    return true;
  }

  const member = await resolveMember(interaction, guild);
  if (!member) {
    await replyError(interaction, t("rolemenu.membership_unresolved"));
    return true;
  }

  const chosen = new Set(interaction.values);
  const added = [];
  const removed = [];

  for (const roleId of menu.roles) {
    const role = guild.roles.cache.get(roleId);
    if (validateMenuRole(t, guild, role)) continue;

    const has = member.roles.cache.has(roleId);
    if (chosen.has(roleId) && !has) added.push(roleId);
    if (!chosen.has(roleId) && has) removed.push(roleId);
  }

  try {
    if (removed.length > 0) await member.roles.remove(removed, "Role menu selection");
    if (added.length > 0) await member.roles.add(added, "Role menu selection");
    await confirmRoles(t, interaction, added, removed);
  } catch {
    await replyError(interaction, t("rolemenu.roles_update_failed"));
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
  async onComponent({ interaction, t }) {
    if (interaction.isButton() && interaction.customId.startsWith(BUTTON_PREFIX)) {
      return handleButton(interaction, t);
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(SELECT_PREFIX)) {
      return handleSelect(interaction, t);
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
          invalid_name: ctx.t("rolemenu.create_invalid_name"),
          exists: ctx.t("rolemenu.create_exists"),
          full: ctx.t("rolemenu.create_full", { max: MAX_MENUS }),
        };
        await replyCard(interaction, errorCard(ctx.t, reasons[result.reason] ?? ctx.t("rolemenu.create_failed")), { ephemeral: true });
        return;
      }

      await replyCard(
        interaction,
        successCard(ctx.t, ctx.t("rolemenu.created", { name: result.name })),
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
          title: ctx.t("rolemenu.list_title"),
          body: names.length > 0
            ? names
              .map((name) => {
                const menu = menus[name];
                const status = menu.messageId ? ctx.t("rolemenu.list_posted") : ctx.t("rolemenu.list_not_posted");
                return ctx.t("rolemenu.list_line", {
                  name,
                  count: menu.roles.length,
                  mode: menu.mode,
                  unique: menu.unique ? ctx.t("rolemenu.list_unique") : "",
                  status,
                });
              })
              .join("\n")
            : ctx.t("rolemenu.list_empty"),
        }),
        { ephemeral: true },
      );
      return;
    }

    const name = sanitizeMenuName(interaction.options.getString("name", true));
    const menu = name ? await getMenu(guildId, name) : null;
    if (!menu) {
      await replyCard(interaction, errorCard(ctx.t, ctx.t("rolemenu.not_found")), { ephemeral: true });
      return;
    }

    if (subcommand === "add") {
      const role = interaction.options.getRole("role", true);
      const invalidReason = validateMenuRole(ctx.t, guild, role);
      if (invalidReason) {
        await replyCard(interaction, errorCard(ctx.t, invalidReason), { ephemeral: true });
        return;
      }

      const result = await addMenuRole(guildId, name, role.id);
      if (!result.ok) {
        const reasons = {
          exists: ctx.t("rolemenu.add_exists"),
          full: ctx.t("rolemenu.add_full", { max: MAX_MENU_ROLES }),
          not_found: ctx.t("rolemenu.add_not_found"),
        };
        await replyCard(interaction, errorCard(ctx.t, reasons[result.reason] ?? ctx.t("rolemenu.add_failed")), { ephemeral: true });
        return;
      }

      await replyCard(
        interaction,
        successCard(ctx.t, [
          ctx.t("rolemenu.added", { role_id: role.id, name, count: result.count, max: MAX_MENU_ROLES }),
          ...(menu.messageId ? [ctx.t("rolemenu.repost_hint")] : []),
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
          ? successCard(ctx.t, [
            ctx.t("rolemenu.removed", { role_id: role.id, name, count: result.count }),
            ...(menu.messageId ? [ctx.t("rolemenu.repost_hint")] : []),
          ].join("\n"))
          : errorCard(ctx.t, ctx.t("rolemenu.remove_not_in_menu")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "post") {
      if (menu.roles.length === 0) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("rolemenu.post_empty")), { ephemeral: true });
        return;
      }

      for (const roleId of menu.roles) {
        const invalidReason = validateMenuRole(ctx.t, guild, guild.roles.cache.get(roleId));
        if (invalidReason) {
          await replyCard(
            interaction,
            errorCard(ctx.t, [invalidReason, ctx.t("rolemenu.post_remove_hint", { name })].join("\n")),
            { ephemeral: true },
          );
          return;
        }
      }

      const channel = interaction.options.getChannel("channel")
        ?? (menu.channelId ? guild.channels.cache.get(menu.channelId) : null)
        ?? interaction.channel;
      if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("rolemenu.pick_text_channel")), { ephemeral: true });
        return;
      }

      const payload = buildMenuMessage(ctx.t, guild, menu);

      let updated = false;
      if (menu.messageId && menu.channelId === channel.id) {
        const existing = await channel.messages.fetch(menu.messageId).catch(() => null);
        if (existing) {
          await existing.edit({ components: payload.components, allowedMentions: { parse: [] } });
          updated = true;
        }
      }

      if (!updated) {
        // Posting to a new channel: remove the old message so no orphaned
        // button message keeps floating around.
        if (menu.messageId && menu.channelId && menu.channelId !== channel.id) {
          const oldChannel = guild.channels.cache.get(menu.channelId);
          const oldMessage = await oldChannel?.messages.fetch(menu.messageId).catch(() => null);
          await oldMessage?.delete().catch(() => {});
        }

        const message = await channel.send(payload);
        await setMenuMessage(guildId, name, channel.id, message.id);
      }

      await replyCard(
        interaction,
        successCard(ctx.t, ctx.t(updated ? "rolemenu.post_updated" : "rolemenu.post_posted", { name, channel_id: channel.id })),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "delete") {
      const { confirmed } = await awaitConfirmation(interaction, {
        lang: ctx.lang,
        body: ctx.t("rolemenu.confirm_delete", { name }),
      });
      if (!confirmed) return;

      const removed = await deleteMenu(guildId, name);
      if (removed?.messageId && removed.channelId) {
        const channel = guild.channels.cache.get(removed.channelId);
        const message = await channel?.messages.fetch(removed.messageId).catch(() => null);
        await message?.delete().catch(() => {});
      }

      await replyCard(interaction, successCard(ctx.t, ctx.t("rolemenu.deleted", { name })), { ephemeral: true });
    }
  },
};
