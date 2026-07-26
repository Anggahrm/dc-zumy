import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { setMemberXp, updateLevelsConfig } from "#services/levels.js";
import { createCard, replyCard } from "#utils/respond.js";

const MAX_PAGES = 10;
const PAGE_SIZE = 100;
const IMPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function errorCard(body) {
  return createCard({ color: 0xed4245, title: "XP Import", body });
}

async function fetchMee6Page(guildId, page) {
  const response = await fetch(
    `https://mee6.xyz/api/plugins/levels/leaderboard/${guildId}?limit=${PAGE_SIZE}&page=${page}`,
    { signal: AbortSignal.timeout(10_000), headers: { "user-agent": "ZumyNext-Bot/1.0" } },
  );

  if (response.status === 401 || response.status === 403) return { error: "private" };
  if (response.status === 404) return { error: "not_found" };
  if (!response.ok) return { error: "http" };

  const data = await response.json().catch(() => null);
  if (!data || !Array.isArray(data.players)) return { error: "shape" };
  return { players: data.players };
}

export default {
  category: "rpg",
  cooldown: 30,
  permissions: {
    guildOnly: true,
    member: [PermissionFlagsBits.Administrator],
  },
  data: new SlashCommandBuilder()
    .setName("xp-import")
    .setDescription("Import member XP from a public MEE6 leaderboard")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild),
  async execute({ interaction, ctx }) {
    const guild = interaction.guild;
    if (!guild) {
      throw new Error("Guild context is required for xp-import command.");
    }

    const guildId = ctx.guild ?? guild.id;

    const { result: allowed } = await updateLevelsConfig(guildId, (config) => {
      const last = Number(config.lastXpImportAt ?? 0);
      if (Date.now() - last < IMPORT_COOLDOWN_MS) return false;
      config.lastXpImportAt = Date.now();
      return true;
    });

    if (!allowed) {
      await replyCard(interaction, errorCard("XP import can run once per 24 hours. Try again later."), {
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let imported = 0;
    let failed = 0;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      let result;
      try {
        result = await fetchMee6Page(guild.id, page);
      } catch {
        result = { error: "network" };
      }

      if (result.error) {
        if (page === 0) {
          const reasons = {
            private: "That server's MEE6 leaderboard is **not public**. Enable it in the MEE6 dashboard (Levels → public leaderboard) and retry.",
            not_found: "MEE6 has no leaderboard for this server (was MEE6 ever used here?).",
            network: "I couldn't reach MEE6 right now. Try again later.",
            http: "MEE6 returned an unexpected response. Try again later.",
            shape: "MEE6 returned an unexpected payload. Try again later.",
          };
          await replyCard(interaction, errorCard(reasons[result.error] ?? "Import failed."), { ephemeral: true });
          return;
        }
        break;
      }

      if (result.players.length === 0) break;

      for (const player of result.players) {
        const xp = Number(player.xp ?? 0);
        if (!/^\d{5,30}$/.test(String(player.id)) || !Number.isFinite(xp) || xp <= 0) continue;
        try {
          await setMemberXp(guildId, String(player.id), Math.floor(xp));
          imported += 1;
        } catch {
          failed += 1;
        }
      }

      if (result.players.length < PAGE_SIZE) break;
      // Be polite to MEE6's API between pages.
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    await replyCard(
      interaction,
      createCard({
        color: imported > 0 ? 0x57f287 : 0xf1c40f,
        title: "XP Import",
        body: [
          `**Import complete**`,
          `- Imported: **${imported}** member(s)${failed > 0 ? ` (${failed} failed)` : ""}`,
          "- XP transfers 1:1; levels are recomputed with ZumyNext's curve, so exact level numbers can differ from MEE6.",
          "- Check the result with `/leaderboard`.",
        ].join("\n"),
      }),
      { ephemeral: true },
    );
  },
};
