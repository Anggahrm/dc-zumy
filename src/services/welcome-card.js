import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";

const WIDTH = 800;
const HEIGHT = 280;

function pickFontFamily() {
  const families = GlobalFonts.families.map((family) => family.family);
  for (const preferred of ["DejaVu Sans", "Liberation Sans", "Noto Sans", "Arial", "Ubuntu"]) {
    if (families.includes(preferred)) return preferred;
  }
  return families[0] ?? null;
}

function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

// Renders a welcome/leave card PNG. Returns null when no usable font exists
// (headless hosts without fontconfig) so callers can fall back to text-only.
export async function generateGreeterCard({ type, username, avatarUrl, guildName, memberCount }) {
  const family = pickFontFamily();
  if (!family) return null;

  const isWelcome = type === "welcome";
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background: dark base with an accent diagonal.
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#1e1f26");
  bg.addColorStop(1, "#2b2d3a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const accent = ctx.createLinearGradient(0, 0, WIDTH, 0);
  accent.addColorStop(0, isWelcome ? "#57f287" : "#ed4245");
  accent.addColorStop(1, "#5865f2");
  ctx.fillStyle = accent;
  ctx.fillRect(0, HEIGHT - 8, WIDTH, 8);

  // Avatar in a ring.
  const avatarSize = 160;
  const avatarX = 60;
  const avatarY = HEIGHT / 2 - avatarSize / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, HEIGHT / 2, avatarSize / 2 + 6, 0, Math.PI * 2);
  ctx.fillStyle = isWelcome ? "#57f287" : "#ed4245";
  ctx.fill();
  ctx.restore();

  try {
    const avatar = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, HEIGHT / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  } catch {
    // Avatar fetch failed — keep the ring as a placeholder.
  }

  const textX = avatarX + avatarSize + 40;
  const textMax = WIDTH - textX - 40;

  ctx.fillStyle = "#b9bbbe";
  ctx.font = `28px ${family}`;
  ctx.fillText(isWelcome ? "WELCOME" : "GOODBYE", textX, 92);

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 48px ${family}`;
  ctx.fillText(truncateToWidth(ctx, username, textMax), textX, 152);

  ctx.fillStyle = "#b9bbbe";
  ctx.font = `26px ${family}`;
  const subtitle = isWelcome
    ? `You are member #${memberCount} of ${guildName}`
    : `Left ${guildName} — ${memberCount} members remain`;
  ctx.fillText(truncateToWidth(ctx, subtitle, textMax), textX, 198);

  return canvas.toBuffer("image/png");
}
