import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { categoryOrder, getCategoryMeta } from "#config/categories.js";
import { BOT_NAME, CUSTOM_IDS } from "#config/constants.js";
import { registerStrings } from "#services/i18n.js";

registerStrings("help", {
  en: {
    select_placeholder: "Choose a category...",
    home_title: "## {bot} Command Hub",
    home_stats: "-# {total} commands · {categories} categories",
    categories_section: "### Categories\n{lines}",
    get_started_admin:
      "### Get started\n- {setup} — guided server setup\n- {language} — switch the bot language (EN/ID)\n- {help} — pick a category below, or look up one command with `/help command:`",
    get_started_member:
      "### Get started\n- {rank} — check your level\n- {daily} — claim your daily reward\n- {help} — pick a category below, or look up one command with `/help command:`",
    category_title: "## {emoji} {category}",
    category_hint: "-# Tip: `/help command:<name>` shows a command's subcommands.",
    subcommand_suffix: " ({count} subcommands)",
    subcommand_suffix_one: " (1 subcommand)",
    no_description: "No description",
    no_commands: "- No commands here yet.",
    back_home: "Back to Home",
    unknown_command: "Couldn't find that command — pick one from the suggestions.",
    detail_category: "- Category: {emoji} {label}",
    detail_cooldown: "- Cooldown: {seconds}s",
    detail_guild_only: "- Server only",
    detail_subcommands: "### Subcommands",
    cat_info: "Info",
    cat_levels: "Levels",
    cat_economy: "Economy",
    cat_utility: "Utility",
    cat_community: "Community",
    cat_roles: "Roles",
    cat_moderation: "Moderation",
    cat_automod: "Automod",
    cat_server: "Server Settings",
    cat_owner: "Bot Owner",
    blurb_info: "The help menu plus user and server info",
    blurb_levels: "XP, ranks, leaderboards, and level rewards",
    blurb_economy: "Earn, gamble, and spend server currency",
    blurb_utility: "Everyday member tools: polls, reminders, AFK, and tags",
    blurb_community: "Giveaways, starboard, suggestions, tickets, birthdays, and voice lounges",
    blurb_roles: "Self-assign role menus, autoroles, and roles that manage themselves",
    blurb_moderation: "Manual mod actions: bans, mutes, warnings, cases, and message cleanup",
    blurb_automod: "Automatic message filtering and raid protection",
    blurb_server: "Setup, welcome messages, logging, announcements, and automated posts",
    blurb_owner: "Owner-only bot maintenance and administration",
  },
  id: {
    select_placeholder: "Pilih kategori...",
    home_title: "## Pusat Command {bot}",
    home_stats: "-# {total} command · {categories} kategori",
    categories_section: "### Kategori\n{lines}",
    get_started_admin:
      "### Mulai dari sini\n- {setup} — setup server terpandu\n- {language} — ganti bahasa bot (EN/ID)\n- {help} — pilih kategori di bawah, atau cari detail satu command lewat `/help command:`",
    get_started_member:
      "### Mulai dari sini\n- {rank} — cek level kamu\n- {daily} — klaim hadiah harianmu\n- {help} — pilih kategori di bawah, atau cari detail satu command lewat `/help command:`",
    category_title: "## {emoji} {category}",
    category_hint: "-# Tip: `/help command:<nama>` menampilkan subcommand sebuah command.",
    subcommand_suffix: " ({count} subcommand)",
    subcommand_suffix_one: " (1 subcommand)",
    no_description: "Tanpa deskripsi",
    no_commands: "- Belum ada command di sini.",
    back_home: "Kembali ke Beranda",
    unknown_command: "Command itu tidak ketemu — pilih dari daftar saran ya.",
    detail_category: "- Kategori: {emoji} {label}",
    detail_cooldown: "- Cooldown: {seconds}s",
    detail_guild_only: "- Khusus server",
    detail_subcommands: "### Subcommand",
    cat_info: "Info",
    cat_levels: "Level",
    cat_economy: "Ekonomi",
    cat_utility: "Utilitas",
    cat_community: "Komunitas",
    cat_roles: "Role",
    cat_moderation: "Moderasi",
    cat_automod: "Moderasi Otomatis",
    cat_server: "Pengaturan Server",
    cat_owner: "Pemilik Bot",
    blurb_info: "Menu bantuan bot plus info pengguna dan server",
    blurb_levels: "XP, peringkat, papan peringkat, dan hadiah level",
    blurb_economy: "Kumpulin uang server, coba peruntunganmu, dan belanja di shop",
    blurb_utility: "Alat sehari-hari buat kamu: polling, pengingat, AFK, dan tag",
    blurb_community: "Giveaway, starboard, saran, tiket, ulang tahun, dan voice channel sementara",
    blurb_roles: "Menu role pilih-sendiri, autorole, dan role yang jalan otomatis",
    blurb_moderation: "Tindakan moderasi manual: ban, mute, peringatan, kasus, dan bersih-bersih pesan",
    blurb_automod: "Filter pesan otomatis dan perlindungan dari raid",
    blurb_server: "Setup awal, pesan sambutan, log, pengumuman, dan pesan otomatis",
    blurb_owner: "Pemeliharaan dan administrasi bot, khusus pemilik bot",
  },
});

