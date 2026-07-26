import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { registerStrings } from "#services/i18n.js";
import {
  createTag,
  deleteTag,
  getTag,
  getTags,
  MAX_TAG_CONTENT_LENGTH,
  MAX_TAGS,
} from "#services/tags.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("tag", {
  en: {
    title: "Tags",
    not_found_try_list: "No tag with that name. Try `/tag list`.",
    show_footer: "Tag: {name}",
    list_count: "**{count}/{max} tags**",
    list_empty: "No tags yet. Create one with `/tag add`.",
    need_manage_guild: "You need the **Manage Server** permission to manage tags.",
    reason_invalid_name: "Tag names must be 1-32 chars: lowercase letters, numbers, `-`, `_`.",
    reason_empty_content: "Tag content cannot be empty.",
    reason_exists: "A tag with that name already exists.",
    reason_full: "Tag limit reached (max {max}).",
    create_failed: "Could not create the tag.",
    created: "Tag `{name}` created. Use `/tag show name:{name}`.",
    deleted: "Tag deleted.",
    not_found: "No tag with that name.",
  },
  id: {
    title: "Tag",
    not_found_try_list: "Tidak ada tag dengan nama itu. Coba `/tag list`.",
    show_footer: "Tag: {name}",
    list_count: "**{count}/{max} tag**",
    list_empty: "Belum ada tag. Buat satu dengan `/tag add`.",
    need_manage_guild: "Kamu butuh permission **Manage Server** untuk mengelola tag.",
    reason_invalid_name: "Nama tag harus 1-32 karakter: huruf kecil, angka, `-`, `_`.",
    reason_empty_content: "Isi tag tidak boleh kosong.",
    reason_exists: "Tag dengan nama itu sudah ada.",
    reason_full: "Batas tag tercapai (maks {max}).",
    create_failed: "Tidak bisa membuat tag itu.",
    created: "Tag `{name}` dibuat. Pakai `/tag show name:{name}`.",
    deleted: "Tag dihapus.",
    not_found: "Tidak ada tag dengan nama itu.",
  },
});

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("tag.title"), body });
}

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("tag.title"), body });
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
        await replyCard(interaction, errorCard(ctx.t, ctx.t("tag.not_found_try_list")), { ephemeral: true });
        return;
      }

      await interaction.reply({
        components: [
          createCard({
            color: 0x5865f2,
            title: null,
            body: tag.content,
            footer: ctx.t("tag.show_footer", { name: tag.name }),
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
          title: ctx.t("tag.title"),
          body: names.length > 0
            ? [
              ctx.t("tag.list_count", { count: names.length, max: MAX_TAGS }),
              names.map((name) => `\`${name}\``).join(", "),
            ].join("\n")
            : ctx.t("tag.list_empty"),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (!requireManageGuild(interaction)) {
      await replyCard(
        interaction,
        errorCard(ctx.t, ctx.t("tag.need_manage_guild")),
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
          invalid_name: ctx.t("tag.reason_invalid_name"),
          empty_content: ctx.t("tag.reason_empty_content"),
          exists: ctx.t("tag.reason_exists"),
          full: ctx.t("tag.reason_full", { max: MAX_TAGS }),
        };
        await replyCard(interaction, errorCard(ctx.t, reasons[result.reason] ?? ctx.t("tag.create_failed")), { ephemeral: true });
        return;
      }

      await replyCard(interaction, successCard(ctx.t, ctx.t("tag.created", { name: result.name })), {
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "remove") {
      const name = interaction.options.getString("name", true);
      const removed = await deleteTag(guildId, name);
      await replyCard(
        interaction,
        removed ? successCard(ctx.t, ctx.t("tag.deleted")) : errorCard(ctx.t, ctx.t("tag.not_found")),
        { ephemeral: true },
      );
    }
  },
};
