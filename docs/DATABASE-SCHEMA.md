# Database Schema

## Overview

This project uses PostgreSQL with Drizzle ORM and a JSONB document pattern.

Main tables:

- `users_data` (`id`, `data`, `created_at`, `updated_at`)
- `guilds_data` (`id`, `data`, `created_at`, `updated_at`)
- `bot_data` (`key`, `data`, `updated_at`)

Runtime access pattern:

- `global.db.data.users[userId]`
- `global.db.data.guilds[guildId]`
- `global.db.data.bot`

Helper aliases:

- `global.db.user(userId)`
- `global.db.guild(guildId)`
- `global.db.bot`

## Users Schema

Default shape (`src/db/defaults.js`):

```js
{
  id: "<discord_user_id>",
  money: 0,
  exp: 0,
  level: 1,
  nextDailyAt: 0
}
```

Field notes:

- `money`: RPG currency balance.
- `exp`: RPG experience points.
- `level`: user level.
- `nextDailyAt`: unix ms timestamp for next `/daily` claim.

## Guilds Schema

Default shape (`src/db/defaults.js`):

```js
{
  id: "<discord_guild_id>",
  welcome: {
    enabled: false,
    channelId: null,
    message: "Welcome, {user}."
  },
  mode: "normal"
}
```

Field notes:

- `welcome`: guild welcome message settings.
- `mode`: guild mode toggle for future feature switches.

## Bot Schema

Default shape (`src/db/defaults.js`):

```js
{
  mode: "public",
  maintenance: false
}
```

`bot_data.key` is fixed to `global`.

## Persistence Behavior

- Data is lazily initialized on first access.
- Mutations are auto-saved with debounce.
- Writes use upsert (`onConflictDoUpdate`).
- On shutdown, adapter flushes pending timers and awaits active save/load tasks before closing DB pool.

## Migrations

- Config: `drizzle.config.js`
- Schema: `src/db/schema.js`
- Generate: `bun run db:generate`
- Apply: `bun run db:migrate`
- Studio: `bun run db:studio`
