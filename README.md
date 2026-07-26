# ZumyNext

ZumyNext is a modular `discord.js` bot runtime built for long-term maintainability. It uses strict command contracts, atomic reload behavior, and a Components v2-first response layer to keep both developer workflow and user experience consistent.

## Highlights

- Modular architecture with clear separation between bootstrap, loaders, registry, services, and commands.
- Atomic command loading: new command state is applied only when every module passes validation.
- Safety guards at load time: duplicate slash command names and duplicate component `customId` values are rejected.
- Unified Components v2 UI helper layer in `src/utils/respond.js`.
- Owner-triggered and signal-triggered command reload without full process restart.
- Full moderation suite: kick, ban, unban, timeout, warnings, purge filters, slowmode, channel lock.
- Automod (anti-invite, banned words, mention spam), button role menus, custom tags, configurable welcome/leave messages, and 25 toggleable log events.

## Tech stack

- Runtime: Bun (`>=1.1.0`)
- Language/runtime model: JavaScript ESM
- Discord library: `discord.js` v14
- Database: PostgreSQL + Drizzle ORM
- UI response mode: Components v2 (no embeds)

## Prerequisites

- Bun installed and available on `PATH`
- A Discord application + bot token
- Required application IDs (`DISCORD_CLIENT_ID`, optional `DISCORD_GUILD_ID` for guild deploy)

## Quick start

```bash
bun install
cp .env.example .env
```

Set environment values in `.env`, then:

```bash
bun run start
```

`bun run start` automatically deploys slash commands in global mode on startup.

## Environment variables

Required:

- `DISCORD_TOKEN`: Bot token
- `DISCORD_CLIENT_ID`: Discord application/client ID

Optional:

- `DISCORD_GUILD_ID`: Needed for `deploy:guild`
- `BOT_OWNERS`: Comma-separated user IDs allowed to run owner-only commands
- `LOG_LEVEL`: `debug | info | warn | error` (defaults to `info`)
- `ZUMY_STARTUP_DEPLOY_MODE`: `off | global | guild` (defaults to `global`)

Required for database runtime + migrations:

- `DATABASE_URL`: PostgreSQL connection string

Reference template: `.env.example`

## Scripts

- `bun run start`: Start bot normally
- `bun run dev`: Start bot in watch mode (auto-restart, startup deploy off)
- `bun run dev:global`: Watch mode with startup global deploy enabled
- `bun run dev:guild`: Watch mode with startup guild deploy enabled
- `bun run dev:hot`: Start bot with SIGUSR2 command hot reload enabled
- `bun run deploy:guild`: Manual fallback deploy to one guild
- `bun run deploy:global`: Manual fallback deploy globally
- `bun run db:generate`: Generate SQL migrations from `src/db/schema.js`
- `bun run db:migrate`: Apply generated migrations to PostgreSQL
- `bun run db:studio`: Open Drizzle Studio against the configured database
- `bun test`: Run the smoke test suite (loads every command/event module and unit-tests core helpers)
- `bun run scripts/deploy-commands.js --guild --dry-run`: Build and validate command payload without API write

## Database usage (global style)

The database API is designed to be consistent and simple for contributors.

**Important:** a record must finish its initial load before you read or write
it. Accessing an unloaded record throws a `RecordNotLoadedError` (this guards
against silently overwriting stored data with defaults). Inside command
`execute`, the handler preloads `ctx.user`, `ctx.guild`, and `ctx.mention` for
you; for any other ID, `await global.db.loadUser(id)` / `loadGuild(id)` first.

```js
// user data (interaction.user.id is preloaded by the handler)
global.db.data.users[interaction.user.id].money += 5000;

// guild data (interaction.guildId is preloaded by the handler)
global.db.data.guilds[interaction.guildId].autorole.roles.push(roleId);

// bot data (loaded at startup)
global.db.bot.maintenance = true;
```

Equivalent helper shortcuts:

```js
const user = global.db.user(interaction.user.id);
user.money += 5000;

const guild = global.db.guild(interaction.guildId);
guild.greeter.welcomeMessage = "Welcome, {user}.";

global.db.bot.maintenance = true;
```

Command context preload (recommended):

```js
// inside command execute({ interaction, ctx })
global.db.data.users[ctx.user].money += 5000;

if (ctx.mention) {
  global.db.data.users[ctx.mention].money -= 500;
}
```

Manual preload helpers (for custom ids):

```js
await global.db.loadUser(customUserId);
global.db.data.users[customUserId].money += 5000;

await global.db.loadGuild(customGuildId);
global.db.data.guilds[customGuildId].autorole.roles = [];
```

Database structure:

- `users_data`: `id` + `data` (JSONB)
- `guilds_data`: `id` + `data` (JSONB)
- `bot_data`: `key` + `data` (JSONB)

Notes:

