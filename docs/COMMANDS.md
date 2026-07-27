# Commands Guide

## Add a new command

1. Create a file at `src/commands/<category>/<name>.js`.
2. Export a command object that follows the contract.
3. Ensure slash command names and component `customId` values are unique.
4. If a command may be slow, use `deferReply()` then `editReply()`.
5. Deploy commands:

```bash
bun run deploy:guild
```

## Categories

Categories are defined in `src/config/categories.js` (browse order, emoji, accent color) and double as the folder names under `src/commands/`:

- `info` — help plus user/server lookups
- `levels` — XP, ranks, leaderboards
- `economy` — currency, gambling, shop
- `utility` — everyday member tools (polls, reminders, AFK, tags)
- `community` — giveaways, starboard, suggestions, tickets, birthdays
- `roles` — role menus, autoroles, timed/persistent roles
- `moderation` — manual mod actions and cases
- `automod` — automatic filtering and raid protection
- `server` — setup, greeter, logging, announcements
- `owner` — owner-only bot administration

A command's `category` field must match its folder name and appear in `CATEGORY_KEYS` — the smoke tests enforce both. To add a new category, register it in `src/config/categories.js` and add `cat_<key>`/`blurb_<key>` strings (en + id) to the help namespace in `src/commands/info/help.js`.

The full per-command reference lives in the README ("Built-in commands").

Moderation commands declare `setDefaultMemberPermissions` on the builder (client-side gating) **and** a matching `permissions.member` array (runtime gating).

Moderation actions create numbered cases in the `moderation_cases` table and, when the `cases` log event is enabled, post a modlog card. Timed actions (`/tempban`, `/mute` with duration) are handled by a persistent scheduler (`scheduled_jobs` table) that survives restarts.

## Minimal command example

```js
import { SlashCommandBuilder } from "discord.js";
import { createCard, replyCard } from "#utils/respond.js";

export default {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("hello")
    .setDescription("Reply with a greeting"),
  async execute({ interaction }) {
    const card = createCard({
      color: 0x5865f2,
      title: "Hello",
      body: "Hello from ZumyNext",
    });

    await replyCard(interaction, card);
  },
};
```

For Components v2 commands, prefer helpers in `src/utils/respond.js` to keep response structure consistent.
