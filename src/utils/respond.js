import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";

export function createCard({ color, title, body }) {
  const heading = title?.trim() ? `## ${title}\n` : "";
  return new ContainerBuilder()
    .setAccentColor(typeof color === "number" ? color : 0x5865f2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${heading}${body}`.trim()))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
}

export async function replyCard(interaction, card, { ephemeral = false } = {}) {
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
