import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { resolveLoggingTarget } from "#services/logging.js";
import {
  buildTranscript,
  claimTicket,
  closeTicketRow,
  countOpenTickets,
  createTicketRow,
  getOpenTicketForUser,
  getTicketByChannel,
  getTicketById,
  getTicketsConfig,
  listOpenTickets,
  nextTicketNumber,
  updateTicketsConfig,
} from "#services/tickets.js";
import { createCard, replyCard, replyError } from "#utils/respond.js";

const OPEN_ID = "ticket-open";
const CLAIM_PREFIX = "ticket-claim:";
const CLOSE_PREFIX = "ticket-close:";
const MAX_OPEN_TICKETS = 50;

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Tickets", body });
}

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Tickets", body });
}

function panelPayload() {
  return {
    components: [
      createCard({
        color: 0x5865f2,
        title: "🎫 Support",
        body: [
          "Need help from the staff team?",
          "Press the button below to open a private ticket — only you and the staff can see it.",
        ].join("\n"),
      }),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(OPEN_ID)
          .setLabel("Open Ticket")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Primary),
      ),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function ticketIntroPayload(ticket, { userId, supportRoleId }) {
  return {
    components: [
      createCard({
        color: 0x5865f2,
        title: `Ticket #${ticket.ticketNumber}`,
        body: [
          `Hi <@${userId}>! Describe your issue and ${supportRoleId ? `<@&${supportRoleId}>` : "the staff"} will be with you shortly.`,
          "",
          "- **Claim** assigns the ticket to a staff member.",
          "- **Close** saves a transcript and removes this channel.",
        ].join("\n"),
      }),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${CLAIM_PREFIX}${ticket.id}`)
          .setLabel("Claim")
          .setEmoji("🙋")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${CLOSE_PREFIX}${ticket.id}`)
          .setLabel("Close")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger),
      ),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [userId], roles: supportRoleId ? [supportRoleId] : [] },
  };
}

function isStaff(interaction, supportRoleId) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) return true;
  if (!supportRoleId) return false;
  return interaction.member?.roles?.cache?.has(supportRoleId) ?? false;
}

