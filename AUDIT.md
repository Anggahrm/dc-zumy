# ZumyNext Full Audit

Audit date: 2026-07-26 · Commit audited: `d1ef25f` (main)

Scope: all runtime source (`src/`), deploy scripts, migrations, docs, deployment
config (`Procfile`, `app.json`), dependency manifest, and full git history
(secret scan). No automated tests exist in the repository, so all findings are
from manual code review.

## Summary

The codebase is well-structured for its size: clear module boundaries, an
atomic command-reload path with duplicate detection, parameterized queries via
Drizzle with strict snowflake-ID validation, `allowedMentions: { parse: [] }`
on log output, and proper role-hierarchy checks in `/kick` and `/ban`. Git
history contains no leaked tokens or credentials, and dependencies are current
major versions.

The most important problems are: a latent lost-update path in the database
adapter that the README actively encourages users to hit (H1), a Heroku
`app.json` that omits a required env var so one-click deploys crash on boot
(H2), an unbounded 300 ms save-retry loop on persistent DB failure (H3), and
two conflicting definitions of the default logging config (M1).

Severity: **High** = data loss or broken deploy; **Medium** = incorrect
behavior or operational risk in realistic conditions; **Low** = hardening,
performance, or polish.

---

## High

### H1. DB adapter can overwrite stored data with defaults (lost update)

`src/db/adapter.js:150` — `ensureRecord` returns a fresh default record
synchronously and kicks off a *background* load (`void this.loadRecord(...)`).
Any write made before that load resolves calls `queueSave`, which marks the
record dirty; `loadRecordInternal` (adapter.js:229) then refuses to apply the
row that came back from PostgreSQL, and the debounced save persists
`defaults + delta`, silently destroying the stored record (e.g. a user's
accumulated `money`/`exp`).

