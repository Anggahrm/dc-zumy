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

function getCategories(registry) {
  const counts = new Map();
  for (const command of registry.all()) {
    counts.set(command.category, (counts.get(command.category) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function formatCategoryTitle(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function buildCategorySelect(registry, selected = null) {
  const options = getCategories(registry).map(([name, count]) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(formatCategoryTitle(name))
      .setDescription(`${count} command${count > 1 ? "s" : ""}`)
      .setValue(name)
      .setDefault(selected === name),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(CUSTOM_IDS.HELP_CATEGORY_SELECT)
    .setPlaceholder("Choose a category...")
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

function buildHomeContainer(registry) {
  const categoryLines = getCategories(registry)
    .map(([name, count]) => `- ${formatCategoryTitle(name)}: ${count} command${count > 1 ? "s" : ""}`)
    .join("\n");

  const tips = [
    "- Use the menu to switch categories instantly.",
    "- Commands are grouped to keep things tidy.",
  ].join("\n");

  return new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${BOT_NAME} Command Hub\nPick a category below to browse commands quickly.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Categories\n${categoryLines}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Tips\n${tips}`));
}

function buildCategoryContainer(registry, category) {
  const commands = registry
    .all()
    .filter((command) => command.category === category)
    .sort((a, b) => a.data.name.localeCompare(b.data.name));

  const title = formatCategoryTitle(category);
  const commandLines = commands.length
    ? commands
      .map((command) => `- \/${command.data.name} - ${command.data.description || "No description"}`)
      .join("\n")
    : "- No commands here yet.";

  return new ContainerBuilder()
    .setAccentColor(0x57f287)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title} Commands`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(commandLines));
}

function homeButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.HELP_HOME_BUTTON)
      .setLabel("Back to Home")
      .setStyle(ButtonStyle.Secondary),
  );
}

function createReplyPayload(registry) {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [buildHomeContainer(registry), buildCategorySelect(registry)],
  };
}

function createCategoryPayload(registry, category) {
  return {
    components: [buildCategoryContainer(registry, category), buildCategorySelect(registry, category), homeButtonRow()],
  };
}

function createHomeUpdatePayload(registry) {
  return {
    components: [buildHomeContainer(registry), buildCategorySelect(registry)],
  };
}

export default {
  category: "info",
  cooldown: 2,
  data: new SlashCommandBuilder().setName("help").setDescription("Open help menu"),
  components: {
    [CUSTOM_IDS.HELP_CATEGORY_SELECT]: async ({ interaction, registry }) => {
      if (!interaction.isStringSelectMenu()) return;
      const category = interaction.values[0];
      await interaction.update(createCategoryPayload(registry, category));
    },
    [CUSTOM_IDS.HELP_HOME_BUTTON]: async ({ interaction, registry }) => {
      if (!interaction.isButton()) return;
      await interaction.update(createHomeUpdatePayload(registry));
    },
  },
  async execute({ interaction, registry }) {
    await interaction.reply(createReplyPayload(registry));
  },
};
