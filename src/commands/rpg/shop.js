import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { loadGuildFeature } from "#services/guild-config.js";
import { createCard, replyCard } from "#utils/respond.js";

const MAX_SHOP_ITEMS = 25;
const SHOP_DEFAULTS = {};

function normalizeShop(config) {
  for (const [roleId, price] of Object.entries(config)) {
    if (!/^\d{5,30}$/.test(roleId) || !Number.isInteger(price) || price < 1) {
      delete config[roleId];
    }
  }
}

async function getShop(guildId, options = {}) {
  const config = await loadGuildFeature(guildId, "shop", SHOP_DEFAULTS, normalizeShop, options);
  return { ...config };
}

function successCard(body) {
  return createCard({ color: 0x57f287, title: "Shop", body });
}

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "Shop", body });
}

export default {
  category: "rpg",
  cooldown: 3,
  permissions: {
    guildOnly: true,
  },
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Spend your money on roles")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub.setName("list").setDescription("Browse the role shop"))
    .addSubcommand((sub) =>
      sub
        .setName("buy")
        .setDescription("Buy a role")
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to buy").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a role to the shop (Manage Server)")
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to sell").setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName("price").setDescription("Price").setMinValue(1).setMaxValue(10_000_000).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a role from the shop (Manage Server)")
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to remove").setRequired(true),
        ),
    ),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for shop command.");
    }

    const guildId = ctx.guild ?? guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "list") {
      const shop = await getShop(guildId);
      const entries = Object.entries(shop)
        .filter(([roleId]) => guild.roles.cache.has(roleId))
        .sort((a, b) => a[1] - b[1]);

      await replyCard(
        interaction,
        createCard({
          color: 0x5865f2,
          title: "Role Shop",
          body: entries.length > 0
            ? [
              ...entries.map(([roleId, price]) => `- <@&${roleId}> — **${price}** 💰`),
              "",
              "-# Buy with `/shop buy`.",
            ].join("\n")
            : "The shop is empty. Admins can stock it with `/shop add`.",
        }),
        { ephemeral: true },
      );
      return;
    }

    const role = interaction.options.getRole("role", true);

    if (subcommand === "buy") {
      const shop = await getShop(guildId);
      const price = shop[role.id];
      if (!Number.isInteger(price)) {
        await replyCard(interaction, errorCard("That role is not for sale. See `/shop list`."), { ephemeral: true });
        return;
      }

      const member = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (member?.roles.cache.has(role.id)) {
        await replyCard(interaction, errorCard("You already own that role."), { ephemeral: true });
        return;
      }

      const user = global.db.data.users[ctx.user];
      const balance = Number(user.money ?? 0);
      if (balance < price) {
        await replyCard(
          interaction,
          errorCard(`Not enough money. **${role.name}** costs **${price}** 💰, you have **${balance}**.`),
          { ephemeral: true },
        );
        return;
      }

      const me = guild.members.me;
      if (!me || role.managed || role.position >= me.roles.highest.position) {
        await replyCard(interaction, errorCard("I can't assign that role right now. Tell an admin to check my role position."), {
          ephemeral: true,
        });
        return;
      }

      try {
        await member.roles.add(role, "Role shop purchase");
      } catch {
        await replyCard(interaction, errorCard("Purchase failed — I couldn't assign the role."), { ephemeral: true });
        return;
      }

      user.money = balance - price;
      await replyCard(
        interaction,
        successCard([
          `🛍️ You bought <@&${role.id}> for **${price}** 💰`,
          `- Balance: **${user.money}**`,
        ].join("\n")),
      );
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await replyCard(interaction, errorCard("You need **Manage Server** to manage the shop."), { ephemeral: true });
      return;
    }

    if (subcommand === "add") {
      const price = interaction.options.getInteger("price", true);
      const me = guild.members.me;

      if (role.id === guild.id || role.managed || (me && role.position >= me.roles.highest.position)) {
        await replyCard(interaction, errorCard("That role can't be sold (managed, @everyone, or above my highest role)."), {
          ephemeral: true,
        });
        return;
      }

      const config = await loadGuildFeature(guildId, "shop", SHOP_DEFAULTS, normalizeShop);
      if (!config[role.id] && Object.keys(config).length >= MAX_SHOP_ITEMS) {
        await replyCard(interaction, errorCard(`Shop is full (max ${MAX_SHOP_ITEMS} items).`), { ephemeral: true });
        return;
      }

      config[role.id] = price;
      await replyCard(interaction, successCard(`<@&${role.id}> is now for sale at **${price}** 💰`), { ephemeral: true });
      return;
    }

    if (subcommand === "remove") {
      const config = await loadGuildFeature(guildId, "shop", SHOP_DEFAULTS, normalizeShop);
      if (!config[role.id]) {
        await replyCard(interaction, errorCard("That role is not in the shop."), { ephemeral: true });
        return;
      }

      delete config[role.id];
      await replyCard(interaction, successCard(`<@&${role.id}> removed from the shop.`), { ephemeral: true });
    }
  },
};
