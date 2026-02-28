import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createCommandRegistry } from "#core/registry/command-registry.js";

function validatePermissions(permissions) {
  if (permissions == null) return true;
  if (typeof permissions !== "object" || Array.isArray(permissions)) return false;
  const keys = ["owner", "admin", "guildOnly"];
  for (const key of Object.keys(permissions)) {
    if (!keys.includes(key)) return false;
    if (typeof permissions[key] !== "boolean") return false;
  }
  return true;
}

function isValidCommand(command) {
  if (!command || typeof command !== "object") return false;
  if (!command.data || typeof command.data.toJSON !== "function") return false;
  if (typeof command.execute !== "function") return false;
  if (!command.category || typeof command.category !== "string") return false;
  if (command.cooldown != null && (!Number.isInteger(command.cooldown) || command.cooldown < 0)) return false;
  if (!validatePermissions(command.permissions)) return false;
  if (command.components != null) {
    if (typeof command.components !== "object" || Array.isArray(command.components)) return false;
    for (const handler of Object.values(command.components)) {
      if (typeof handler !== "function") return false;
    }
  }
  if (command.onComponent != null && typeof command.onComponent !== "function") return false;
  return true;
}

export async function loadCommands({ logger, rootDir, bustCache = false }) {
  const commandsRoot = path.join(rootDir, "src", "commands");
  const categories = await readdir(commandsRoot, { withFileTypes: true });
  const nextRegistry = createCommandRegistry();
  const errors = [];

  for (const category of categories) {
    if (!category.isDirectory()) continue;

    const categoryDir = path.join(commandsRoot, category.name);
    const files = await readdir(categoryDir, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".js")) continue;

      const filePath = path.join(categoryDir, file.name);
      const moduleUrl = pathToFileURL(filePath).href;
      const importUrl = bustCache ? `${moduleUrl}?update=${Date.now()}` : moduleUrl;
      let command;
      try {
        const module = await import(importUrl);
        command = module.default;
      } catch (error) {
        errors.push({ filePath, reason: `Import failed: ${error?.message || String(error)}` });
        continue;
      }

      if (!isValidCommand(command)) {
        errors.push({ filePath, reason: "Invalid command contract" });
        continue;
      }

      try {
        nextRegistry.set(command, filePath);
        logger.debug("Command loaded", { name: command.data.name, category: command.category });
      } catch (error) {
        errors.push({ filePath, reason: error?.message || String(error) });
      }
    }
  }

  if (errors.length > 0) {
    logger.error("Command loading failed", { errors });
    const err = new Error("Command loading failed due to invalid modules");
    err.details = errors;
    throw err;
  }

  logger.info("Commands loaded", { count: nextRegistry.size() });
  return nextRegistry;
}

export async function replaceCommands({ logger, registry, rootDir, bustCache = false }) {
  const nextRegistry = await loadCommands({
    logger,
    rootDir,
    bustCache,
  });

  registry.replaceFrom(nextRegistry);
  logger.info("Commands applied", { count: registry.size() });
  return registry.size();
}
