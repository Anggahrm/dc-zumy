import { createBotClient } from "#core/client.js";
import { replaceCommands } from "#core/loader/commands.js";
import { loadEvents } from "#core/loader/events.js";
import { createCommandRegistry } from "#core/registry/command-registry.js";
import { getEnv } from "#config/env.js";
import { createInteractionHandler } from "#app/handler.js";
import { createCooldownService } from "#services/cooldown.js";
import { createLogger } from "#services/logger.js";
import { createPermissionService } from "#services/permission.js";
import { PROJECT_ROOT } from "#utils/paths.js";
import { REST, Routes } from "discord.js";

async function deployGlobalCommandsOnStart({ env, logger, registry }) {
  const body = registry.allAsJson();
  const rest = new REST({ version: "10" }).setToken(env.token);

  logger.info("Deploying slash commands", { mode: "global", trigger: "startup", count: body.length });
  try {
    const result = await rest.put(Routes.applicationCommands(env.clientId), { body });
    logger.info("Slash commands deployed", { mode: "global", trigger: "startup", registered: result.length });
  } catch (error) {
    logger.warn("Slash command deploy failed, continuing startup", {
      mode: "global",
      trigger: "startup",
      message: error?.message || String(error),
      code: error?.code,
      status: error?.status,
    });
  }
}

function setupHotReload({ client, logger, registry }) {
  if (!process.env.ZUMY_HOT_RELOAD || process.env.ZUMY_HOT_RELOAD === "0") {
    return;
  }

  let reloading = false;

  process.on("SIGUSR2", async () => {
    if (reloading) return;
    reloading = true;

    try {
      await replaceCommands({
        logger,
        registry,
        rootDir: PROJECT_ROOT,
        bustCache: true,
      });
      logger.info("Hot reload complete", { commands: registry.size() });
    } catch (error) {
      logger.error("Hot reload failed", { message: error?.message || String(error) });
    } finally {
      reloading = false;
    }
  });

  logger.info("Hot reload enabled", { signal: "SIGUSR2" });
  client.zumy.hotReload = true;
}

async function bootstrap() {
  const env = getEnv();
  const logger = createLogger(env.logLevel);
  const client = createBotClient();
  const registry = createCommandRegistry();
  const cooldowns = createCooldownService();
  const permission = createPermissionService({ owners: env.owners });

  const reloadCommands = async (bustCache = false) => {
    await replaceCommands({
      logger,
      registry,
      rootDir: PROJECT_ROOT,
      bustCache,
    });
  };

  await reloadCommands(false);
  await deployGlobalCommandsOnStart({ env, logger, registry });

  const onInteraction = createInteractionHandler({
    registry,
    logger,
    cooldowns,
    permission,
  });

  client.zumy = {
    env,
    logger,
    registry,
    cooldowns,
    permission,
    onInteraction,
    startedAt: Date.now(),
    hotReload: false,
    reloadCommands,
  };

  setupHotReload({ client, logger, registry });

  await loadEvents({
    client,
    logger,
    rootDir: PROJECT_ROOT,
  });

  logger.info("Logging in", { clientId: env.clientId });
  await client.login(env.token);
}

bootstrap().catch((error) => {
  console.error("Fatal startup error", error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception", error);
});
