import { Collection } from "discord.js";

export function createCommandRegistry() {
  const commands = new Collection();
  const componentHandlers = new Collection();
  const commandFiles = new Collection();
  const componentFiles = new Collection();

  function clear() {
    commands.clear();
    componentHandlers.clear();
    commandFiles.clear();
    componentFiles.clear();
  }

  function set(command, filePath = "unknown") {
    const commandName = command.data.name;
    if (commands.has(commandName)) {
      const existingFile = commandFiles.get(commandName);
      throw new Error(`Duplicate command name '${commandName}' in ${filePath} (already defined in ${existingFile})`);
    }

    commands.set(commandName, command);
    commandFiles.set(commandName, filePath);

    if (command.components && typeof command.components === "object") {
      for (const [customId, handler] of Object.entries(command.components)) {
        if (componentHandlers.has(customId)) {
          const existingFile = componentFiles.get(customId);
          throw new Error(
            `Duplicate component customId '${customId}' in ${filePath} (already defined in ${existingFile})`,
          );
        }
        componentHandlers.set(customId, handler);
        componentFiles.set(customId, filePath);
      }
    }
  }

  function get(name) {
    return commands.get(name);
  }

  function getComponentHandler(customId) {
    return componentHandlers.get(customId);
  }

  function all() {
    return [...commands.values()];
  }

  function allAsJson() {
    return all().map((command) => {
      try {
        return command.data.toJSON();
      } catch (error) {
        const commandName = command?.data?.name || "unknown";
        const source = commandFiles.get(commandName) || "unknown";
        throw new Error(
          `Failed to serialize command '${commandName}' from ${source}: ${error?.message || String(error)}`,
        );
      }
    });
  }

  function replaceFrom(otherRegistry) {
    clear();
    for (const entry of otherRegistry.entries()) {
      set(entry.command, entry.filePath);
    }
  }

  function entries() {
    return [...commands.keys()].map((name) => ({
      name,
      command: commands.get(name),
      filePath: commandFiles.get(name),
    }));
  }

  return {
    clear,
    set,
    get,
    all,
    allAsJson,
    replaceFrom,
    entries,
    size: () => commands.size,
    getComponentHandler,
  };
}
