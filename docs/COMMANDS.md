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

## Default categories

- `info`
- `utility`
- `owner`
- `moderation`
- `rpg`

## Current built-in commands

- `info`: `/ping`, `/help`, `/serverinfo`, `/avatar`
- `utility`: `/userinfo`, `/set` (`welcome/leave/welcome-message/leave-message/show`), `/log` (`channel/config`), `/rolemenu` (`create/add/remove/post/delete/list`), `/tag` (`show/list/add/remove`), `/say`
- `moderation`: `/purge` (`all/bot/contains/embeds/emoji/files/human/images/link/mentions/reactions/user`), `/kick`, `/ban`, `/tempban`, `/unban`, `/timeout`, `/untimeout`, `/mute`, `/unmute`, `/muterole` (`set/create/show`), `/quarantine` (`role/add/remove`), `/warn` (`add/list/remove/clear`), `/case` (`view/list/reason`), `/slowmode`, `/lock`, `/unlock`, `/automod` (rules, actions, exemptions, escalation), `/autorole` (`add/remove/show/blacklist/unblacklist`)
- `owner`: `/reloadcommands`, `/maintenance`
- `rpg`: `/daily`, `/profile`

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
