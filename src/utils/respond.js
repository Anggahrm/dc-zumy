import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { translate } from "#services/i18n.js";

export function createCard({
  color,
  title,
  body,
  actorName = null,
  actorAvatarUrl = null,
  actorAvatarDescription = null,
  thumbnailUrl = null,
  thumbnailDescription = null,
  footer = null,
}) {
  const heading = title?.trim() ? `## ${title}\n` : "";
  const card = new ContainerBuilder()
    .setAccentColor(typeof color === "number" ? color : 0x5865f2);

  if (actorName?.trim()) {
    if (actorAvatarUrl) {
      card.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${actorName.trim()}`))
          .setThumbnailAccessory((thumbnail) =>
            thumbnail
              .setURL(actorAvatarUrl)
              .setDescription(actorAvatarDescription ?? `${actorName.trim()} avatar`),
          ),
      );
    } else {
      card.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${actorName.trim()}`));
    }

    card.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  }

  const content = `${heading}${body}`.trim();
  const shouldShowBodyThumbnail = Boolean(thumbnailUrl) && !actorAvatarUrl;
  if (shouldShowBodyThumbnail) {
    card.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory((thumbnail) =>
          thumbnail
            .setURL(thumbnailUrl)
            .setDescription(thumbnailDescription ?? "log thumbnail"),
        ),
    );
  } else {
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  }

  card.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  if (footer?.trim()) {
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer.trim()}`));
  }

  return card;
}

// Cards frequently echo user- or moderator-supplied text (reasons, tag
// content, filters), so mention parsing is suppressed across the board.
const NO_MENTIONS = { parse: [] };

export async function replyCard(interaction, card, { ephemeral = false } = {}) {
  if (interaction.deferred && !interaction.replied) {
    await interaction.editReply({
      components: [card],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  if (interaction.replied) {
    await interaction.followUp({
      components: [card],
      flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  await interaction.reply({
    components: [card],
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
    allowedMentions: NO_MENTIONS,
  });
}

export async function updateCard(interaction, cards, rows = []) {
  await interaction.update({
    components: [...cards, ...rows],
  });
}

// Ephemeral Danger/Cancel guard for destructive actions. Resolves once the
// invoker clicks (or the timeout passes) with { confirmed }. On confirm the
// prompt is acked via update, so follow-up responses should use replyCard
// (which routes to followUp on replied interactions).
export async function awaitConfirmation(interaction, { title, body, lang = "en", timeoutMs = 30_000 }) {
  const yesId = `confirm:${interaction.id}:yes`;
  const noId = `confirm:${interaction.id}:no`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(yesId).setLabel(translate(lang, "confirm.yes")).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(noId).setLabel(translate(lang, "confirm.no")).setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    components: [
      createCard({ color: 0xf1c40f, title: title ?? translate(lang, "confirm.title"), body }),
      row,
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });

  const message = await interaction.fetchReply();

  try {
    const click = await message.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id && (i.customId === yesId || i.customId === noId),
      time: timeoutMs,
    });

    const confirmed = click.customId === yesId;
    await click.update({
      components: [
        createCard({
          color: confirmed ? 0x57f287 : 0x99aab5,
          title: title ?? translate(lang, "confirm.title"),
          body: confirmed ? body : translate(lang, "confirm.cancelled"),
        }),
      ],
    }).catch(() => {});
    return { confirmed };
  } catch {
    await interaction.editReply({
      components: [
        createCard({ color: 0x99aab5, title: title ?? translate(lang, "confirm.title"), body: translate(lang, "confirm.timeout") }),
      ],
    }).catch(() => {});
    return { confirmed: false };
  }
}

export async function replyError(interaction, message) {
  const card = createCard({
    color: 0xed4245,
    title: "Oops",
    body: message,
  });

  const payload = {
    components: [card],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: NO_MENTIONS,
  };

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
      return;
    }

    await interaction.reply(payload);
  } catch {
    // best effort error response
  }
}
