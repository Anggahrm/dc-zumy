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
import { registerStrings } from "#services/i18n.js";
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
  updateTicketsConfig,
} from "#services/tickets.js";
import { createCard, replyCard, replyError } from "#utils/respond.js";

const OPEN_ID = "ticket-open";
const CLAIM_PREFIX = "ticket-claim:";
const CLOSE_PREFIX = "ticket-close:";
const MAX_OPEN_TICKETS = 50;

registerStrings("ticket", {
  en: {
    title: "Tickets",
    panel_title: "🎫 Support",
    panel_line_help: "Need help from the staff team?",
    panel_line_button: "Press the button below to open a private ticket — only you and the staff can see it.",
    panel_button: "Open Ticket",
    intro_title: "Ticket #{number}",
    intro_greeting_role: "Hi <@{user_id}>! Describe your issue and <@&{role_id}> will be with you shortly.",
    intro_greeting_staff: "Hi <@{user_id}>! Describe your issue and the staff will be with you shortly.",
    intro_claim_line: "- **Claim** assigns the ticket to a staff member.",
    intro_close_line: "- **Close** saves a transcript and removes this channel.",
    claim_button: "Claim",
    close_button: "Close",
    already_open: "You already have an open ticket: <#{channel_id}>",
    too_many_open: "The server has too many open tickets right now. Please try again later.",
    channel_create_failed: "I couldn't create the ticket channel. Check my permissions (Manage Channels).",
    creation_failed: "Ticket creation failed. Please try again.",
    ready: "Your ticket is ready: <#{channel_id}>",
    claim_staff_only: "Only staff can claim tickets.",
    not_open: "This ticket is no longer open.",
    already_claimed: "Already claimed by <@{user_id}>.",
    claimed_by: "🙋 <@{user_id}> claimed this ticket.",
    close_not_allowed: "Only the ticket owner or staff can close this ticket.",
    transcript_unavailable: "Transcript unavailable.",
    transcript_header: "Ticket #{number} — {guild}\nOpened by: {opened_by}\nClosed by: {closed_by}",
    log_closed: "🎫 Ticket **#{number}** closed by **{closed_by}** (opened by <@{opened_by}>).",
    dm_closed: "Your ticket **#{number}** in **{guild}** was closed. Transcript attached.",
    closed_deleting: "🔒 Ticket closed. This channel will be deleted in a few seconds.",
    pick_text_channel: "Pick a text channel I can post in.",
    post_failed: "I couldn't post in that channel. Check my permissions.",
    panel_posted: "Ticket panel posted in <#{channel_id}>.",
    category_set: "Ticket channels will be created under **{category}**.",
    category_cleared: "Ticket category cleared.",
    role_set: "<@&{role_id}> can now see and claim tickets.",
    role_cleared: "Support role cleared.",
    list_title: "Open tickets",
    list_line: "**#{number}** <#{channel_id}> — <@{user_id}>",
    list_line_claimed: "**#{number}** <#{channel_id}> — <@{user_id}> (claimed by <@{claimed_by}>)",
    list_empty: "No open tickets.",
    not_a_ticket: "This channel is not an open ticket.",
  },
  id: {
    title: "Ticket",
    panel_title: "🎫 Support",
    panel_line_help: "Butuh bantuan dari tim staff?",
    panel_line_button: "Tekan tombol di bawah untuk membuka ticket pribadi — hanya kamu dan staff yang bisa melihatnya.",
    panel_button: "Buka Ticket",
    intro_title: "Ticket #{number}",
    intro_greeting_role: "Hai <@{user_id}>! Ceritakan masalahmu, <@&{role_id}> akan segera membantu.",
    intro_greeting_staff: "Hai <@{user_id}>! Ceritakan masalahmu, staff akan segera membantu.",
    intro_claim_line: "- **Claim** menugaskan ticket ini ke salah satu staff.",
    intro_close_line: "- **Close** menyimpan transkrip lalu menghapus channel ini.",
    claim_button: "Claim",
    close_button: "Close",
    already_open: "Kamu masih punya ticket yang terbuka: <#{channel_id}>",
    too_many_open: "Server ini lagi punya terlalu banyak ticket terbuka. Coba lagi nanti ya.",
    channel_create_failed: "Aku tidak bisa membuat channel ticket-nya. Cek permission-ku (Manage Channels).",
    creation_failed: "Pembuatan ticket gagal. Coba lagi ya.",
    ready: "Ticket-mu sudah siap: <#{channel_id}>",
    claim_staff_only: "Hanya staff yang bisa claim ticket.",
    not_open: "Ticket ini sudah tidak terbuka.",
    already_claimed: "Sudah di-claim oleh <@{user_id}>.",
    claimed_by: "🙋 <@{user_id}> meng-claim ticket ini.",
    close_not_allowed: "Hanya pemilik ticket atau staff yang bisa menutup ticket ini.",
    transcript_unavailable: "Transkrip tidak tersedia.",
    transcript_header: "Ticket #{number} — {guild}\nDibuka oleh: {opened_by}\nDitutup oleh: {closed_by}",
    log_closed: "🎫 Ticket **#{number}** ditutup oleh **{closed_by}** (dibuka oleh <@{opened_by}>).",
    dm_closed: "Ticket-mu **#{number}** di **{guild}** sudah ditutup. Transkripnya terlampir.",
    closed_deleting: "🔒 Ticket ditutup. Channel ini akan dihapus dalam beberapa detik.",
    pick_text_channel: "Pilih text channel yang bisa aku pakai untuk posting.",
    post_failed: "Aku tidak bisa posting di channel itu. Cek permission-ku ya.",
    panel_posted: "Panel ticket sudah diposting di <#{channel_id}>.",
    category_set: "Channel ticket akan dibuat di bawah **{category}**.",
    category_cleared: "Kategori ticket dihapus.",
    role_set: "<@&{role_id}> sekarang bisa melihat dan claim ticket.",
    role_cleared: "Role support dihapus.",
    list_title: "Ticket terbuka",
    list_line: "**#{number}** <#{channel_id}> — <@{user_id}>",
    list_line_claimed: "**#{number}** <#{channel_id}> — <@{user_id}> (di-claim oleh <@{claimed_by}>)",
    list_empty: "Tidak ada ticket terbuka.",
    not_a_ticket: "Channel ini bukan ticket yang terbuka.",
  },
});

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("ticket.title"), body });
}

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("ticket.title"), body });
}

