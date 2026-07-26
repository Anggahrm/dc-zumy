import { ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getTempvoiceConfig, setTempvoiceTrigger } from "#services/tempvoice.js";
import { createCard, replyCard } from "#utils/respond.js";

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Temp Voice", body });
}

export default {
  category: "utility",
  cooldown: 5,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ManageChannels],
  },
  data: new SlashCommandBuilder()
    .setName("tempvoice")
    .setDescription("Join-to-create temporary voice channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("trigger")
        .setDescription("Set the join-to-create channel (empty creates one)")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Existing voice channel to use as trigger")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName("off").setDescription("Disable temp voice channels"))
    .addSubcommand((sub) => sub.setName("show").setDescription("Show temp voice status")),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for tempvoice command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "trigger") {
      let channel = interaction.options.getChannel("channel");

      if (!channel) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        channel = await guild.channels
          .create({
            name: "➕ Join to Create",
            type: ChannelType.GuildVoice,
            reason: `Temp voice trigger by ${interaction.user.tag}`,
          })
          .catch(() => null);

        if (!channel) {
          await replyCard(
            interaction,
            createCard({
              color: 0xed4245,
              title: "Temp Voice",
              body: "I couldn't create the trigger channel. I need **Manage Channels**.",
            }),
            { ephemeral: true },
          );
          return;
        }
      }

      await setTempvoiceTrigger(guildId, channel.id);
      await replyCard(
        interaction,
        successCard([
          `Join-to-create enabled: **${channel.name}**`,
          "- Joining it spawns a personal voice channel (creator can rename/manage it).",
          "- Channels are deleted automatically when everyone leaves.",
        ].join("\n")),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "off") {
      await setTempvoiceTrigger(guildId, null);
      await replyCard(interaction, successCard("Temp voice disabled. Existing temp channels clean up as they empty."), {
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "show") {
      const config = await getTempvoiceConfig(guildId);
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Temp Voice",
          body: [
            `- Trigger: ${config.triggerChannelId ? `<#${config.triggerChannelId}>` : "(disabled)"}`,
            `- Active temp channels: **${config.active.length}**`,
          ].join("\n"),
        }),
        { ephemeral: true },
      );
    }
  },
};
