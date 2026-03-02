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

- `info`: `/ping`, `/help`
- `utility`: `/userinfo`, `/set welcome [channel]`, `/set leave [channel]`
- `moderation`: `/clear` (`target` is optional), `/kick` (`target` is required, `reason` is optional), `/ban` (`days` and `reason` are optional), `/autorole` (`add/remove/show/blacklist/unblacklist`)
- `owner`: `/reloadcommands`
- `rpg`: `/daily`, `/profile`

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
