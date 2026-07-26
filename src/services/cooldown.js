const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export function createCooldownService() {
  const map = new Map();

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, expiresAt] of map) {
      if (expiresAt <= now) {
        map.delete(key);
      }
    }
  }, SWEEP_INTERVAL_MS);
  sweeper.unref?.();

  function makeKey(commandName, userId) {
    return `${commandName}:${userId}`;
  }

  function getRemaining(commandName, userId) {
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

  function refund(commandName, userId) {
    map.delete(makeKey(commandName, userId));
  }

  function stop() {
    clearInterval(sweeper);
  }

  return {
    getRemaining,
    consume,
    refund,
    stop,
  };
}