const DESCRIPTION_MAX = 70;
const SELECT_DESCRIPTION_MAX = 100;
const ID_CACHE_TTL_MS = 15 * 60 * 1000;
const ID_RETRY_MS = 60 * 1000;
const ID_COLD_WAIT_MS = 2000;

// Command IDs are needed to render clickable </name:id> mentions. They are
// fetched lazily (global first, current guild as fallback for guild-mode
// deploys) and cached; unknown IDs degrade to inline-code /name. A stale map
// is served immediately while a refresh runs in the background, and a cold
// start waits at most ID_COLD_WAIT_MS so the fetch can never eat the 3-second
// interaction ack window.
const idCache = { map: new Map(), fetchedAt: 0, nextRetryAt: 0, promise: null };

async function fetchCommandIds(interaction) {
  const map = new Map();
  try {
    const globalCommands = await interaction.client.application.commands.fetch();
    for (const command of globalCommands.values()) map.set(command.name, command.id);
  } catch {
    // fall through to guild fetch
  }
  if (map.size === 0 && interaction.guild) {
    try {
      const guildCommands = await interaction.guild.commands.fetch();
      for (const command of guildCommands.values()) map.set(command.name, command.id);
    } catch {
      // mentions degrade to inline code
    }
  }
  if (map.size > 0) {
    idCache.map = map;
    idCache.fetchedAt = Date.now();
  }
  return idCache.map;
}

async function getCommandIds(interaction) {
  const now = Date.now();
  const fresh = idCache.fetchedAt > 0 && now - idCache.fetchedAt < ID_CACHE_TTL_MS;
  if (!fresh && !idCache.promise && now >= idCache.nextRetryAt) {
    idCache.nextRetryAt = now + ID_RETRY_MS;
    idCache.promise = fetchCommandIds(interaction).finally(() => {
      idCache.promise = null;
    });
  }
  if (idCache.map.size > 0 || !idCache.promise) {
    return idCache.map;
  }
  return Promise.race([
    idCache.promise,
    new Promise((resolve) => setTimeout(resolve, ID_COLD_WAIT_MS, idCache.map)),
  ]);
}

function mention(ids, name, subPath = null) {
  const id = ids.get(name);
  const path = subPath ? `${name} ${subPath}` : name;
  return id ? `</${path}:${id}>` : `\`/${path}\``;
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function getVisibleCommands(registry, interaction) {
  const permission = interaction.client.zumy?.permission;
  const isOwner = permission?.isOwner(interaction.user.id) ?? false;
  return registry.all().filter((command) => !command.permissions?.owner || isOwner);
}

function getCategories(commands) {
  const buckets = new Map();
  for (const command of commands) {
    if (!buckets.has(command.category)) buckets.set(command.category, []);
    buckets.get(command.category).push(command);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => a.data.name.localeCompare(b.data.name));
  }
  return [...buckets.entries()].sort(
    (a, b) => categoryOrder(a[0]) - categoryOrder(b[0]) || a[0].localeCompare(b[0]),
  );
}

