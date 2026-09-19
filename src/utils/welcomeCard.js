const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { BRAND } = require('./style');

function hexToRgb(hex) {
  const n = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * @returns {Promise<Buffer>}
 */
async function renderWelcomeCard({
  displayName,
  username,
  avatarURL,
  guildName,
  memberCount,
}) {
  const width = 920;
  const height = 320;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = hexToRgb(BRAND.muted);
  const accent = hexToRgb(BRAND.color);
  const soft = hexToRgb(BRAND.soft);

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, `rgb(${bg.r},${bg.g},${bg.b})`);
  grad.addColorStop(0.55, `rgb(${soft.r},${soft.g},${soft.b})`);
  grad.addColorStop(1, `rgb(${accent.r},${accent.g},${accent.b})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(28, 28, width - 56, height - 56);

  ctx.strokeStyle = `rgba(${accent.r},${accent.g},${accent.b},0.55)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, width - 56, height - 56);

  const avatarSize = 160;
  const ax = 64;
  const ay = (height - avatarSize) / 2;

  try {
    const avatar = await loadImage(avatarURL);
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, ax, ay, avatarSize, avatarSize);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
    ctx.strokeStyle = `rgb(${accent.r},${accent.g},${accent.b})`;
    ctx.lineWidth = 4;
    ctx.stroke();
  } catch {
    ctx.fillStyle = `rgb(${accent.r},${accent.g},${accent.b})`;
    ctx.beginPath();
    ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const textX = ax + avatarSize + 40;
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText('welcome', textX, 100);

  ctx.font = 'bold 36px sans-serif';
  const name = String(displayName || username || 'user').slice(0, 28);
  ctx.fillText(name, textX, 155);

  ctx.font = '22px sans-serif';
  ctx.fillStyle = 'rgba(248,250,252,0.78)';
  ctx.fillText(String(guildName || '').slice(0, 40), textX, 200);
  ctx.fillText(`участник · ${memberCount}`, textX, 236);

  ctx.font = '18px sans-serif';
  ctx.fillStyle = 'rgba(248,250,252,0.5)';
  ctx.fillText('gibr1on', textX, 278);

  return canvas.toBuffer('image/png');
}

module.exports = { renderWelcomeCard };
