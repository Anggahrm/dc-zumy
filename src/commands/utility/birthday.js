import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  getBirthdaysConfig,
  isValidBirthday,
  removeBirthday,
  setBirthday,
  upcomingBirthdays,
  updateBirthdaysConfig,
} from "#services/birthdays.js";
import { createCard, replyCard } from "#utils/respond.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Birthdays", body });
}

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Birthdays", body });
}

function requireManageGuild(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export default {
  category: "utility",
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
        .setDescription("Set the announcement template (Manage Server)")
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
        await replyCard(interaction, errorCard("That date doesn't exist. Double-check the day and month."), {
          ephemeral: true,
        });
        return;
      }

      const ok = await setBirthday(guildId, interaction.user.id, day, month);
      if (!ok) {
        await replyCard(interaction, errorCard("This server's birthday list is full."), { ephemeral: true });
        return;
      }

      const { channelId } = await getBirthdaysConfig(guildId);
      await replyCard(
        interaction,
        successCard([
          `Your birthday is saved: **${day} ${MONTH_NAMES[month - 1]}** 🎂`,
          ...(channelId ? [] : ["-# Note: no announcement channel is set yet (`/birthday channel`)."]),
        ].join("\n")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const removed = await removeBirthday(guildId, interaction.user.id);
      await replyCard(
        interaction,
        removed ? successCard("Your birthday was removed.") : errorCard("You have no birthday saved here."),
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
            title: "Birthdays",
            body: "No birthdays saved yet. Be the first with `/birthday set`!",
          }),
          { ephemeral: true },
        );
        return;
      }

      const lines = upcoming.map(({ userId, entry, next }) =>
        `- <@${userId}> — **${entry.day} ${MONTH_NAMES[entry.month - 1]}** (<t:${Math.floor(next / 1000)}:R>)`);

      await replyCard(
        interaction,
        createCard({ color: 0x3498db, title: "Upcoming birthdays", body: lines.join("\n") }),
        { ephemeral: true },
      );
      return;
    }

    if (!requireManageGuild(interaction)) {
      await replyCard(interaction, errorCard("You need **Manage Server** for this subcommand."), { ephemeral: true });
      return;
    }

    if (subcommand === "channel") {
      const channel = interaction.options.getChannel("channel");
      await updateBirthdaysConfig(guildId, (config) => {
        config.channelId = channel?.id ?? null;
      });
      await replyCard(
        interaction,
        successCard(channel
          ? `Birthdays will be announced in <#${channel.id}> (daily at 00:00 UTC).`
          : "Birthday announcements disabled."),
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
          errorCard("That role can't be used (managed, @everyone, or above my highest role)."),
          { ephemeral: true },
        );
        return;
      }

      await updateBirthdaysConfig(guildId, (config) => {
        config.roleId = role?.id ?? null;
      });
      await replyCard(
        interaction,
        successCard(role
          ? `Members get <@&${role.id}> on their birthday (removed the day after).`
          : "Birthday role disabled."),
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
        successCard(template ? `Template updated: ${template}` : "Template reset to default."),
        { ephemeral: true },
      );
    }
  },
};
