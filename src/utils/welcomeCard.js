let canvasApi = null;

function getCanvas() {
  if (canvasApi !== null) return canvasApi;
  try {
    canvasApi = require('@napi-rs/canvas');
  } catch (error) {
    console.warn('[welcomeCard] canvas недоступен:', error.message);
    canvasApi = false;
  }
  return canvasApi;
}

function hexToRgb(hex) {
  const n = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * @returns {Promise<Buffer|null>}
 */
async function renderWelcomeCard({
  displayName,
  username,
  avatarURL,
  guildName,
  memberCount,
}) {
  const api = getCanvas();
  if (!api) return null;

  const { createCanvas, loadImage } = api;
  const { BRAND } = require('./style');

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

  const name = String(displayName || username || 'user').slice(0, 28);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText('welcome', 56, 100);
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText(name, 56, 160);
  ctx.font = '22px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(`@${String(username || '').slice(0, 32)}`, 56, 200);
  ctx.fillText(`${guildName || ''} · ${memberCount || 0} участников`, 56, 250);

  if (avatarURL) {
    try {
      const img = await loadImage(avatarURL);
      const size = 160;
      const x = width - size - 56;
      const y = (height - size) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, x, y, size, size);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${accent.r},${accent.g},${accent.b},0.9)`;
      ctx.lineWidth = 4;
      ctx.stroke();
    } catch {
      /* avatar optional */
    }
  }

  return canvas.toBuffer('image/png');
}

module.exports = { renderWelcomeCard };
