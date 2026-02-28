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
