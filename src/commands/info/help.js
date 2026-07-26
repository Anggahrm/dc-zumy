import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { BOT_NAME, CUSTOM_IDS } from "#config/constants.js";
import { registerStrings } from "#services/i18n.js";

registerStrings("help", {
  en: {
    command_count_one: "{count} command",
    command_count_many: "{count} commands",
    select_placeholder: "Choose a category...",
    home_title: "## {bot} Command Hub\nPick a category below to browse commands quickly.",
    categories_section: "### Categories\n{lines}",
    tips_section:
      "### Tips\n- Use the menu to switch categories instantly.\n- Commands are grouped to keep things tidy.",
    category_title: "## {category} Commands",
    no_description: "No description",
    no_commands: "- No commands here yet.",
    back_home: "Back to Home",
  },
  id: {
    command_count_one: "{count} command",
    command_count_many: "{count} command",
    select_placeholder: "Pilih kategori...",
    home_title: "## Pusat Command {bot}\nPilih kategori di bawah buat lihat daftar command dengan cepat.",
    categories_section: "### Kategori\n{lines}",
    tips_section:
      "### Tips\n- Pakai menu untuk pindah kategori secara instan.\n- Command dikelompokkan biar tetap rapi.",
    category_title: "## Command {category}",
    no_description: "Tanpa deskripsi",
    no_commands: "- Belum ada command di sini.",
    back_home: "Kembali ke Beranda",
  },
});

function getVisibleCommands(registry, interaction) {
  const permission = interaction.client.zumy?.permission;
  const isOwner = permission?.isOwner(interaction.user.id) ?? false;
  return registry.all().filter((command) => !command.permissions?.owner || isOwner);
}

function getCategories(commands) {
  const counts = new Map();
  for (const command of commands) {
    counts.set(command.category, (counts.get(command.category) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function formatCategoryTitle(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatCommandCount(count, t) {
  return count > 1
    ? t("help.command_count_many", { count })
    : t("help.command_count_one", { count });
}

function buildCategorySelect(commands, selected, t) {
  const options = getCategories(commands).map(([name, count]) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(formatCategoryTitle(name))
      .setDescription(formatCommandCount(count, t))
      .setValue(name)
      .setDefault(selected === name),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(CUSTOM_IDS.HELP_CATEGORY_SELECT)
    .setPlaceholder(t("help.select_placeholder"))
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

function buildHomeContainer(commands, t) {
  const categoryLines = getCategories(commands)
    .map(([name, count]) => `- ${formatCategoryTitle(name)}: ${formatCommandCount(count, t)}`)
    .join("\n");

  return new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t("help.home_title", { bot: BOT_NAME })),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t("help.categories_section", { lines: categoryLines })),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t("help.tips_section")));
}

function buildCategoryContainer(allCommands, category, t) {
  const commands = allCommands
    .filter((command) => command.category === category)
    .sort((a, b) => a.data.name.localeCompare(b.data.name));

  const title = formatCategoryTitle(category);
  const commandLines = commands.length
    ? commands
      .map((command) => `- \/${command.data.name} - ${command.data.description || t("help.no_description")}`)
      .join("\n")
    : t("help.no_commands");

  return new ContainerBuilder()
    .setAccentColor(0x57f287)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t("help.category_title", { category: title })))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(commandLines));
}

function homeButtonRow(t) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.HELP_HOME_BUTTON)
      .setLabel(t("help.back_home"))
      .setStyle(ButtonStyle.Secondary),
  );
}

function createReplyPayload(commands, t) {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [buildHomeContainer(commands, t), buildCategorySelect(commands, null, t)],
  };
}

function createCategoryPayload(commands, category, t) {
  return {
    components: [
      buildCategoryContainer(commands, category, t),
      buildCategorySelect(commands, category, t),
      homeButtonRow(t),
    ],
  };
}

function createHomeUpdatePayload(commands, t) {
  return {
    components: [buildHomeContainer(commands, t), buildCategorySelect(commands, null, t)],
  };
}

export default {
  category: "info",
  cooldown: 2,
  data: new SlashCommandBuilder().setName("help").setDescription("Open help menu"),
  components: {
    [CUSTOM_IDS.HELP_CATEGORY_SELECT]: async ({ interaction, registry, t }) => {
      if (!interaction.isStringSelectMenu()) return;
      const category = interaction.values[0];
      await interaction.update(createCategoryPayload(getVisibleCommands(registry, interaction), category, t));
    },
    [CUSTOM_IDS.HELP_HOME_BUTTON]: async ({ interaction, registry, t }) => {
      if (!interaction.isButton()) return;
      await interaction.update(createHomeUpdatePayload(getVisibleCommands(registry, interaction), t));
    },
  },
  async execute({ interaction, registry, ctx }) {
    await interaction.reply(createReplyPayload(getVisibleCommands(registry, interaction), ctx.t));
  },
};
