const levels = ["debug", "info", "warn", "error"];

function shouldLog(current, target) {
  return levels.indexOf(target) >= levels.indexOf(current);
}

export function createLogger(level = "info") {
  const activeLevel = levels.includes(level) ? level : "info";

  function safeStringify(meta) {
    try {
      return JSON.stringify(meta);
    } catch {
      return "[unserializable-meta]";
    }
  }

  function write(target, message, meta) {
    if (!shouldLog(activeLevel, target)) return;
    const timestamp = new Date().toISOString();
    const context = meta ? ` ${safeStringify(meta)}` : "";
    const line = `[${timestamp}] [${target.toUpperCase()}] ${message}${context}`;
    if (target === "error" || target === "warn") {
      console.error(line);
      return;
    }
    console.log(line);
  }

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
  };
}