async function handleOpen(interaction) {
  const guild = interaction.guild;
  const config = await getTicketsConfig(guild.id);

  const existing = await getOpenTicketForUser(guild.id, interaction.user.id);
  if (existing) {
    await replyError(interaction, `You already have an open ticket: <#${existing.channelId}>`);
    return true;
  }

  const openCount = await countOpenTickets(guild.id);
  if (openCount >= MAX_OPEN_TICKETS) {
    await replyError(interaction, "The server has too many open tickets right now. Please try again later.");
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ticketNumber = await nextTicketNumber(guild.id);
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    },
  ];
  if (config.supportRoleId && guild.roles.cache.has(config.supportRoleId)) {
    overwrites.push({
      id: config.supportRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  let channel;
  try {
    channel = await guild.channels.create({
      name: `ticket-${String(ticketNumber).padStart(4, "0")}`,
      type: ChannelType.GuildText,
      parent: config.categoryId && guild.channels.cache.has(config.categoryId) ? config.categoryId : null,
      permissionOverwrites: overwrites,
      reason: `Ticket #${ticketNumber} opened by ${interaction.user.tag}`,
    });
  } catch {
    await replyCard(interaction, errorCard("I couldn't create the ticket channel. Check my permissions (Manage Channels)."), {
      ephemeral: true,
    });
    return true;
  }

  const ticket = await createTicketRow({
    guildId: guild.id,
    ticketNumber,
    channelId: channel.id,
    userId: interaction.user.id,
  });

  await channel.send(ticketIntroPayload(ticket, {
    userId: interaction.user.id,
    supportRoleId: config.supportRoleId,
  })).catch(() => {});

  await replyCard(interaction, successCard(`Your ticket is ready: <#${channel.id}>`), { ephemeral: true });
  return true;
}

async function handleClaim(interaction, ticketId) {
  const guild = interaction.guild;
  const config = await getTicketsConfig(guild.id);

  if (!isStaff(interaction, config.supportRoleId)) {
    await replyError(interaction, "Only staff can claim tickets.");
    return true;
  }

  const ticket = await getTicketById(ticketId);
  if (!ticket || ticket.status !== "open") {
    await replyError(interaction, "This ticket is no longer open.");
    return true;
  }

  if (ticket.claimedBy) {
    await replyError(interaction, `Already claimed by <@${ticket.claimedBy}>.`);
    return true;
  }

  await claimTicket(ticketId, interaction.user.id);
  await interaction.reply({
    components: [
      createCard({
        color: 0x57f287,
        title: "Tickets",
        body: `🙋 <@${interaction.user.id}> claimed this ticket.`,
      }),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
  return true;
}

async function handleClose(interaction, ticketId) {
  const guild = interaction.guild;
  const config = await getTicketsConfig(guild.id);

  const ticket = await getTicketById(ticketId);
  if (!ticket || ticket.status !== "open") {
    await replyError(interaction, "This ticket is no longer open.");
    return true;
  }

  const isOwner = ticket.userId === interaction.user.id;
  if (!isOwner && !isStaff(interaction, config.supportRoleId)) {
    await replyError(interaction, "Only the ticket owner or staff can close this ticket.");
    return true;
  }

  await interaction.deferReply();

  const channel = guild.channels.cache.get(ticket.channelId) ?? interaction.channel;
  const transcriptText = channel ? await buildTranscript(channel) : "Transcript unavailable.";
  const transcript = new AttachmentBuilder(
    Buffer.from(
      `Ticket #${ticket.ticketNumber} — ${guild.name}\nOpened by: ${ticket.userId}\nClosed by: ${interaction.user.tag}\n\n${transcriptText}`,
      "utf8",
    ),
    { name: `ticket-${String(ticket.ticketNumber).padStart(4, "0")}.txt` },
  );

  await closeTicketRow(ticketId);

  const { channel: logChannel } = await resolveLoggingTarget(guild).catch(() => ({ channel: null }));
  if (logChannel) {
    await logChannel
      .send({
        content: `🎫 Ticket **#${ticket.ticketNumber}** closed by **${interaction.user.tag}** (opened by <@${ticket.userId}>).`,
        files: [transcript],
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  }

  const opener = await guild.client.users.fetch(ticket.userId).catch(() => null);
  await opener
    ?.send({
      content: `Your ticket **#${ticket.ticketNumber}** in **${guild.name}** was closed. Transcript attached.`,
      files: [transcript],
    })
    .catch(() => {});

  await interaction.editReply({ content: "🔒 Ticket closed. This channel will be deleted in a few seconds." })
    .catch(() => {});

  setTimeout(() => {
    channel?.delete(`Ticket #${ticket.ticketNumber} closed`).catch(() => {});
  }, 5000).unref?.();
  return true;
}

export default {
  category: "utility",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageGuild],
  },
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Support ticket system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("panel")
        .setDescription("Post the open-ticket panel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Where to post (defaults to current channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("category")
        .setDescription("Category for ticket channels (empty clears)")
        .addChannelOption((option) =>
          option
            .setName("category")
            .setDescription("Category")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("role")
        .setDescription("Support role that sees tickets (empty clears)")
        .addRoleOption((option) =>
          option.setName("role").setDescription("Support role").setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List open tickets"))
    .addSubcommand((sub) => sub.setName("close").setDescription("Close the ticket in this channel")),
  components: {
    [OPEN_ID]: async ({ interaction }) => {
      if (!interaction.isButton() || !interaction.guild) return;
      await handleOpen(interaction);
    },
  },
  async onComponent({ interaction }) {
    if (!interaction.isButton() || !interaction.guild) return false;

    if (interaction.customId.startsWith(CLAIM_PREFIX)) {
      const id = Number(interaction.customId.slice(CLAIM_PREFIX.length));
      if (!Number.isInteger(id)) return false;
      return handleClaim(interaction, id);
    }

    if (interaction.customId.startsWith(CLOSE_PREFIX)) {
      const id = Number(interaction.customId.slice(CLOSE_PREFIX.length));
      if (!Number.isInteger(id)) return false;
      return handleClose(interaction, id);
    }

    return false;
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for ticket command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "panel") {
      const channel = interaction.options.getChannel("channel") ?? interaction.channel;
      if (!channel?.isTextBased() || typeof channel.send !== "function") {
        await replyCard(interaction, errorCard("Pick a text channel I can post in."), { ephemeral: true });
        return;
      }

      try {
        await channel.send(panelPayload());
      } catch {
        await replyCard(interaction, errorCard("I couldn't post in that channel. Check my permissions."), {
          ephemeral: true,
        });
        return;
      }

      await replyCard(interaction, successCard(`Ticket panel posted in <#${channel.id}>.`), { ephemeral: true });
      return;
    }

    if (subcommand === "category") {
      const category = interaction.options.getChannel("category");
      await updateTicketsConfig(guildId, (config) => {
        config.categoryId = category?.id ?? null;
      });
      await replyCard(
        interaction,
        successCard(category ? `Ticket channels will be created under **${category.name}**.` : "Ticket category cleared."),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "role") {
      const role = interaction.options.getRole("role");
      await updateTicketsConfig(guildId, (config) => {
        config.supportRoleId = role?.id ?? null;
      });
      await replyCard(
        interaction,
        successCard(role ? `<@&${role.id}> can now see and claim tickets.` : "Support role cleared."),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "list") {
      const rows = await listOpenTickets(guildId);
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Open tickets",
          body: rows.length > 0
            ? rows
              .map((row) =>
                `**#${row.ticketNumber}** <#${row.channelId}> — <@${row.userId}>${row.claimedBy ? ` (claimed by <@${row.claimedBy}>)` : ""}`)
              .join("\n")
            : "No open tickets.",
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "close") {
      const ticket = await getTicketByChannel(interaction.channelId);
      if (!ticket || ticket.status !== "open") {
        await replyCard(interaction, errorCard("This channel is not an open ticket."), { ephemeral: true });
        return;
      }

      await handleClose(interaction, ticket.id);
    }
  },
};
