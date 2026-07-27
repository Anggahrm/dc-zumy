import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  getBirthdaysConfig,
  isValidBirthday,
  removeBirthday,
  setBirthday,
  upcomingBirthdays,
  updateBirthdaysConfig,
} from "#services/birthdays.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

registerStrings("birthday", {
  en: {
    title: "Birthdays",
    month_1: "January",
    month_2: "February",
    month_3: "March",
    month_4: "April",
    month_5: "May",
    month_6: "June",
    month_7: "July",
    month_8: "August",
    month_9: "September",
    month_10: "October",
    month_11: "November",
    month_12: "December",
    invalid_date: "That date doesn't exist. Double-check the day and month.",
    list_full: "This server's birthday list is full.",
    saved: "Your birthday is saved: **{day} {month}** 🎂",
    no_channel_note: "-# Note: no announcement channel is set yet (`/birthday channel`).",
    removed: "Your birthday was removed.",
    not_saved: "You have no birthday saved here.",
    none_yet: "No birthdays saved yet. Be the first with `/birthday set`!",
    upcoming_title: "Upcoming birthdays",
    upcoming_line: "- <@{user_id}> — **{day} {month}** (<t:{timestamp}:R>)",
    need_manage_guild: "You need the **Manage Server** permission for this.",
    channel_set: "Birthdays will be announced in <#{channel_id}> (daily at 00:00 UTC).",
    channel_disabled: "Birthday announcements are off.",
    role_invalid: "That role can't be used (managed, @everyone, or above my highest role).",
    role_set: "Members get <@&{role_id}> on their birthday (removed the day after).",
    role_disabled: "The birthday role is off.",
    template_updated: "New birthday message: {template}",
    template_reset: "Back to the default message.",
  },
  id: {
    title: "Ulang Tahun",
    month_1: "Januari",
    month_2: "Februari",
    month_3: "Maret",
    month_4: "April",
    month_5: "Mei",
    month_6: "Juni",
    month_7: "Juli",
    month_8: "Agustus",
    month_9: "September",
    month_10: "Oktober",
    month_11: "November",
    month_12: "Desember",
    invalid_date: "Tanggal itu tidak ada. Cek lagi hari dan bulannya.",
    list_full: "Daftar ulang tahun server ini sudah penuh.",
    saved: "Ulang tahunmu tersimpan: **{day} {month}** 🎂",
    no_channel_note: "-# Catatan: belum ada channel pengumuman yang diatur (`/birthday channel`).",
    removed: "Ulang tahunmu dihapus.",
    not_saved: "Kamu belum menyimpan ulang tahun di sini.",
    none_yet: "Belum ada ulang tahun yang tersimpan. Jadilah yang pertama dengan `/birthday set`!",
    upcoming_title: "Ulang tahun terdekat",
    upcoming_line: "- <@{user_id}> — **{day} {month}** (<t:{timestamp}:R>)",
    need_manage_guild: "Kamu butuh permission **Manage Server** untuk ini.",
    channel_set: "Ulang tahun akan diumumkan di <#{channel_id}> (tiap hari jam 00:00 UTC).",
    channel_disabled: "Pengumuman ulang tahun dimatikan.",
    role_invalid: "Role itu tidak bisa dipakai (managed, @everyone, atau di atas role tertinggiku).",
    role_set: "Member dapat <@&{role_id}> saat ulang tahun (dilepas keesokan harinya).",
    role_disabled: "Role ulang tahun dimatikan.",
    template_updated: "Pesan ulang tahun baru: {template}",
    template_reset: "Pesan kembali ke bawaan.",
  },
});

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("birthday.title"), body });
}

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("birthday.title"), body });
}

