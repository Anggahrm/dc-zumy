# Changelog

## 2026-02-28

- Scaffolded new Discord bot project `ZumyNexy` with Bun + ESM setup in `package.json`.
- Implemented modular architecture:
  - Bootstrap in `src/main.js`
  - Dynamic command loader in `src/core/loader/commands.js`
  - Dynamic event loader in `src/core/loader/events.js`
  - Command registry in `src/core/registry/command-registry.js`
  - Central interaction router in `src/handler.js`
- Added core services:
  - Logger `src/services/logger.js`
  - Cooldown `src/services/cooldown.js`
  - Permission guard `src/services/permission.js`
- Added commands using Discord Components v2:
  - `/ping` in `src/commands/info/ping.js`
  - `/help` with interactive category menu in `src/commands/info/help.js`
- Added events:
  - `src/events/ready.js`
  - `src/events/interaction-create.js`
  - `src/events/guild-create.js`
- Added guild/global slash command deployment script:
  - `scripts/deploy-commands.js`
- Added documentation:
  - `docs/ARCHITECTURE.md`
  - `docs/COMMANDS.md`
  - `docs/DEPLOYMENT.md`
  - `README.md`
- Added environment template `.env.example` and `.gitignore`.
- Validation:
  - Ran syntax checks with Node (`node --check`) on main entry, handler, deploy script, and initial commands.
  - Could not run `bun install` because Bun is not available in current environment (`bun: command not found`).

## 2026-02-28 (Update)

- Installed Bun runtime in environment:
  - Installed `unzip` as prerequisite.
  - Installed Bun v`1.3.10` via official installer.
  - Added symlink `/usr/local/bin/bun -> /root/.bun/bin/bun` so `bun` is globally available.
- Added starter commands with Components v2:
  - `src/commands/utility/userinfo.js`
  - `src/commands/moderation/clear.js`
  - `src/commands/admin/reloadcommands.js` (owner-only)
- Improved command system for reloadability:
  - Added `clear()` to command registry (`src/core/registry/command-registry.js`).
  - Added cache-busting support in command loader (`src/core/loader/commands.js`).
  - Added runtime command reload hook in `src/main.js` via `reloadCommands()`.
- Added hot-reload support:
  - Signal-based hot reload (`SIGUSR2`) when `ZUMY_HOT_RELOAD=1`.
  - Added npm scripts: `dev:hot`.
- Improved help menu category options:
  - `buildHelpHomeRows` now derives categories dynamically from loaded commands.
- Updated docs:
  - `docs/COMMANDS.md` with new built-in commands.
  - `docs/DEPLOYMENT.md` with dev/hot-reload workflows.
  - `README.md` with updated command list.
- Verification with Bun:
  - `bun install` succeeded.
  - `bun run scripts/deploy-commands.js --guild --dry-run` succeeded with dummy env values.
  - `bun run src/main.js` startup path succeeded until Discord login, then failed as expected with dummy token (`TokenInvalid`).

## 2026-02-28 (Maintainability Refactor)

- Standardized internal imports using alias map in `package.json#imports`:
  - `#config/*`, `#core/*`, `#services/*`, `#utils/*`, `#app/*`
- Added project root utility `src/utils/paths.js` and removed reliance on `process.cwd()` for loaders/deploy script.
- Implemented stricter command loading contract and atomic apply flow:
  - `src/core/loader/commands.js`
  - `src/core/registry/command-registry.js`
  - Duplicate command names and component custom IDs now fail fast.
- Hardened event loader import/runtime handling:
  - `src/core/loader/events.js` now catches module import failures and event execution errors with structured logs.
- Centralized Components v2 response construction in `src/utils/respond.js`.
  - Updated commands and handler to use shared response helpers for consistency.
- Improved command robustness:
  - `/clear` now defers reply, validates channel capability, and reports actual deleted count.
  - `/reloadcommands` now defers reply before reload.
- Removed unused env config (`DEV_GUILD_ONLY`) and normalized `LOG_LEVEL` parsing in `src/config/env.js`.
- Improved logger resilience with safe metadata serialization and stderr routing for warn/error.
- Documentation updated for new consistency rules and contracts:
  - `docs/ARCHITECTURE.md`
  - `docs/COMMANDS.md`
  - `README.md`
- Verification:
  - `node --check` passed for all core and command files after refactor.
  - `bun run scripts/deploy-commands.js --guild --dry-run` passed with dummy env.
  - `bun run src/main.js` startup path passed until Discord auth, then expected `TokenInvalid` on dummy token.

## 2026-02-28 (Max Components v2 UX/UI)

- Upgraded UI system to richer Components v2 visuals:
  - `src/utils/respond.js` now builds card-like responses with `ContainerBuilder` + `TextDisplayBuilder` + `SeparatorBuilder`.
- Rebuilt `/help` with a full Components v2 command hub experience:
  - Rich home container with category summary and tips.
  - Category drill-down view with command list.
  - Interactive category select and back-home button controls.
  - Implemented in `src/commands/info/help.js`.
- Enhanced visual output of existing commands using the shared v2 design system:
  - `src/commands/info/ping.js`
  - `src/commands/utility/userinfo.js`
  - `src/commands/moderation/clear.js`
  - `src/commands/admin/reloadcommands.js`
- Added and used `CUSTOM_IDS.HELP_HOME_BUTTON` in `src/config/constants.js`.
- Updated architecture docs with v2 UI composition rules in `docs/ARCHITECTURE.md`.
- Verification:
  - `node --check` passed for all modified files.
  - `bun run scripts/deploy-commands.js --guild` succeeded.
  - Bot restarted and reached ready state with no startup errors in `/tmp/zumynexy.log`.

## 2026-02-28 (Docs and Naming Alignment)

- Rechecked and updated docs/readme to align with current codebase behavior:
  - Renamed product references from `ZumyNexy` to `ZumyNext` in docs.
  - Updated command category docs from `admin` to `owner` for `/reloadcommands`.
  - Documented `/clear` optional `target` user filter in README and docs.
  - Normalized README section title to English (`Project structure`).
- Clarified deployment docs with moderation note for targeted message cleanup.

## 2026-02-28 (Gitignore and README Professionalization)

- Updated `.gitignore` to ignore local OpenCode workspace artifacts:
  - Added `.opencode/`
- Rewrote `README.md` to be more comprehensive and production-oriented:
  - Added project highlights, prerequisites, and environment variable reference.
  - Added script catalog and clearer development/deployment workflows.
  - Expanded architecture/convention sections and troubleshooting guidance.
  - Improved command documentation and owner/hot-reload usage instructions.