function categoryLabel(key, t) {
  const label = t(`help.cat_${key}`);
  return label.startsWith("help.") ? key.charAt(0).toUpperCase() + key.slice(1) : label;
}

function categoryBlurb(key, t) {
  const blurb = t(`help.blurb_${key}`);
  return blurb.startsWith("help.") ? "" : blurb;
}

function categoryEmoji(key) {
  return getCategoryMeta(key)?.emoji ?? "📁";
}

function subcommandEntries(command) {
  const options = command.data.toJSON().options ?? [];
  const entries = [];
  for (const option of options) {
    if (option.type === 1) {
      entries.push({ path: option.name, description: option.description });
    } else if (option.type === 2) {
      for (const nested of option.options ?? []) {
        if (nested.type === 1) {
          entries.push({ path: `${option.name} ${nested.name}`, description: nested.description });
        }
      }
    }
  }
  return entries;
}

function buildCategorySelect(categories, selected, t) {
  const options = categories.map(([key, commands]) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(categoryLabel(key, t))
      .setEmoji({ name: categoryEmoji(key) })
      .setDescription(
        truncate(`${commands.length} · ${commands.map((c) => c.data.name).join(", ")}`, SELECT_DESCRIPTION_MAX),
      )
      .setValue(key)
      .setDefault(selected === key),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(CUSTOM_IDS.HELP_CATEGORY_SELECT)
    .setPlaceholder(t("help.select_placeholder"))
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

function buildHomeContainer(categories, commandIds, interaction, t) {
  const total = categories.reduce((sum, [, commands]) => sum + commands.length, 0);
  const categoryLines = categories
    .map(([key]) => {
      const blurb = categoryBlurb(key, t);
      return `${categoryEmoji(key)} **${categoryLabel(key, t)}**${blurb ? ` — ${blurb}` : ""}`;
    })
    .join("\n");

  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        t("help.home_title", { bot: BOT_NAME }),
        t("help.home_stats", { total, categories: categories.length }),
      ].join("\n")),
    )
    .setThumbnailAccessory((thumbnail) =>
      thumbnail.setURL(interaction.client.user.displayAvatarURL({ extension: "png", size: 256 })),
    );

  return new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addSectionComponents(header)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t("help.categories_section", { lines: categoryLines })),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
          ? t("help.get_started_admin", {
            setup: mention(commandIds, "setup"),
            language: mention(commandIds, "language"),
            help: mention(commandIds, "help"),
          })
          : t("help.get_started_member", {
            rank: mention(commandIds, "rank"),
            daily: mention(commandIds, "daily"),
            help: mention(commandIds, "help"),
          }),
      ),
    );
}

function buildCategoryContainer(categories, key, commandIds, t) {
  const commands = categories.find(([categoryKey]) => categoryKey === key)?.[1] ?? [];
  const commandLines = commands.length
    ? commands
      .map((command) => {
        const description = truncate(command.data.description || t("help.no_description"), DESCRIPTION_MAX);
        const subCount = subcommandEntries(command).length;
        const suffix = subCount === 0
          ? ""
          : subCount === 1
            ? t("help.subcommand_suffix_one")
            : t("help.subcommand_suffix", { count: subCount });
        return `- ${mention(commandIds, command.data.name)} — ${description}${suffix}`;
      })
      .join("\n")
    : t("help.no_commands");

  return new ContainerBuilder()
    .setAccentColor(getCategoryMeta(key)?.color ?? 0x57f287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t("help.category_title", { emoji: categoryEmoji(key), category: categoryLabel(key, t) }),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(commandLines))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t("help.category_hint")));
}

