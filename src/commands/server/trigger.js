import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { registerStrings } from "#services/i18n.js";
import {
  createTrigger,
  deleteTrigger,
  getTriggers,
  MAX_MATCH_LENGTH,
  MAX_RESPONSE_LENGTH,
  MAX_TRIGGERS,
  toggleTriggerChannel,
  TRIGGER_TYPES,
} from "#services/triggers.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("trigger", {
  en: {
    title: "Triggers",
    reason_invalid_name: "Trigger names must be 1-32 chars: lowercase letters, numbers, `-`, `_`.",
    reason_exists: "A trigger with that name already exists.",
    reason_full: "Trigger limit reached (max {max}).",
    reason_empty: "Match and response cannot be empty.",
    create_failed: "Could not create the trigger.",
    created: "Trigger `{name}` created.",
    deleted: "Trigger deleted.",
    not_found: "No trigger with that name.",
    channel_added_only: "Trigger now also fires in <#{channel_id}> (and only there).",
    channel_added: "Trigger now also fires in <#{channel_id}>.",
    channel_removed_all: "Channel restriction removed — trigger now fires everywhere.",
    channel_removed: "Trigger no longer fires in <#{channel_id}>.",
    scope_all_channels: "all channels",
    list_line: "- `{name}` — {type} `{match}` ({chance}%, {cooldown}s cd, {scope})",
    list_empty: "No triggers yet. Create one with `/trigger add`.",
  },
  id: {
    title: "Trigger",
    reason_invalid_name: "Nama trigger harus 1-32 karakter: huruf kecil, angka, `-`, `_`.",
    reason_exists: "Trigger dengan nama itu sudah ada.",
    reason_full: "Batas trigger tercapai (maks {max}).",
    reason_empty: "Match dan respons tidak boleh kosong.",
    create_failed: "Tidak bisa membuat trigger itu.",
    created: "Trigger `{name}` dibuat.",
    deleted: "Trigger dihapus.",
    not_found: "Tidak ada trigger dengan nama itu.",
    channel_added_only: "Trigger sekarang juga aktif di <#{channel_id}> (dan hanya di sana).",
    channel_added: "Trigger sekarang juga aktif di <#{channel_id}>.",
    channel_removed_all: "Pembatasan channel dihapus — trigger sekarang aktif di mana saja.",
    channel_removed: "Trigger tidak lagi aktif di <#{channel_id}>.",
    scope_all_channels: "semua channel",
    list_line: "- `{name}` — {type} `{match}` ({chance}%, {cooldown}s cd, {scope})",
    list_empty: "Belum ada trigger. Buat satu dengan `/trigger add`.",
  },
});

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("trigger.title"), body });
}

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("trigger.title"), body });
}

export default {
  category: "server",
  cooldown: 2,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("trigger")
    .setDescription("Auto-respond to chat messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Create an autoresponder")
        .addStringOption((option) =>
          option.setName("name").setDescription("Trigger name (lowercase, no spaces)").setMaxLength(32).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("match").setDescription("Text to match").setMaxLength(MAX_MATCH_LENGTH).setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("response")
            .setDescription("Reply ({user} {username} {server})")
            .setMaxLength(MAX_RESPONSE_LENGTH)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("How to match (default: contains)")
            .addChoices(...TRIGGER_TYPES.map((type) => ({ name: type, value: type })))
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option.setName("chance").setDescription("Reply chance % (default 100)").setMinValue(1).setMaxValue(100).setRequired(false),
        )
        .addIntegerOption((option) =>
          option.setName("cooldown").setDescription("Seconds between replies (default 30)").setMinValue(0).setMaxValue(3600).setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Restrict to one channel (add more via /trigger channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete an autoresponder")
        .addStringOption((option) =>
          option.setName("name").setDescription("Trigger name").setMaxLength(32).setAutocomplete(true).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Toggle a channel restriction on a trigger")
        .addStringOption((option) =>
          option.setName("name").setDescription("Trigger name").setMaxLength(32).setAutocomplete(true).setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to toggle")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List autoresponders")),
  async autocomplete({ interaction }) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const query = String(interaction.options.getFocused() ?? "").toLowerCase();
    const triggers = await getTriggers(interaction.guildId, { preferCache: true });
    await interaction.respond(
      Object.keys(triggers)
        .filter((name) => !query || name.includes(query))
        .sort()
        .slice(0, 25)
        .map((name) => ({ name, value: name })),
    );
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for trigger command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const result = await createTrigger(guildId, interaction.options.getString("name", true), {
        match: interaction.options.getString("match", true),
        response: interaction.options.getString("response", true),
        type: interaction.options.getString("type") ?? "contains",
        chance: interaction.options.getInteger("chance"),
        cooldownSeconds: interaction.options.getInteger("cooldown"),
        channelId: interaction.options.getChannel("channel")?.id ?? null,
      });

      if (!result.ok) {
        const reasons = {
          invalid_name: ctx.t("trigger.reason_invalid_name"),
          exists: ctx.t("trigger.reason_exists"),
          full: ctx.t("trigger.reason_full", { max: MAX_TRIGGERS }),
          empty: ctx.t("trigger.reason_empty"),
        };
        await replyCard(interaction, errorCard(ctx.t, reasons[result.reason] ?? ctx.t("trigger.create_failed")), {
          ephemeral: true,
        });
        return;
      }

      await replyCard(interaction, successCard(ctx.t, ctx.t("trigger.created", { name: result.name })), { ephemeral: true });
      return;
    }

    if (subcommand === "remove") {
      const removed = await deleteTrigger(guildId, interaction.options.getString("name", true));
      await replyCard(
        interaction,
        removed ? successCard(ctx.t, ctx.t("trigger.deleted")) : errorCard(ctx.t, ctx.t("trigger.not_found")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "channel") {
      const channel = interaction.options.getChannel("channel", true);
      const result = await toggleTriggerChannel(guildId, interaction.options.getString("name", true), channel.id);

      if (!result) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("trigger.not_found")), { ephemeral: true });
        return;
      }

      await replyCard(
        interaction,
        successCard(
          ctx.t,
          result.restricted
            ? ctx.t(result.channels.length === 1 ? "trigger.channel_added_only" : "trigger.channel_added", { channel_id: channel.id })
            : result.channels.length === 0
              ? ctx.t("trigger.channel_removed_all")
              : ctx.t("trigger.channel_removed", { channel_id: channel.id }),
        ),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "list") {
      const triggers = await getTriggers(guildId);
      const names = Object.keys(triggers).sort();

      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: ctx.t("trigger.title"),
          body: names.length > 0
            ? names
              .map((name) => {
                const trigger = triggers[name];
                const scope = trigger.channels.length > 0
                  ? trigger.channels.map((id) => `<#${id}>`).join(", ")
                  : ctx.t("trigger.scope_all_channels");
                return ctx.t("trigger.list_line", {
                  name,
                  type: trigger.type,
                  match: trigger.match.replaceAll("`", "'"),
                  chance: trigger.chance,
                  cooldown: trigger.cooldownSeconds,
                  scope,
                });
              })
              .join("\n")
            : ctx.t("trigger.list_empty"),
        }),
        { ephemeral: true },
      );
    }
  },
};