function panelPayload(t) {
  return {
    components: [
      createCard({
        color: 0x5865f2,
        title: t("ticket.panel_title"),
        body: [
          t("ticket.panel_line_help"),
          t("ticket.panel_line_button"),
        ].join("\n"),
      }),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(OPEN_ID)
          .setLabel(t("ticket.panel_button"))
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Primary),
      ),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function ticketIntroPayload(ticket, { userId, supportRoleId }, t) {
  return {
    components: [
      createCard({
        color: 0x5865f2,
        title: t("ticket.intro_title", { number: ticket.ticketNumber }),
        body: [
          supportRoleId
            ? t("ticket.intro_greeting_role", { user_id: userId, role_id: supportRoleId })
            : t("ticket.intro_greeting_staff", { user_id: userId }),
          "",
          t("ticket.intro_claim_line"),
          t("ticket.intro_close_line"),
        ].join("\n"),
      }),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${CLAIM_PREFIX}${ticket.id}`)
          .setLabel(t("ticket.claim_button"))
          .setEmoji("🙋")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${CLOSE_PREFIX}${ticket.id}`)
          .setLabel(t("ticket.close_button"))
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

async function handleOpen(interaction, t) {
  const guild = interaction.guild;
  const config = await getTicketsConfig(guild.id);

  const existing = await getOpenTicketForUser(guild.id, interaction.user.id);
  if (existing) {
    await replyError(interaction, t("ticket.already_open", { channel_id: existing.channelId }));
    return true;
  }

  const openCount = await countOpenTickets(guild.id);
  if (openCount >= MAX_OPEN_TICKETS) {
    await replyError(interaction, t("ticket.too_many_open"));
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
      name: "ticket-new",
      type: ChannelType.GuildText,
      parent: config.categoryId && guild.channels.cache.has(config.categoryId) ? config.categoryId : null,
      permissionOverwrites: overwrites,
      reason: `Ticket opened by ${interaction.user.tag}`,
    });
  } catch {
    await replyCard(interaction, errorCard(t, t("ticket.channel_create_failed")), {
      ephemeral: true,
    });
    return true;
  }

  let ticket;
  try {
    // The DB allocates the ticket number atomically; rename to match.
    ticket = await createTicketRow({
      guildId: guild.id,
      channelId: channel.id,
      userId: interaction.user.id,
    });
  } catch {
    await channel.delete("Ticket allocation failed").catch(() => {});
    await replyCard(interaction, errorCard(t, t("ticket.creation_failed")), { ephemeral: true });
    return true;
  }

  await channel.setName(`ticket-${String(ticket.ticketNumber).padStart(4, "0")}`).catch(() => {});

  await channel.send(ticketIntroPayload(ticket, {
    userId: interaction.user.id,
    supportRoleId: config.supportRoleId,
  }, t)).catch(() => {});

  await replyCard(interaction, successCard(t, t("ticket.ready", { channel_id: channel.id })), { ephemeral: true });
  return true;
}

async function handleClaim(interaction, ticketId, t) {
  const guild = interaction.guild;
  const config = await getTicketsConfig(guild.id);

  if (!isStaff(interaction, config.supportRoleId)) {
    await replyError(interaction, t("ticket.claim_staff_only"));
    return true;
  }

  const ticket = await getTicketById(ticketId);
  if (!ticket || ticket.status !== "open") {
    await replyError(interaction, t("ticket.not_open"));
    return true;
  }

  if (ticket.claimedBy) {
    await replyError(interaction, t("ticket.already_claimed", { user_id: ticket.claimedBy }));
    return true;
  }

  await claimTicket(ticketId, interaction.user.id);
  await interaction.reply({
    components: [
      createCard({
        color: 0x57f287,
        title: t("ticket.title"),
        body: t("ticket.claimed_by", { user_id: interaction.user.id }),
      }),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
  return true;
}

async function handleClose(interaction, ticketId, t) {
  const guild = interaction.guild;
  const config = await getTicketsConfig(guild.id);

  const ticket = await getTicketById(ticketId);
  if (!ticket || ticket.status !== "open") {
    await replyError(interaction, t("ticket.not_open"));
    return true;
  }

  const isOwner = ticket.userId === interaction.user.id;
  if (!isOwner && !isStaff(interaction, config.supportRoleId)) {
    await replyError(interaction, t("ticket.close_not_allowed"));
    return true;
  }

  await interaction.deferReply();

  const channel = guild.channels.cache.get(ticket.channelId) ?? interaction.channel;
  const transcriptText = channel ? await buildTranscript(channel) : t("ticket.transcript_unavailable");
  const transcript = new AttachmentBuilder(
    Buffer.from(
      `${t("ticket.transcript_header", {
        number: ticket.ticketNumber,
        guild: guild.name,
        opened_by: ticket.userId,
        closed_by: interaction.user.tag,
      })}\n\n${transcriptText}`,
      "utf8",
    ),
    { name: `ticket-${String(ticket.ticketNumber).padStart(4, "0")}.txt` },
  );

  await closeTicketRow(ticketId);

  const { channel: logChannel } = await resolveLoggingTarget(guild).catch(() => ({ channel: null }));
  if (logChannel) {
    await logChannel
      .send({
        content: t("ticket.log_closed", {
          number: ticket.ticketNumber,
          closed_by: interaction.user.tag,
          opened_by: ticket.userId,
        }),
        files: [transcript],
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  }

  const opener = await guild.client.users.fetch(ticket.userId).catch(() => null);
  await opener
    ?.send({
      content: t("ticket.dm_closed", { number: ticket.ticketNumber, guild: guild.name }),
      files: [transcript],
    })
    .catch(() => {});

  await interaction.editReply({ content: t("ticket.closed_deleting") })
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
    [OPEN_ID]: async ({ interaction, t }) => {
      if (!interaction.isButton() || !interaction.guild) return;
      await handleOpen(interaction, t);
    },
  },
  async onComponent({ interaction, t }) {
    if (!interaction.isButton() || !interaction.guild) return false;

    if (interaction.customId.startsWith(CLAIM_PREFIX)) {
      const id = Number(interaction.customId.slice(CLAIM_PREFIX.length));
      if (!Number.isInteger(id)) return false;
      return handleClaim(interaction, id, t);
    }

    if (interaction.customId.startsWith(CLOSE_PREFIX)) {
      const id = Number(interaction.customId.slice(CLOSE_PREFIX.length));
      if (!Number.isInteger(id)) return false;
      return handleClose(interaction, id, t);
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
        await replyCard(interaction, errorCard(ctx.t, ctx.t("ticket.pick_text_channel")), { ephemeral: true });
        return;
      }

      try {
        await channel.send(panelPayload(ctx.t));
      } catch {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("ticket.post_failed")), {
          ephemeral: true,
        });
        return;
      }

      await replyCard(interaction, successCard(ctx.t, ctx.t("ticket.panel_posted", { channel_id: channel.id })), { ephemeral: true });
      return;
    }

    if (subcommand === "category") {
      const category = interaction.options.getChannel("category");
      await updateTicketsConfig(guildId, (config) => {
        config.categoryId = category?.id ?? null;
      });
      await replyCard(
        interaction,
        successCard(ctx.t, category
          ? ctx.t("ticket.category_set", { category: category.name })
          : ctx.t("ticket.category_cleared")),
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
        successCard(ctx.t, role
          ? ctx.t("ticket.role_set", { role_id: role.id })
          : ctx.t("ticket.role_cleared")),
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
          title: ctx.t("ticket.list_title"),
          body: rows.length > 0
            ? rows
              .map((row) =>
                ctx.t(row.claimedBy ? "ticket.list_line_claimed" : "ticket.list_line", {
                  number: row.ticketNumber,
                  channel_id: row.channelId,
                  user_id: row.userId,
                  claimed_by: row.claimedBy,
                }))
              .join("\n")
            : ctx.t("ticket.list_empty"),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "close") {
      const ticket = await getTicketByChannel(interaction.channelId);
      if (!ticket || ticket.status !== "open") {
        await replyCard(interaction, errorCard(ctx.t, ctx.t("ticket.not_a_ticket")), { ephemeral: true });
        return;
      }

      await handleClose(interaction, ticket.id, ctx.t);
    }
  },
};
