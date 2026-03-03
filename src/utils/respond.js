import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";

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
  if (thumbnailUrl) {
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

export async function replyCard(interaction, card, { ephemeral = false } = {}) {
  if (interaction.deferred && !interaction.replied) {
    await interaction.editReply({
      components: [card],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  if (interaction.replied) {
    await interaction.followUp({
      components: [card],
      flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
    });
    return;
  }

  await interaction.reply({
    components: [card],
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
  });
}

export async function updateCard(interaction, cards, rows = []) {
  await interaction.update({
    components: [...cards, ...rows],
  });
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
