# Deployment

## 1) Install dependency

```bash
bun install
```

## 2) Configure environment

Copy `.env.example` to `.env`, then fill in:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`

Optional:

- `DISCORD_GUILD_ID` (required only for guild deploy mode)
- `ZUMY_STARTUP_DEPLOY_MODE` (`off | global | guild`, default: `global`)

## 3) Start the bot

```bash
bun run start
```

On startup, the bot deploys slash commands based on `ZUMY_STARTUP_DEPLOY_MODE` (default `global`) before logging in.
If deploy fails (for example API/network/token issues), bot startup continues and error is logged as warning.

## 4) Optional manual deploy

- Global deploy:

```bash
bun run deploy:global
```

- Guild deploy:

```bash
bun run deploy:guild
```

## Development modes

- Watch mode (auto-restart):

```bash
bun run dev
```

`bun run dev` sets `ZUMY_STARTUP_DEPLOY_MODE=off` to avoid repeated deploy calls on every restart.

- Hot reload commands via signal (without restarting the process):

```bash
bun run dev:hot
# then from another terminal: kill -SIGUSR2 <pid>
```

- Hot reload commands via owner command:

Use `/reloadcommands` from a user whose ID exists in `BOT_OWNERS`.

For startup deploy mode testing in development:

- `bun run dev:global` to test startup global deploy on restart
- `bun run dev:guild` to test startup guild deploy on restart (requires `DISCORD_GUILD_ID`)

## Built-in moderation note

- `/clear` supports an optional `target` argument to delete only recent messages from one user.

## Optional checks

- Check deploy payload without sending an API request:

```bash
bun run scripts/deploy-commands.js --guild --dry-run
```

## Heroku deployment (Bun buildpack)

1. Create a Heroku app, then set buildpack:

```bash
heroku buildpacks:add https://github.com/jakeg/heroku-buildpack-bun -a <app-name>
```

2. Set required config vars:

```bash
heroku config:set DISCORD_TOKEN=<token> DISCORD_CLIENT_ID=<client-id> -a <app-name>
```

3. Optional config vars:

```bash
heroku config:set DISCORD_GUILD_ID=<guild-id> BOT_OWNERS=<id1,id2> LOG_LEVEL=info BUN_VERSION=1.3.10 ZUMY_STARTUP_DEPLOY_MODE=global -a <app-name>
```

4. Deploy branch to Heroku app. Process type comes from `Procfile` (`worker: bun run start`).

5. If using `app.json` / Deploy to Heroku flow, worker dyno is auto-provisioned as `standard-2x` (`formation.worker.quantity=1`, `formation.worker.size=standard-2x`).

6. If needed, you can still set scaling and dyno type manually:

```bash
heroku ps:scale worker=1 -a <app-name>
heroku ps:type worker=standard-2x -a <app-name>
```

### Deploy slash commands from Heroku

After app is live and config vars are set, run command deployment as a one-off dyno:

- Global deploy:

```bash
heroku run "bun run deploy:global" -a <app-name>
```

- Guild deploy (faster while iterating, requires `DISCORD_GUILD_ID`):

```bash
heroku run "bun run deploy:guild" -a <app-name>
```

Run these again whenever slash command definitions change.