- Mutasi object otomatis ke-persist ke PostgreSQL (debounced write, dengan retry backoff kalau DB lagi down).
- Default object dibuat otomatis saat record pertama kali di-load.
- Record yang belum selesai di-load akan melempar `RecordNotLoadedError` saat diakses — selalu `await loadUser/loadGuild` untuk ID custom.
- Cache record yang idle >30 menit otomatis di-evict dari memori (yang masih dirty tetap disimpan).
- Inisialisasi dan shutdown DB sudah di-handle di bootstrap runtime.
- Handler preloads `ctx.user`, `ctx.guild`, dan `ctx.mention` (dari option `target/user/member/mention/receiver`) secara otomatis.

## Built-in commands

- `info`: `/ping`, `/help`, `/serverinfo`, `/avatar`
- `utility`:
  - `/userinfo` — user details card
  - `/set welcome|leave [channel]` — greeter channels; `/set welcome-message|leave-message [message]` — custom templates with `{user}`, `{username}`, `{server}`, `{count}`; `/set show`; `/set test` — ephemeral preview of both greetings exactly as they would send
  - `/log channel [channel]`, `/log config [event]`, `/log panel` — 26 toggleable log events with autocomplete plus an interactive panel that toggles everything from two select menus
  - `/rolemenu create|add|remove|post|delete|list` — persistent self-assign role menus: up to 25 roles per menu, buttons or select-menu mode, optional `unique` (one role at a time), editable after posting
  - `/tag show|list|add|remove` — custom text snippets with name autocomplete (add/remove need Manage Server)
  - `/say [channel]` — compose an announcement card via a modal form (Manage Server)
  - `/starboard channel|threshold|emoji|selfstar|ignore|show` (Manage Server) — community-curated highlights: reactions past the threshold repost the message to the starboard with a live star count, custom emoji support, self-star rule, and ignored channels
  - `/suggest` + `/suggestion channel|approve|deny|consider` — numbered suggestion cards with 👍/👎 vote buttons and staff review states
  - `/giveaway start|end|reroll|list` (Manage Server) — button-entry giveaways that survive restarts (scheduler-backed), random winner picks and rerolls
  - `/trigger add|remove|channel|list` (Manage Server) — autoresponders with contains/exact/wildcard matching, reply chance, cooldowns, and channel restrictions
  - `/remind set|list|cancel` — personal reminders (1m-90d) that survive restarts, channel delivery with DM fallback
  - `/poll` — native Discord polls (2-5 answers, 1h-1w, optional multiselect)
  - `/afk` — away status with reason; mentions get a notice, your next message clears it
  - `/snipe` (Manage Messages) — peek at the most recently deleted message in a channel (5-minute window)
  - `/sticky set|remove|list` (Manage Messages) — keep a message pinned to the bottom of up to 5 channels (debounced reposting)
  - `/birthday set|remove|next|channel|role|message` — daily 00:00 UTC birthday announcements with an optional birthday role
  - `/automessage add|remove|list` (Manage Server) — recurring scheduled posts (30m-7d intervals, restart-safe)
  - `/ticket panel|category|role|list|close` (Manage Server) — support tickets: private channels with claim/close buttons and text transcripts
  - `/alert add|remove|list` (Manage Server) — YouTube upload notifications via RSS polling every ~10 minutes (no API key needed)
  - `/invites show|leaderboard` — invite tracking with join attribution (who invited whom, joins/leaves/net)
  - `/highlight add|remove|list|clear` — DM notifications when your keywords are mentioned (privacy-guarded, rate-limited)
  - `/statcounter add|remove|list` (Manage Channels) — locked voice channels showing live member/bot/channel/role counts
  - `/tempvoice trigger|off|show` (Manage Channels) — join-to-create temporary voice channels that self-delete when empty
  - `/diagnose` (Manage Server) — health-check every bot permission and configured channel/role, with the exact fix command per issue
  - `/setup` (Manage Server) — 5-step guided onboarding wizard with native channel/role pickers and a recommended automod preset
  - `/language` (Manage Server) — per-server bot language (English / Bahasa Indonesia): every command response, system message, and default greeting is fully localized (~600 strings per language)
  - `/set card` — rendered welcome/leave image cards (avatar, member count) generated with @napi-rs/canvas
