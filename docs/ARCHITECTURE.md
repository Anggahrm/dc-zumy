# ZumyNext Architecture

ZumyNext uses a plugin-like modular architecture:

- `src/main.js` handles runtime bootstrap.
- `src/core/loader/commands.js` loads all commands dynamically from `src/commands/*`.
- `src/core/loader/events.js` loads all events from `src/events`.
- `src/handler.js` is the central interaction router and error boundary.
- `src/services/*` contains reusable concerns such as logger, cooldown, and permission checks.

## Internal Import Convention

All internal imports use aliases from `package.json#imports`:

- `#config/*`
- `#core/*`
- `#services/*`
- `#utils/*`
- `#app/*`

This avoids deep relative paths like `../../..` and makes refactoring safer.

## Command Contract

Each command file must export a default object in this shape:

```js
export default {
  category: "info",
  cooldown: 3,
  permissions: {
    guildOnly: false,
    admin: false,
    owner: false,
  },
  data: new SlashCommandBuilder()
    .setName("name")
    .setDescription("description"),
  components: {
    "custom:id": async ({ interaction, registry, logger }) => {},
  },
  async execute({ interaction, registry, logger }) {},
};
```

### Contract validation on load

The command loader validates these rules and fails fast if invalid:

- `data.toJSON` exists
- `execute` is a function
- `category` is a string
- `cooldown` (if provided) must be an integer >= 0
- `permissions` can only contain `owner`, `admin`, `guildOnly` (booleans)
- `components` (if provided) must be an object with function values

The registry also rejects duplicates:

- duplicate slash command names
- duplicate component `customId` values

Command loading is atomic: active registry state is replaced only after all modules are valid.

## Components v2

ZumyNext uses Components v2 as the default UI response format:

- `ContainerBuilder`
- `SectionBuilder`
- `TextDisplayBuilder`
- `ActionRowBuilder`
- `ButtonBuilder`
- `StringSelectMenuBuilder`

### UI composition rules

- Prefer `ContainerBuilder` as the main visual shell for rich command responses.
- Use `TextDisplayBuilder` for markdown content blocks.
- Use `SeparatorBuilder` to create rhythm and improve scanability.
- Use `ActionRowBuilder` for interactive controls (buttons/select menus).
- For interaction updates, only send `components` in `interaction.update(...)` payload.
- For initial message replies with Components v2, include `MessageFlags.IsComponentsV2`.

Messages with display components must use `MessageFlags.IsComponentsV2`.
