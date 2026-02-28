import { DEFAULT_COOLDOWN_SECONDS } from "#config/constants.js";
import { formatError } from "#utils/error.js";
import { replyError as sendErrorReply } from "#utils/respond.js";

export function createInteractionHandler({ registry, logger, cooldowns, permission }) {
  async function replyError(interaction, message) {
    await sendErrorReply(interaction, message);
  }

  async function handleChatInput(interaction) {
    const command = registry.get(interaction.commandName);
    if (!command) {
      await replyError(interaction, "I couldn't find that command.");
      return;
    }

    const perm = permission.hasAccess(interaction, command.permissions);
    if (!perm.ok) {
      await replyError(interaction, perm.reason);
      return;
    }

    const cooldownSeconds = command.cooldown ?? DEFAULT_COOLDOWN_SECONDS;
    const remaining = cooldowns.getRemaining(command.data.name, interaction.user.id, cooldownSeconds);
    if (remaining > 0) {
      await replyError(interaction, `You're a bit fast. Try again in ${remaining}s.`);
      return;
    }

    cooldowns.consume(command.data.name, interaction.user.id, cooldownSeconds);

    try {
      await command.execute({ interaction, registry, logger });
    } catch (error) {
      const details = formatError(error);
      logger.error("Command execution failed", {
        command: command.data.name,
        userId: interaction.user.id,
        message: details.message,
        stack: details.stack,
      });
      await replyError(interaction, "Something went wrong while running that command.");
    }
  }

  async function handleComponent(interaction) {
    const handler = registry.getComponentHandler(interaction.customId);
    if (handler) {
      try {
        await handler({ interaction, registry, logger });
        return;
      } catch (error) {
        const details = formatError(error);
        logger.error("Component handler failed", {
          customId: interaction.customId,
          userId: interaction.user.id,
          message: details.message,
          stack: details.stack,
        });
        await replyError(interaction, "Something broke in this menu action.");
        return;
      }
    }

    for (const command of registry.all()) {
      if (typeof command.onComponent !== "function") continue;

      try {
        const handled = await command.onComponent({ interaction, registry, logger });
        if (handled) {
          return;
        }
      } catch (error) {
        const details = formatError(error);
        logger.error("Dynamic component handler failed", {
          command: command.data?.name,
          customId: interaction.customId,
          userId: interaction.user.id,
          message: details.message,
          stack: details.stack,
        });
        await replyError(interaction, "Something broke in this menu action.");
        return;
      }
    }
  }

  return async function onInteractionCreate(interaction) {
    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction);
      return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      await handleComponent(interaction);
    }
  };
}
