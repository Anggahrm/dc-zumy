// Decides the pg `ssl` option for a connection string. Managed providers like
// Heroku Postgres require TLS but present self-signed certificates, so remote
// hosts get `rejectUnauthorized: false` while local development stays plain.
// PGSSLMODE overrides the auto-detection: disable | require | no-verify.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", ""]);

export function resolveSsl(connectionString) {
  const mode = (process.env.PGSSLMODE ?? "").toLowerCase();
  if (mode === "disable") return false;
  if (mode === "require" || mode === "no-verify") {
    return { rejectUnauthorized: false };
  }
  if (mode === "verify-full" || mode === "verify-ca") {
    return { rejectUnauthorized: true };
  }

  let host = "";
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return false;
  }

  if (LOCAL_HOSTS.has(host)) return false;
  return { rejectUnauthorized: false };
}