function buildDetailContainer(command, commandIds, t) {
  const meta = getCategoryMeta(command.category);
  const infoLines = [
    t("help.detail_category", {
      emoji: meta?.emoji ?? "📁",
      label: categoryLabel(command.category, t),
    }),
  ];
  if (command.cooldown) {
    infoLines.push(t("help.detail_cooldown", { seconds: command.cooldown }));
  }
  if (command.permissions?.guildOnly) {
    infoLines.push(t("help.detail_guild_only"));
  }

  const container = new ContainerBuilder()
    .setAccentColor(meta?.color ?? 0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${mention(commandIds, command.data.name)}`,
        command.data.description || t("help.no_description"),
        "",
        ...infoLines,
      ].join("\n")),
    );

  const subs = subcommandEntries(command);
  if (subs.length > 0) {
    const subLines = subs
      .map((sub) => `- ${mention(commandIds, command.data.name, sub.path)} — ${truncate(sub.description, DESCRIPTION_MAX)}`)
      .join("\n");
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${t("help.detail_subcommands")}\n${subLines}`),
      );
  }

  return container;
}

function homeButtonRow(t) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.HELP_HOME_BUTTON)
      .setLabel(t("help.back_home"))
      .setStyle(ButtonStyle.Secondary),
  );
}

async function homePayload(registry, interaction, t) {
  const categories = getCategories(getVisibleCommands(registry, interaction));
  const commandIds = await getCommandIds(interaction);
  return {
    components: [
      buildHomeContainer(categories, commandIds, interaction, t),
      buildCategorySelect(categories, null, t),
    ],
  };
}

async function categoryPayload(registry, interaction, key, t) {
  const categories = getCategories(getVisibleCommands(registry, interaction));
  const commandIds = await getCommandIds(interaction);
  return {
    components: [
      buildCategoryContainer(categories, key, commandIds, t),
      buildCategorySelect(categories, key, t),
      homeButtonRow(t),
    ],
  };
}

async function detailPayload(registry, interaction, command, t) {
  const categories = getCategories(getVisibleCommands(registry, interaction));
  const commandIds = await getCommandIds(interaction);
  return {
    components: [
      buildDetailContainer(command, commandIds, t),
      buildCategorySelect(categories, command.category, t),
      homeButtonRow(t),
    ],
  };
}

export default {
  category: "info",
  cooldown: 2,
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Open the help menu")
    .addStringOption((option) =>
      option
        .setName("command")
        .setDescription("Show details and subcommands for one command")
        .setAutocomplete(true)
        .setRequired(false),
    ),
  components: {
    [CUSTOM_IDS.HELP_CATEGORY_SELECT]: async ({ interaction, registry, t }) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.update(await categoryPayload(registry, interaction, interaction.values[0], t));
    },
    [CUSTOM_IDS.HELP_HOME_BUTTON]: async ({ interaction, registry, t }) => {
      if (!interaction.isButton()) return;
      await interaction.update(await homePayload(registry, interaction, t));
    },
  },
  async autocomplete({ interaction, registry }) {
    const query = String(interaction.options.getFocused() ?? "").toLowerCase();
    const matches = getVisibleCommands(registry, interaction)
      .filter((command) =>
        !query
        || command.data.name.includes(query)
        || (command.data.description ?? "").toLowerCase().includes(query))
      .sort((a, b) => a.data.name.localeCompare(b.data.name))
      .slice(0, 25)
      .map((command) => ({
        name: truncate(`/${command.data.name} — ${command.data.description ?? ""}`, 100),
        value: command.data.name,
      }));
    await interaction.respond(matches);
  },
  async execute({ interaction, registry, ctx }) {
    const requested = interaction.options.getString("command");
    const flags = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

    if (requested) {
      const command = getVisibleCommands(registry, interaction)
        .find((entry) => entry.data.name === requested.toLowerCase().trim());
      if (!command) {
        await interaction.reply({
          flags,
          components: [
            new ContainerBuilder()
              .setAccentColor(0xed4245)
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(ctx.t("help.unknown_command"))),
          ],
        });
        return;
      }
      await interaction.reply({ flags, ...(await detailPayload(registry, interaction, command, ctx.t)) });
      return;
    }

    await interaction.reply({ flags, ...(await homePayload(registry, interaction, ctx.t)) });
  },
};
