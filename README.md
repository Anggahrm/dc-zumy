# ZumyNext

ZumyNext is a modular `discord.js` bot runtime built for long-term maintainability. It uses strict command contracts, atomic reload behavior, and a Components v2-first response layer to keep both developer workflow and user experience consistent.

## Highlights

- Modular architecture with clear separation between bootstrap, loaders, registry, services, and commands.
- Atomic command loading: new command state is applied only when every module passes validation.
- Safety guards at load time: duplicate slash command names and duplicate component `customId` values are rejected.
- Unified Components v2 UI helper layer in `src/utils/respond.js`.
- Owner-triggered and signal-triggered command reload without full process restart.

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
- `bun run scripts/deploy-commands.js --guild --dry-run`: Build and validate command payload without API write

## Database usage (global style)

The database API is designed to be consistent and simple for contributors.

```js
// user data
global.db.data.users[interaction.user.id].money += 5000;

// guild data
global.db.data.guilds[interaction.guildId].welcome.enabled = true;

// bot data
global.db.data.bot.mode = "maintenance";
```

Equivalent helper shortcuts:

```js
const user = global.db.user(interaction.user.id);
user.money += 5000;

const guild = global.db.guild(interaction.guildId);
guild.welcome.message = "Welcome, {user}.";

global.db.bot.maintenance = true;
```

Command context preload (recommended):

```js
// inside command execute({ interaction, ctx })
global.db.data.users[ctx.user].money += 5000;

if (ctx.guild) {
  global.db.data.guilds[ctx.guild].mode = "normal";
}

if (ctx.mention) {
  global.db.data.users[ctx.mention].money -= 500;
}
```

Manual preload helpers (for custom ids):

```js
await global.db.loadUser(customUserId);
global.db.data.users[customUserId].money += 5000;

await global.db.loadGuild(customGuildId);
global.db.data.guilds[customGuildId].mode = "normal";
```

Database structure:

- `users_data`: `id` + `data` (JSONB)
- `guilds_data`: `id` + `data` (JSONB)
- `bot_data`: `key` + `data` (JSONB)

Notes:

- Mutasi object otomatis ke-persist ke PostgreSQL (debounced write).
- Default object dibuat otomatis saat pertama kali akses key.
- Inisialisasi dan shutdown DB sudah di-handle di bootstrap runtime.
- Handler now preloads `ctx.user`, `ctx.guild`, and detected `ctx.mention` automatically.

## Built-in commands

- `info`: `/ping`, `/help`
- `utility`: `/userinfo`
- `moderation`: `/clear` (admin + guild only, optional `target` user filter), `/kick` (admin + guild only, required `target`, optional `reason`), `/ban` (admin + guild only, optional `days` and `reason`)
- `owner`: `/reloadcommands` (owner only, requires user ID in `BOT_OWNERS`)
- `rpg`: `/daily` (claim money + exp every 24 hours), `/profile` (show RPG stats)

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
- This bot runs as a worker dyno using `Procfile` (`worker: bun run start`)
- Set required config vars on Heroku: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`
- Optional config vars: `DISCORD_GUILD_ID`, `BOT_OWNERS`, `LOG_LEVEL`, `BUN_VERSION`, `DATABASE_URL`, `ZUMY_STARTUP_DEPLOY_MODE`

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
