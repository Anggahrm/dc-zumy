import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { recordCase } from "#services/cases.js";
import { applyWarnEscalation } from "#services/escalation.js";
import { addWarning, clearWarnings, getWarnings, removeWarning } from "#services/warnings.js";
import { checkActorHierarchy, normalizeReason } from "#utils/moderation.js";
import { createCard, replyCard } from "#utils/respond.js";

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Moderation", body });
}

function successCard(body) {
  return createCard({ color: 0xf1c40f, title: "Moderation", body });
}

function formatWarningLine(entry, index) {
  return [
    `**${index + 1}.** \`${entry.id}\` — ${entry.reason}`,
    `-# by <@${entry.moderatorId}> · <t:${Math.floor(entry.at / 1000)}:R>`,
  ].join("\n");
}

export default {
  category: "moderation",
  cooldown: 3,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.ModerateMembers],
  },
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Manage member warnings")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Warn a member")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member to warn").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("reason").setDescription("Reason for the warning").setMaxLength(400).setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List a member's warnings")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member to inspect").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove one warning by id")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member whose warning to remove").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("id").setDescription("Warning id (from /warn list)").setAutocomplete(true).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear")
        .setDescription("Clear all warnings for a member")
        .addUserOption((option) =>
          option.setName("target").setDescription("Member whose warnings to clear").setRequired(true),
        ),
    ),
  async autocomplete({ interaction }) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const targetId = interaction.options.get("target")?.value;
    if (typeof targetId !== "string") {
      await interaction.respond([]);
      return;
    }

    const query = String(interaction.options.getFocused() ?? "").toLowerCase();
    const warnings = await getWarnings(interaction.guildId, targetId);
    const matches = warnings
      .filter((entry) => !query || entry.id.includes(query) || entry.reason.toLowerCase().includes(query))
      .slice(-25)
      .map((entry) => ({
        name: `${entry.id} — ${entry.reason}`.slice(0, 100),
        value: entry.id,
      }));
    await interaction.respond(matches);
  },
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for warn command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();
    const target = interaction.options.getUser("target", true);

    if (subcommand === "add") {
      const actorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!actorMember) {
        throw new Error("Failed to resolve invoking member.");
      }

      const targetMember = await guild.members.fetch(target.id).catch(() => null);
      const rejection = checkActorHierarchy({
        guild,
        actorUserId: interaction.user.id,
        actorMember,
        targetUserId: target.id,
        targetMember,
      });
      if (rejection) {
        await replyCard(interaction, errorCard(rejection), { ephemeral: true });
        return;
      }

      if (target.bot) {
        await replyCard(interaction, errorCard("You cannot warn a bot."), { ephemeral: true });
        return;
      }

      const reason = normalizeReason(interaction.options.getString("reason"));
      const { entry, count } = await addWarning(guildId, target.id, {
        moderatorId: interaction.user.id,
        reason,
      });

      const caseRow = await recordCase({
        guild,
        type: "warn",
        target,
        moderator: interaction.user,
        reason,
        metadata: { warningId: entry.id, totalWarnings: count },
      });

      let dmDelivered = true;
      try {
        await target.send({
          components: [
            createCard({
              color: 0xf1c40f,
              title: "Warning",
              body: [
                `You received a warning in **${guild.name}**.`,
                `- Reason: ${reason}`,
                `- Total warnings: **${count}**`,
              ].join("\n"),
            }),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch {
        dmDelivered = false;
      }

      const escalated = await applyWarnEscalation({
        guild,
        user: target,
        warningCount: count,
        logger: interaction.client.zumy?.logger,
      });

      await replyCard(
        interaction,
        successCard([
          `**Warning Issued**${caseRow ? ` — Case #${caseRow.caseNumber}` : ""}`,
          `- Target: **${target.tag}** (\`${target.id}\`)`,
          `- Reason: ${reason}`,
          `- Warning ID: \`${entry.id}\``,
          `- Total warnings: **${count}**`,
          ...(escalated ? [`- ⚖️ Escalation triggered: **${escalated}**`] : []),
          ...(dmDelivered ? [] : ["- Note: could not DM the member."]),
        ].join("\n")),
      );
      return;
    }

    if (subcommand === "list") {
      const warnings = await getWarnings(guildId, target.id);
      if (warnings.length === 0) {
        await replyCard(
          interaction,
          createCard({
            color: 0x57f287,
            title: "Moderation",
            body: `**${target.tag}** has no warnings.`,
          }),
          { ephemeral: true },
        );
        return;
      }

      const lines = warnings.slice(-15).map((entry, index) => formatWarningLine(entry, index));
      await replyCard(
        interaction,
        createCard({
          color: 0x3498db,
          title: "Moderation",
          body: [
            `**Warnings for ${target.tag}** (${warnings.length} total${warnings.length > 15 ? ", showing latest 15" : ""})`,
            "",
            ...lines,
          ].join("\n"),
        }),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "remove") {
      const warnId = interaction.options.getString("id", true).trim();
      const removed = await removeWarning(guildId, target.id, warnId);
      await replyCard(
        interaction,
        removed
          ? successCard(`Warning \`${warnId.replaceAll("`", "'")}\` removed from **${target.tag}**.`)
          : errorCard(`No warning with that id found for **${target.tag}**.`),
        { ephemeral: true },
      );
      return;
    }

    if (subcommand === "clear") {
      const cleared = await clearWarnings(guildId, target.id);
      await replyCard(
        interaction,
        cleared > 0
          ? successCard(`Cleared **${cleared}** warning(s) for **${target.tag}**.`)
          : errorCard(`**${target.tag}** has no warnings to clear.`),
        { ephemeral: true },
      );
    }
  },
};
