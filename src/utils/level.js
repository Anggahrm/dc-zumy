export function levelFromExp(exp) {
  const value = Math.max(0, Number(exp) || 0);
  return Math.floor(Math.sqrt(value / 100)) + 1;
}

export function expForLevel(level) {
  const target = Math.max(1, Number(level) || 1);
  return (target - 1) ** 2 * 100;
}

export function levelProgress(exp) {
  const level = levelFromExp(exp);
  const current = Math.max(0, Number(exp) || 0) - expForLevel(level);
  const needed = expForLevel(level + 1) - expForLevel(level);
  return { level, current, needed };
}