- `moderation` (each gated by the matching Discord permission, both in the client UI and at runtime):
  - `/purge` (Manage Messages) — subcommands `all/bot/contains/embeds/emoji/files/human/images/link/mentions/reactions/user`
  - `/kick` (Kick Members), `/ban` (Ban Members), `/tempban` (Ban Members, auto-unban via scheduler), `/unban` (Ban Members, by user ID) — kick/ban DM the target first
  - `/timeout` (Moderate Members, durations like `10m`, `2h`, `1d`, max 28d), `/untimeout`
  - `/mute`, `/unmute` (Moderate Members) — role-based mutes with no 28-day limit and scheduled auto-unmute; configure via `/muterole set|create|show` (Manage Server)
  - `/quarantine role|add|remove` (Moderate Members) — strip roles, isolate with a quarantine role, restore the exact snapshot on release
  - `/warn add|list|remove|clear` (Moderate Members) — persistent warnings with DM notice, warning-id autocomplete, and automatic escalation
  - `/case view|list|reason` (Moderate Members) — every mod action becomes a numbered case; external actions (manual bans, other bots) are attributed from the audit log
  - `/slowmode` (Manage Channels, 0-21600s), `/lock`, `/unlock` (Manage Channels)
  - `/automod` (Manage Server) — anti-invite, banned words (word-boundary + `*` wildcards), link filter with domain allowlist, mention spam, message/duplicate spam detection, exempt channels/roles, per-rule actions (`delete`/`warn`/`timeout`), and a warn-count escalation ladder (timeout → kick → ban)
  - `/softban` (Ban Members) — kick + purge messages via ban/unban; `/massban` (Administrator) — up to 20 IDs for raid cleanup; `/note add|list` (Moderate Members) — staff notes on the case system
  - `/joinguard show|age|surge|action` (Manage Server) — account-age gate and join-surge detection with alert/kick/quarantine/ban responses
  - `/rolepersist toggle|show` (Manage Server) — restore roles on rejoin (stops mute evasion)
  - `/temprole` (Manage Roles) — self-expiring role assignment (1m-90d, scheduler-backed)
  - `/autorole add/remove/show/blacklist/unblacklist` (Manage Roles)
- `owner`: `/reloadcommands` (reload + redeploy), `/maintenance [enabled]` (block non-owner commands); both require user ID in `BOT_OWNERS`
- `rpg` / leveling / economy:
  - `/daily` (money + exp every 24 hours, streak bonuses up to +1400), `/profile` (stats + level progress)
  - `/work` (hourly), `/pay`, `/coinflip`, `/slots`, `/shop list|buy|add|remove` (per-guild role shop)
  - Message + voice XP per guild: `/rank` (rank card with progress bar), `/leaderboard` (paginated), `/levelconfig` (Manage Server: toggle, XP rate/cooldown/multiplier, voice XP, level-up announcements with templates, no-XP channels/roles, role rewards at levels with stack/replace mode, xp-set)

## Hot reload workflows

### 1) Owner command reload

Run `/reloadcommands` from an owner account (defined in `BOT_OWNERS`).

### 2) Signal-based reload

Run:

```bash
bun run dev:hot
```

Then from another terminal:

```bash
kill -SIGUSR2 <pid>
```

## Project structure

```text
src/
  commands/                # Slash command modules by category
  config/                  # Env + constants
  core/
    loader/                # Dynamic loaders (commands/events)
    registry/              # Command and component registry
    client.js              # Discord client factory
  events/                  # Discord event handlers
  services/                # Logger, permission, cooldown
  utils/                   # Shared utilities and Components v2 responders
  handler.js               # Central interaction router
  main.js                  # Runtime bootstrap
scripts/
  deploy-commands.js       # Slash command deployment script
drizzle/
  *.sql                    # Generated SQL migrations
  meta/                    # Drizzle migration metadata
docs/
  ARCHITECTURE.md
  COMMANDS.md
  DEPLOYMENT.md
```

## Architecture and conventions

- Import aliases from `package.json#imports`:
  - `#config/*`, `#core/*`, `#db/*`, `#services/*`, `#utils/*`, `#app/*`
- Command modules must follow the contract documented in `docs/ARCHITECTURE.md`.
- Database adapter lives in `src/db/adapter.js`, schema in `src/db/schema.js`, and Drizzle config in `drizzle.config.js`.
- Responses should use helper utilities in `src/utils/respond.js` for consistent Components v2 composition.

## Deployment notes

- On every bot startup, slash commands are deployed automatically in global mode.
- Manual deploy scripts are optional fallback (`bun run deploy:guild` / `bun run deploy:global`).
- Use `--dry-run` to validate command registration payload before sending to Discord.

### Heroku (Bun buildpack)

- Add buildpack URL in Heroku app settings: `https://github.com/jakeg/heroku-buildpack-bun`
- This bot runs as a worker dyno using `Procfile` (`worker: bun run start`); migrations run in the release phase
- Required config vars: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `DATABASE_URL` (attach a `heroku-postgresql` addon — `app.json` provisions one automatically for button deploys)
- Optional config vars: `DISCORD_GUILD_ID`, `BOT_OWNERS`, `LOG_LEVEL`, `BUN_VERSION`, `ZUMY_STARTUP_DEPLOY_MODE`

## Troubleshooting

- `Missing required environment variables`: check `.env` against `.env.example`.
- `TokenInvalid`: verify `DISCORD_TOKEN` value and bot reset state in Discord Developer Portal.
- Command not appearing: re-run deploy script, then wait for Discord propagation (global is slower).
- `/reloadcommands` denied: ensure caller ID is listed in `BOT_OWNERS`.

## Documentation

- `docs/ARCHITECTURE.md`
- `docs/COMMANDS.md`
- `docs/DEPLOYMENT.md`
- `docs/DATABASE-SCHEMA.md`
