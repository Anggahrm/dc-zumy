import { REST, Routes } from "discord.js";
import { getEnv } from "#config/env.js";
import { replaceCommands } from "#core/loader/commands.js";
import { createCommandRegistry } from "#core/registry/command-registry.js";
import { createLogger } from "#services/logger.js";
import { PROJECT_ROOT } from "#utils/paths.js";

function parseArgs(argv) {
  if (argv.includes("--guild") && argv.includes("--global")) {
    throw new Error("Use only one mode: --guild or --global.");
  }

  return {
    guild: argv.includes("--guild"),
    global: argv.includes("--global"),
    dryRun: argv.includes("--dry-run"),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const mode = args.global ? "global" : "guild";

  const env = getEnv();
  const logger = createLogger(env.logLevel);

  if (mode === "guild" && !env.guildId) {
    throw new Error("DISCORD_GUILD_ID is required when using --guild deploy mode.");
  }

  const registry = createCommandRegistry();
  await replaceCommands({ logger, registry, rootDir: PROJECT_ROOT });
  const body = registry.allAsJson();

  logger.info("Prepared commands", { count: body.length, mode, dryRun: args.dryRun });
  if (args.dryRun) {
    logger.info("Dry run complete. No request was sent to Discord API.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(env.token);
  const route = mode === "guild"
    ? Routes.applicationGuildCommands(env.clientId, env.guildId)
    : Routes.applicationCommands(env.clientId);

  logger.info("Deploying slash commands", { mode });
  const result = await rest.put(route, { body });
  logger.info("Slash commands deployed", { mode, registered: result.length });
}

main().catch((error) => {
  console.error("Failed to deploy commands", error);
  process.exit(1);
});
