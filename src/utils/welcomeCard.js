const path = require('path');
const fs = require('fs');

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

function artPath() {
  return path.join(__dirname, '..', '..', 'assets', 'blood-welcome.png');
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

  const width = 1100;
  const height = 420;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // фон из арта Blood
  try {
    const file = artPath();
    if (fs.existsSync(file)) {
      const bg = await loadImage(file);
      const scale = Math.max(width / bg.width, height / bg.height);
      const bw = bg.width * scale;
      const bh = bg.height * scale;
      ctx.drawImage(bg, (width - bw) / 2, (height - bh) / 2, bw, bh);
    } else {
      ctx.fillStyle = '#0a0202';
      ctx.fillRect(0, 0, width, height);
    }
  } catch {
    ctx.fillStyle = '#0a0202';
    ctx.fillRect(0, 0, width, height);
  }

  // тёмный градиент слева под текст
  const veil = ctx.createLinearGradient(0, 0, width * 0.72, 0);
  veil.addColorStop(0, 'rgba(5,0,0,0.88)');
  veil.addColorStop(0.55, 'rgba(5,0,0,0.62)');
  veil.addColorStop(1, 'rgba(5,0,0,0.08)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, height);

  // кровавая полоса
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(0, 0, width, 4);
  ctx.fillRect(0, height - 4, width, 4);

  const name = String(displayName || username || 'user').slice(0, 26);

  ctx.fillStyle = '#fecaca';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('BLOOD', 56, 78);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('добро пожаловать', 56, 145);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText(name, 56, 205);

  ctx.fillStyle = 'rgba(254,202,202,0.75)';
  ctx.font = '22px sans-serif';
  ctx.fillText(`@${String(username || '').slice(0, 32)}`, 56, 248);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '20px sans-serif';
  ctx.fillText(
    `${guildName || 'Blood'} · участник #${memberCount || 0}`,
    56,
    300,
  );

  ctx.fillStyle = 'rgba(185,28,28,0.95)';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('семья уже ждёт тебя', 56, 355);

  if (avatarURL) {
    try {
      const img = await loadImage(avatarURL);
      const size = 148;
      const x = width - size - 64;
      const y = (height - size) / 2;

      // мягкое свечение
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2 + 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(185,28,28,0.35)';
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, x, y, size, size);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${(BRAND.color >> 16) & 255},${(BRAND.color >> 8) & 255},${BRAND.color & 255},0.95)`;
      ctx.lineWidth = 4;
      ctx.stroke();
    } catch {
      /* avatar optional */
    }
  }

  return canvas.toBuffer('image/png');
}

module.exports = { renderWelcomeCard };
