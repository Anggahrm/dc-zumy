import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { loadGuildFeature } from "#services/guild-config.js";
import { registerStrings } from "#services/i18n.js";
import { createCard, replyCard } from "#utils/respond.js";

registerStrings("shop", {
  en: {
    title: "Shop",
    list_title: "Role Shop",
    list_row: "- <@&{role}> — **{price}** 💰",
    list_hint: "-# Buy with `/shop buy`.",
    list_empty: "The shop is empty. Admins can stock it with `/shop add`.",
    not_for_sale: "That role is not for sale. See `/shop list`.",
    already_owned: "You already own that role.",
    not_enough_money: "Not enough money. **{role}** costs **{price}** 💰, you have **{balance}**.",
    cannot_assign: "I can't assign that role right now. Tell an admin to check my role position.",
    purchase_failed_assign: "Purchase failed — I couldn't assign the role.",
    purchase_failed_balance: "Purchase failed — your balance changed while buying.",
    bought_line: "🛍️ You bought <@&{role}> for **{price}** 💰",
    balance_line: "- Balance: **{balance}**",
    need_manage_server: "You need **Manage Server** to manage the shop.",
    cannot_sell: "That role can't be sold (managed, @everyone, or above my highest role).",
    shop_full: "Shop is full (max {max} items).",
    now_for_sale: "<@&{role}> is now for sale at **{price}** 💰",
    not_in_shop: "That role is not in the shop.",
    removed_from_shop: "<@&{role}> removed from the shop.",
  },
  id: {
    title: "Toko",
    list_title: "Toko Role",
    list_row: "- <@&{role}> — **{price}** 💰",
    list_hint: "-# Beli dengan `/shop buy`.",
    list_empty: "Tokonya masih kosong. Admin bisa mengisinya dengan `/shop add`.",
    not_for_sale: "Role itu tidak dijual. Cek `/shop list`.",
    already_owned: "Kamu sudah punya role itu.",
    not_enough_money: "Uangmu kurang. **{role}** harganya **{price}** 💰, kamu punya **{balance}**.",
    cannot_assign: "Aku tidak bisa memberikan role itu sekarang. Minta admin cek posisi role-ku.",
    purchase_failed_assign: "Pembelian gagal — aku tidak bisa memberikan role-nya.",
    purchase_failed_balance: "Pembelian gagal — saldomu berubah saat proses beli.",
    bought_line: "🛍️ Kamu membeli <@&{role}> seharga **{price}** 💰",
    balance_line: "- Saldo: **{balance}**",
    need_manage_server: "Kamu butuh **Manage Server** untuk mengelola toko.",
    cannot_sell: "Role itu tidak bisa dijual (managed, @everyone, atau di atas role tertinggiku).",
    shop_full: "Toko sudah penuh (maksimal {max} item).",
    now_for_sale: "<@&{role}> sekarang dijual seharga **{price}** 💰",
    not_in_shop: "Role itu tidak ada di toko.",
    removed_from_shop: "<@&{role}> dihapus dari toko.",
  },
});

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

function successCard(t, body) {
  return createCard({ color: 0x57f287, title: t("shop.title"), body });
}

function errorCard(t, body) {
  return createCard({ color: 0xed4245, title: t("shop.title"), body });
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
    const t = ctx.t;

    if (subcommand === "list") {
      const shop = await getShop(guildId);
      const entries = Object.entries(shop)
        .filter(([roleId]) => guild.roles.cache.has(roleId))
        .sort((a, b) => a[1] - b[1]);

      await replyCard(
        interaction,
        createCard({
          color: 0x5865f2,
          title: t("shop.list_title"),
          body: entries.length > 0
            ? [
              ...entries.map(([roleId, price]) => t("shop.list_row", { role: roleId, price })),
              "",
              t("shop.list_hint"),
            ].join("\n")
            : t("shop.list_empty"),
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
        await replyCard(interaction, errorCard(t, t("shop.not_for_sale")), { ephemeral: true });
        return;
      }

      const member = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (member?.roles.cache.has(role.id)) {
        await replyCard(interaction, errorCard(t, t("shop.already_owned")), { ephemeral: true });
        return;
      }

      const user = global.db.data.users[ctx.user];
      const balance = Number(user.money ?? 0);
      if (balance < price) {
        await replyCard(
          interaction,
          errorCard(t, t("shop.not_enough_money", { role: role.name, price, balance })),
          { ephemeral: true },
        );
        return;
      }

      const me = guild.members.me;
      if (!me || role.managed || role.position >= me.roles.highest.position) {
        await replyCard(interaction, errorCard(t, t("shop.cannot_assign")), {
          ephemeral: true,
        });
        return;
      }

      try {
        await member.roles.add(role, "Role shop purchase");
      } catch {
        await replyCard(interaction, errorCard(t, t("shop.purchase_failed_assign")), { ephemeral: true });
        return;
      }

      // Debit the live balance: it may have changed during the role API call.
      const current = Number(user.money ?? 0);
      if (current < price) {
        await member.roles.remove(role, "Role shop purchase reverted — insufficient funds").catch(() => {});
        await replyCard(interaction, errorCard(t, t("shop.purchase_failed_balance")), {
          ephemeral: true,
        });
        return;
      }
      user.money = current - price;
      await replyCard(
        interaction,
        successCard(t, [
          t("shop.bought_line", { role: role.id, price }),
          t("shop.balance_line", { balance: user.money }),
        ].join("\n")),
      );
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await replyCard(interaction, errorCard(t, t("shop.need_manage_server")), { ephemeral: true });
      return;
    }

    if (subcommand === "add") {
      const price = interaction.options.getInteger("price", true);
      const me = guild.members.me;

      if (role.id === guild.id || role.managed || (me && role.position >= me.roles.highest.position)) {
        await replyCard(interaction, errorCard(t, t("shop.cannot_sell")), {
          ephemeral: true,
        });
        return;
      }

      const config = await loadGuildFeature(guildId, "shop", SHOP_DEFAULTS, normalizeShop);
      if (!config[role.id] && Object.keys(config).length >= MAX_SHOP_ITEMS) {
        await replyCard(interaction, errorCard(t, t("shop.shop_full", { max: MAX_SHOP_ITEMS })), { ephemeral: true });
        return;
      }

      config[role.id] = price;
      await replyCard(interaction, successCard(t, t("shop.now_for_sale", { role: role.id, price })), { ephemeral: true });
      return;
    }

    if (subcommand === "remove") {
      const config = await loadGuildFeature(guildId, "shop", SHOP_DEFAULTS, normalizeShop);
      if (!config[role.id]) {
        await replyCard(interaction, errorCard(t, t("shop.not_in_shop")), { ephemeral: true });
        return;
      }

      delete config[role.id];
      await replyCard(interaction, successCard(t, t("shop.removed_from_shop", { role: role.id })), { ephemeral: true });
    }
  },
};