Current commands are safe only because `handler.js` preloads `ctx.user`,
`ctx.guild`, and `ctx.mention` with awaited loads. But the README ("Database
usage (global style)") documents `global.db.data.users[customUserId].money += 5000`
as a supported pattern, and `resolveMentionId` (handler.js:10) only preloads
five hard-coded option names (`target`, `user`, `member`, `mention`,
`receiver`) — any future command using another option name, an event handler,
or a component handler that touches `global.db.data.*` without an explicit
`await loadUser/loadGuild` walks straight into this.

Recommendation: make first access safe — e.g. have the collection-proxy `get`
throw (or return a load-required stub) for records that have never completed a
load, or merge DB data field-wise under dirty keys instead of skipping the
whole record. At minimum, update the README to state that `loadUser`/`loadGuild`
must be awaited before any read-modify-write.

### H2. `app.json` omits `DATABASE_URL` — Heroku button deploys crash on boot

`app.json` declares `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, etc., but not
`DATABASE_URL` (or `ZUMY_STARTUP_DEPLOY_MODE`), while `getRuntimeEnv`
(`src/config/env.js:46`) hard-requires `DATABASE_URL` and the `Procfile`
release phase runs `bun run db:migrate`, which also throws without it
(`drizzle.config.js:5`). A "Deploy to Heroku" setup created from `app.json`
therefore fails at the release phase / first boot. Add `DATABASE_URL` (and
optionally the deploy-mode var) to `app.json`'s `env` block, or attach a
Postgres addon via `app.json`'s `addons` field.

### H3. Failed saves retry forever every 300 ms with no backoff

`src/db/adapter.js:301` — when `saveRecord` rejects, the catch handler calls
`scheduleSave(..., { markDirty: false })`, which re-arms the 300 ms debounce
timer unconditionally. During a DB outage every dirty key retries roughly 3×
per second indefinitely, spamming `console.error` and hammering the pool.
Add exponential backoff and a retry cap (with the dirty flag kept so a later
flush still persists the data).

---

## Medium

### M1. Two conflicting sources of truth for default logging config

`src/db/defaults.js:12` enables eight logging events by default
(`deleted_messages`, `edited_messages`, `member_roles`, `name_updates`,
`avatar_updates`, `bans`, `unbans`, `joins`, `leaves`), while
`LOGGING_DEFAULTS` in `src/services/logging.js:60` sets **all** events to
false — and commit `d4b74c2` says the intent was "default logging off".
Which defaults a guild actually gets depends on which code path first created
its record (`ensureRecord` → defaults.js wins; corrupt/missing `logging` key →
LOGGING_DEFAULTS wins). Pick one definition, export it from one module, and
use it in both places.

### M2. Dead config documented as a working API

`createDefaultGuildData` ships `welcome.{enabled,channelId,message}` (with a
`{user}` template), `mode`, and `createDefaultBotData` ships
`bot.mode`/`bot.maintenance` — none of these keys are read anywhere in `src/`.
The greeter actually uses the separate `greeter` feature block, and no
maintenance gate exists in `handler.js`. The README nevertheless demonstrates
`welcome.enabled = true`, `guild.welcome.message = "Welcome, {user}."`, and
`bot.maintenance = true` as live examples. Either implement these (message
templating, maintenance mode) or delete the dead fields and fix the README.

### M3. Hot reload never re-syncs slash command definitions with Discord

`/reloadcommands` (`src/commands/admin/reloadcommands.js`) and the SIGUSR2
path (`src/main.js:56`) rebuild the in-memory registry but never `PUT` the new
payload to the Discord API. Any change to a command's name, description,
options, or subcommands silently diverges from what Discord shows users until
the next restart with startup deploy enabled — and `bun run dev` runs with
deploy mode `off`. Consider re-deploying (respecting `startupDeployMode`)
after a successful reload, or at least saying so in the reload confirmation.

### M4. Missing partials drop leave/ban logs and greetings after restarts

`createBotClient` (`src/core/client.js`) enables only `Partials.Channel` and
`Partials.Message`. Without `Partials.GuildMember` and `Partials.User`,
`guildMemberRemove` (leave greeting + `leaves` log) and related events simply
don't fire for members who aren't in the cache — which is every member the
process hasn't seen since its last restart. Similarly, `messageUpdate` old
content is `null` for uncached messages, so `message-update.js:22` silently
skips them; that's an inherent cache limitation, but "edited/deleted messages"
are the flagship logging features, so consider logging a "content unavailable"
entry instead of nothing (message-delete.js already does this — message-update
does not).

### M5. `userUpdate` fans out one REST call per guild per event

`src/events/user-update.js:19` loops over **all** guilds sequentially and, for
each guild with name/avatar logging enabled, calls
`guild.members.fetch(newUser.id)` on cache miss. A single username change by a
user sharing N guilds with the bot can trigger N REST fetches plus N log
sends, serially awaited. At even moderate scale this stalls the event loop's
throughput and invites rate limiting. Prefer `newUser.client.guilds` filtered
via mutual-guild info, batch with `Promise.allSettled`, and skip the fetch
entirely when both toggles are off (partially done) or when member caches are
warm.

### M6. No Discord-side permission gating on privileged commands

No command uses `setDefaultMemberPermissions` or disables DM/user-install
contexts (`grep` confirms zero occurrences). Every member sees `/ban`,
`/kick`, `/purge`, `/autorole`, `/log`, `/set`, and even the owner-only
`/reloadcommands` in the picker, and runtime checks are the only gate. The
runtime checks are correct, but defense-in-depth and UX both call for
`.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)` (or
`BanMembers`/`KickMembers`/`ManageMessages` as appropriate) plus
guild-only contexts on the moderation set.

### M7. Unbounded in-memory growth

- `usersCache` / `guildsCache` (`src/db/adapter.js:49`) never evict — every
  user who ever runs a command stays in memory for the process lifetime.
- The cooldown map (`src/services/cooldown.js`) deletes entries only when the
  same key is queried again after expiry.
- Hot reload's cache-busting `?update=` imports (`src/core/loader/commands.js:51`)
  permanently retain every previous module generation (unavoidable with ESM,
  but worth documenting as a reason to restart periodically).

Add simple LRU/TTL eviction for clean (non-dirty) cache records and a periodic
sweep for cooldowns.

---

## Low

- **L1. Cooldown is consumed even when the command fails** —
  `handler.js:73` consumes before `execute`; a command that errors still costs
  the user the cooldown. Consume on success, or refund on failure.
- **L2. `flushAll` bypasses the per-key save chain** (`adapter.js:397`) — a
  flush can run concurrently with an in-flight chained save for the same key.
  Both write the same snapshot, so damage is unlikely, but route the flush
  through `enqueueSave` for consistency.
- **L3. Shutdown never destroys the Discord client and has no timeout** —
  `main.js:140` closes the DB but leaves the gateway connection to die with
  the process; a hung `pool.end()` blocks exit forever. Call
  `client.destroy()` and wrap shutdown in a timeout.
- **L4. `hasEmoji` misses common emoji** (`purge.js:35`) — the range
  `\u{1F300}-\u{1FAFF}` excludes ❤ (U+2764), ☺, ✨, ™-style dingbats
  (U+2600–27BF), and flags (U+1F1E6–1F1FF). Use `\p{Extended_Pictographic}`.
- **L5. Raw user input interpolated into markdown** — purge's `contains`/
  `prefix` detail wraps user text in backticks (`purge.js:281,303`); input
  containing a backtick breaks the formatting. Ephemeral and admin-only, so
  cosmetic — escape or truncate.
- **L6. `/help` lists the `owner` category to everyone** — harmless
  disclosure, but filtering categories by the caller's permissions would be
  cleaner.
- **L7. Deleted log channel is re-fetched on every event** —
  `resolveLoggingTarget` (`logging.js:147`) issues a REST fetch per log
  attempt once the channel is gone. Consider clearing `channelId` (or caching
  the failure) after repeated misses.
- **L8. Collection proxy `set` accepts arbitrary values** —
  `adapter.js:138` lets `global.db.data.users[id] = "junk"` persist a
  non-object; validate the assigned shape.
- **L9. `/kick` never defers** — two sequential `members.fetch` calls before
  the first reply can breach the 3-second interaction window under latency;
  `/ban` defers, `/kick` should match.
- **L10. No tests, linter, or CI** — the repo has zero automated checks; even
  a smoke test that imports every command/event module and runs
  `registry.allAsJson()` (the same validation `--dry-run` does) wired to a
  GitHub Action would catch most regressions this audit had to find by hand.

---

## Security review (no findings requiring action)

- **Secrets**: full-history scan for Discord token and connection-string
  patterns found nothing; `.env` is gitignored and `.env.example` contains
  placeholders only.
- **Injection**: all DB access goes through Drizzle's parameterized builders;
  record IDs are additionally validated against `/^\d{5,30}$/` before use.
  No shell execution, no `eval`, no dynamic import of user-controlled paths
  (loader imports are confined to `src/commands` / `src/events`).
- **Mass mentions**: guild logs send with `allowedMentions: { parse: [] }`.
  Greeter messages intentionally ping the joining user only.
- **Privilege checks**: owner gate is env-based ID allowlisting; `/kick` and
  `/ban` enforce actor-vs-target role hierarchy, self/owner protection, and
  bot `kickable`/`bannable` checks. See M6 for the recommended
  defense-in-depth addition.
- **Dependencies**: `discord.js ^14.25.1`, `drizzle-orm ^0.45.1`, `pg ^8.19`,
  `dotenv ^17.3.1` — current major lines, no known-vulnerable pins observed.
  Note the Heroku buildpack is a third-party fork (`jakeg/heroku-buildpack-bun`);
  pinning it to a commit SHA in `app.json` would prevent supply-chain surprise.

## Suggested priority order

1. H2 (`app.json`) — one-line fix, unbreaks deploys.
2. M1 (single logging-defaults source) — small, prevents divergent behavior.
3. H1 + README correction — the data-loss footgun.
4. H3 (save-retry backoff) and M6 (`setDefaultMemberPermissions`).
5. M3/M4/M5, then the Low items opportunistically.
