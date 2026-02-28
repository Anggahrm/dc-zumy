import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function isValidEvent(event) {
  if (!event || typeof event !== "object") return false;
  if (!event.name || typeof event.name !== "string") return false;
  if (typeof event.execute !== "function") return false;
  return true;
}

export async function loadEvents({ client, logger, rootDir }) {
  const eventsDir = path.join(rootDir, "src", "events");
  const files = await readdir(eventsDir, { withFileTypes: true });
  let loaded = 0;
  const errors = [];

  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".js")) continue;
    const filePath = path.join(eventsDir, file.name);
    const moduleUrl = pathToFileURL(filePath).href;
    let event;

    try {
      const module = await import(moduleUrl);
      event = module.default;
    } catch (error) {
      errors.push({ filePath, reason: `Import failed: ${error?.message || String(error)}` });
      continue;
    }

    if (!isValidEvent(event)) {
      errors.push({ filePath, reason: "Invalid event contract" });
      continue;
    }

    if (event.once) {
      client.once(event.name, async (...args) => {
        try {
          await Promise.resolve(event.execute(...args));
        } catch (error) {
          logger.error("Event execution failed", {
            event: event.name,
            filePath,
            message: error?.message || String(error),
          });
        }
      });
    } else {
      client.on(event.name, async (...args) => {
        try {
          await Promise.resolve(event.execute(...args));
        } catch (error) {
          logger.error("Event execution failed", {
            event: event.name,
            filePath,
            message: error?.message || String(error),
          });
        }
      });
    }
    loaded += 1;
  }

  if (errors.length > 0) {
    logger.error("Event loading failed", { errors });
    const err = new Error("Event loading failed due to invalid modules");
    err.details = errors;
    throw err;
  }

  logger.info("Events loaded", { count: loaded });
}
