export function createCooldownService() {
  const map = new Map();

  function makeKey(commandName, userId) {
    return `${commandName}:${userId}`;
  }

  function getRemaining(commandName, userId, cooldownSeconds) {
    const key = makeKey(commandName, userId);
    const expiresAt = map.get(key);
    if (!expiresAt) return 0;
    const now = Date.now();
    const remainingMs = expiresAt - now;
    if (remainingMs <= 0) {
      map.delete(key);
      return 0;
    }
    return Math.ceil(remainingMs / 1000);
  }

  function consume(commandName, userId, cooldownSeconds) {
    const key = makeKey(commandName, userId);
    const expiresAt = Date.now() + cooldownSeconds * 1000;
    map.set(key, expiresAt);
  }

  return {
    getRemaining,
    consume,
  };
}