function requireManageGuild(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export default {
  category: "community",
  cooldown: 3,
  permissions: {
    guildOnly: true,
  },
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Server birthdays")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Save your birthday")
        .addIntegerOption((option) =>
          option.setName("day").setDescription("Day (1-31)").setMinValue(1).setMaxValue(31).setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("month")
            .setDescription("Month")
            .addChoices(...MONTH_NAMES.map((name, index) => ({ name, value: index + 1 })))
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("remove").setDescription("Remove your birthday"))
    .addSubcommand((sub) => sub.setName("next").setDescription("Show upcoming birthdays"))
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Set the birthday announcement channel (Manage Server, empty disables)")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Where to celebrate")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("role")
        .setDescription("Set a role given on birthdays (Manage Server, empty disables)")
        .addRoleOption((option) =>
          option.setName("role").setDescription("Birthday role").setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("message")
        .setDescription("Set the birthday announcement message (Manage Server)")
        .addStringOption((option) =>
          option
            .setName("template")
            .setDescription("Use {user} and {server}; empty resets to default")
            .setMaxLength(300)
            .setRequired(false),
        ),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for birthday command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "set") {
      const day = interaction.options.getInteger("day", true);
      const month = interaction.options.getInteger("month", true);

      if (!isValidBirthday(day, month)) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("birthday.invalid_date")), {
          ephemeral: true,
        });
        return;
      }

      const ok = await setBirthday(guildId, interaction.user.id, day, month);
      if (!ok) {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("birthday.list_full")), { ephemeral: true });
        return;
      }

      const { channelId } = await getBirthdaysConfig(guildId);
      await replyCard(
        interaction,
        successCard(ctx.t, [
          ctx.t("birthday.saved", { day, month: ctx.t(`birthday.month_${month}`) }),
          ...(channelId ? [] : [ctx.t("birthday.no_channel_note")]),
        ].join("\n")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const removed = await removeBirthday(guildId, interaction.user.id);
      await replyCard(
        interaction,
        removed ? successCard(ctx.t, ctx.t("birthday.removed")) : errorCard(ctx.t, ctx.t("birthday.not_saved")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "next") {
      const config = await getBirthdaysConfig(guildId);
      const upcoming = upcomingBirthdays(config.entries, new Date(), 10);

      if (upcoming.length === 0) {
        await replyCard(
          interaction,
          createCard({
            color: 0x3498db,
            title: ctx.t("birthday.title"),
            body: ctx.t("birthday.none_yet"),
          }),
          { ephemeral: true },
        );
        return;
      }

      const lines = upcoming.map(({ userId, entry, next }) =>
        ctx.t("birthday.upcoming_line", {
          user_id: userId,
          day: entry.day,
          month: ctx.t(`birthday.month_${entry.month}`),
          timestamp: Math.floor(next / 1000),
        }));

      await replyCard(
        interaction,
        createCard({ color: 0x3498db, title: ctx.t("birthday.upcoming_title"), body: lines.join("\n") }),
        { ephemeral: true },
      );
      return;
    }

    if (!requireManageGuild(interaction)) {
      await replyCard(interaction, errorCard(ctx.t, ctx.t("birthday.need_manage_guild")), { ephemeral: true });
      return;
    }

    if (subcommand === "channel") {
      const channel = interaction.options.getChannel("channel");
      await updateBirthdaysConfig(guildId, (config) => {
        config.channelId = channel?.id ?? null;
      });
      await replyCard(
        interaction,
        successCard(ctx.t, channel
          ? ctx.t("birthday.channel_set", { channel_id: channel.id })
          : ctx.t("birthday.channel_disabled")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "role") {
      const role = interaction.options.getRole("role");
      const me = guild.members.me;
      if (role && (role.id === guild.id || role.managed || (me && role.position >= me.roles.highest.position))) {
        await replyCard(
          interaction,
          errorCard(ctx.t, ctx.t("birthday.role_invalid")),
          { ephemeral: true },
        );
        return;
      }

      await updateBirthdaysConfig(guildId, (config) => {
        config.roleId = role?.id ?? null;
      });
      await replyCard(
        interaction,
        successCard(ctx.t, role
          ? ctx.t("birthday.role_set", { role_id: role.id })
          : ctx.t("birthday.role_disabled")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "message") {
      const template = interaction.options.getString("template")?.trim() || null;
      await updateBirthdaysConfig(guildId, (config) => {
        config.message = template;
      });
      await replyCard(
        interaction,
        successCard(ctx.t, template ? ctx.t("birthday.template_updated", { template }) : ctx.t("birthday.template_reset")),
        { ephemeral: true },
      );
    }
  },
};
