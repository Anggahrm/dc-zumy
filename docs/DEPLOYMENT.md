# Deployment

## 1) Install dependency

```bash
bun install
```

## 2) Configure environment

Copy `.env.example` to `.env`, then fill in:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID`

## 3) Deploy slash commands (guild)

```bash
bun run deploy:guild
```

## 4) Start the bot

```bash
bun run start
```

## Development modes

- Watch mode (auto-restart):

```bash
bun run dev
```

- Hot reload commands via signal (without restarting the process):

```bash
bun run dev:hot
# then from another terminal: kill -SIGUSR2 <pid>
```

- Hot reload commands via owner command:

Use `/reloadcommands` from a user whose ID exists in `BOT_OWNERS`.

## Built-in moderation note

- `/clear` supports an optional `target` argument to delete only recent messages from one user.

## Optional

- Deploy global command:

```bash
bun run deploy:global
```

- Check deploy without sending an API request:

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
heroku config:set DISCORD_GUILD_ID=<guild-id> BOT_OWNERS=<id1,id2> LOG_LEVEL=info BUN_VERSION=1.3.10 -a <app-name>
```

4. Deploy branch to Heroku app. Process type comes from `Procfile` (`worker: bun run start`).

5. Scale worker dyno:

```bash
heroku ps:scale worker=1 -a <app-name>
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
