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
- `utility`: `/userinfo`, `/set` (`welcome/leave/welcome-message/leave-message/show`), `/log` (`channel/config`), `/rolemenu`, `/tag` (`show/list/add/remove`)
- `moderation`: `/purge` (`all/bot/contains/embeds/emoji/files/human/images/link/mentions/reactions/user`), `/kick`, `/ban`, `/unban`, `/timeout`, `/untimeout`, `/warn` (`add/list/remove/clear`), `/slowmode`, `/lock`, `/unlock`, `/automod` (`show/invite/mentions/word-add/word-remove`), `/autorole` (`add/remove/show/blacklist/unblacklist`)
- `owner`: `/reloadcommands`, `/maintenance`
- `rpg`: `/daily`, `/profile`

Moderation commands declare `setDefaultMemberPermissions` on the builder (client-side gating) **and** a matching `permissions.member` array (runtime gating).

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
