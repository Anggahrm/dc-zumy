import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  createTag,
  deleteTag,
  getTag,
  getTags,
  MAX_TAG_CONTENT_LENGTH,
  MAX_TAGS,
} from "#services/tags.js";
import { createCard, replyCard } from "#utils/respond.js";

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Tags", body });
}

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Tags", body });
}

function requireManageGuild(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export default {
  category: "utility",
  cooldown: 2,
  permissions: {
    guildOnly: true,
  },
  data: new SlashCommandBuilder()
    .setName("tag")
    .setDescription("Custom text snippets for this server")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Post a tag in this channel")
        .addStringOption((option) =>
          option.setName("name").setDescription("Tag name").setMaxLength(32).setAutocomplete(true).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all tags"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Create a tag (Manage Server only)")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Tag name (lowercase letters, numbers, - and _)")
            .setMaxLength(32)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("content")
            .setDescription("Tag content")
            .setMaxLength(MAX_TAG_CONTENT_LENGTH)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Delete a tag (Manage Server only)")
        .addStringOption((option) =>
          option.setName("name").setDescription("Tag name").setMaxLength(32).setAutocomplete(true).setRequired(true),
        ),
    ),
  async autocomplete({ interaction }) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const query = String(interaction.options.getFocused() ?? "").toLowerCase();
    const tags = await getTags(interaction.guildId);
    const matches = Object.keys(tags)
      .filter((name) => !query || name.includes(query))
      .sort()
      .slice(0, 25)
      .map((name) => ({ name, value: name }));
    await interaction.respond(matches);
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for tag command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      const tag = await getTag(guildId, interaction.options.getString("name", true));
      if (!tag) {
        await replyCard(interaction, errorCard("No tag with that name. Try `/tag list`."), { ephemeral: true });
        return;
      }

      await interaction.reply({
        components: [
          createCard({
            color: 0x5865f2,
            title: null,
            body: tag.content,
            footer: `Tag: ${tag.name}`,
          }),
        ],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === "list") {
      const tags = await getTags(guildId);
      const names = Object.keys(tags).sort();
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Tags",
          body: names.length > 0
            ? [
              `**${names.length}/${MAX_TAGS} tags**`,
              names.map((name) => `\`${name}\``).join(", "),
            ].join("\n")
            : "No tags yet. Create one with `/tag add`.",
        }),
        { ephemeral: true },
      );
      return;
    }

    if (!requireManageGuild(interaction)) {
      await replyCard(
        interaction,
        errorCard("You need the **Manage Server** permission to manage tags."),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "add") {
      const name = interaction.options.getString("name", true);
      const content = interaction.options.getString("content", true);
      const result = await createTag(guildId, name, content, interaction.user.id);

      if (!result.ok) {
        const reasons = {
          invalid_name: "Tag names must be 1-32 chars: lowercase letters, numbers, `-`, `_`.",
          empty_content: "Tag content cannot be empty.",
          exists: "A tag with that name already exists.",
          full: `Tag limit reached (max ${MAX_TAGS}).`,
        };
        await replyCard(interaction, errorCard(reasons[result.reason] ?? "Could not create the tag."), { ephemeral: true });
        return;
      }

      await replyCard(interaction, successCard(`Tag \`${result.name}\` created. Use \`/tag show name:${result.name}\`.`), {
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "remove") {
      const name = interaction.options.getString("name", true);
      const removed = await deleteTag(guildId, name);
      await replyCard(
        interaction,
        removed ? successCard("Tag deleted.") : errorCard("No tag with that name."),
        { ephemeral: true },
      );
    }
  },
};
