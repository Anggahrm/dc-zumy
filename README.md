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
bun run deploy:guild
bun run start
```

## Environment variables

Required:

- `DISCORD_TOKEN`: Bot token
- `DISCORD_CLIENT_ID`: Discord application/client ID

Optional:

- `DISCORD_GUILD_ID`: Needed for `deploy:guild`
- `BOT_OWNERS`: Comma-separated user IDs allowed to run owner-only commands
- `LOG_LEVEL`: `debug | info | warn | error` (defaults to `info`)

Reference template: `.env.example`

## Scripts

- `bun run start`: Start bot normally
- `bun run dev`: Start bot in watch mode (auto-restart)
- `bun run dev:hot`: Start bot with SIGUSR2 command hot reload enabled
- `bun run deploy:guild`: Deploy slash commands to one guild
- `bun run deploy:global`: Deploy slash commands globally
- `bun run scripts/deploy-commands.js --guild --dry-run`: Build and validate command payload without API write

## Built-in commands

- `info`: `/ping`, `/help`
- `utility`: `/userinfo`
- `moderation`: `/clear` (admin + guild only, optional `target` user filter), `/kick` (admin + guild only, required `target`, optional `reason`)
- `owner`: `/reloadcommands` (owner only, requires user ID in `BOT_OWNERS`)

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
docs/
  ARCHITECTURE.md
  COMMANDS.md
  DEPLOYMENT.md
```

## Architecture and conventions

- Import aliases from `package.json#imports`:
  - `#config/*`, `#core/*`, `#services/*`, `#utils/*`, `#app/*`
- Command modules must follow the contract documented in `docs/ARCHITECTURE.md`.
- Responses should use helper utilities in `src/utils/respond.js` for consistent Components v2 composition.

## Deployment notes

- Prefer guild deploy while iterating (`bun run deploy:guild`) for faster command propagation.
- Use global deploy only when behavior is stable (`bun run deploy:global`).
- Use `--dry-run` to validate command registration payload before sending to Discord.

## Troubleshooting

- `Missing required environment variables`: check `.env` against `.env.example`.
- `TokenInvalid`: verify `DISCORD_TOKEN` value and bot reset state in Discord Developer Portal.
- Command not appearing: re-run deploy script, then wait for Discord propagation (global is slower).
- `/reloadcommands` denied: ensure caller ID is listed in `BOT_OWNERS`.

## Documentation

- `docs/ARCHITECTURE.md`
- `docs/COMMANDS.md`
- `docs/DEPLOYMENT.md`
