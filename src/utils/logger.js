const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const {
  memberLogChannelId,
  roleLogChannelId,
  serverLogChannelId,
  messageLogChannelId,
  allLogChannelIds,
} = require('./config');
const { BRAND } = require('./style');

const LOG_CATEGORIES = {
  member: memberLogChannelId,
  role: roleLogChannelId,
  server: serverLogChannelId,
  message: messageLogChannelId,
};

/** @type {Map<string, number>} */
const actionUntil = new Map();
/** @type {Map<string, number>} */
const recentFingerprints = new Map();

function markAction(key, ttlMs = 15_000) {
  actionUntil.set(key, Date.now() + ttlMs);
}

function consumeAction(key) {
  const until = actionUntil.get(key);
  if (until == null) return false;
  actionUntil.delete(key);
  return Date.now() <= until;
}

function hasAction(key) {
  const until = actionUntil.get(key);
  if (until == null) return false;
  if (Date.now() > until) {
    actionUntil.delete(key);
    return false;
  }
  return true;
}

function resolveLogChannelId(category = 'server') {
  const getter = LOG_CATEGORIES[category] || LOG_CATEGORIES.server;
  return getter();
}

async function getLogChannel(guild, category = 'server') {
  const channelId = resolveLogChannelId(category);
  if (!channelId) {
    console.warn(`[logs] нет ID для категории "${category}"`);
    return null;
  }
  const channel = await guild.channels.fetch(channelId).catch((err) => {
    console.warn(`[logs] не удалось получить канал ${channelId} (${category}):`, err.message);
    return null;
  });
  if (!channel?.isTextBased()) {
    console.warn(`[logs] канал ${channelId} (${category}) не текстовый или не найден`);
    return null;
  }
  return channel;
}

function fingerprint(guildId, category, title, footer, fields) {
  const body = (fields || [])
    .map((f) => `${f.name}=${f.value}`)
    .join('|')
    .slice(0, 240);
  return `${guildId}:${category}:${title}:${footer || ''}:${body}`;
}

function isDuplicateLog(guildId, category, title, footer, fields, windowMs = 4000) {
  const key = fingerprint(guildId, category, title, footer, fields);
  const now = Date.now();
  const prev = recentFingerprints.get(key);
  if (prev && now - prev < windowMs) return true;
  recentFingerprints.set(key, now);
  if (recentFingerprints.size > 500) {
    for (const [k, ts] of recentFingerprints) {
      if (now - ts > windowMs) recentFingerprints.delete(k);
    }
  }
  return false;
}

async function sendServerLog(
  guild,
  { title, description, color = BRAND.color, fields = [], footer, category = 'server' } = {},
) {
  if (!guild) return false;

  if (isDuplicateLog(guild.id, category, title, footer, fields)) {
    return false;
  }

  const channel = await getLogChannel(guild, category);
  if (!channel) return false;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: String(footer || BRAND.footer).slice(0, 2048) });

  if (description) embed.setDescription(description);
  if (fields.length) {
    embed.addFields(
      fields
        .filter((f) => f?.name && f?.value)
        .map((f) => ({
          name: String(f.name).slice(0, 256),
          value: String(f.value).slice(0, 1024),
          inline: Boolean(f.inline),
        })),
    );
  }

  try {
    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.error(
      `[logs] не отправилось в #${channel.name} (${category}/${channel.id}):`,
      error.message,
    );
    return false;
  }
}

async function sendModLog(guild, options) {
  return sendServerLog(guild, { category: 'member', ...options });
}

async function findAuditEntry(guild, type, targetId, maxAgeMs = 5000) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    return (
      logs.entries.find((item) => {
        if (Date.now() - item.createdTimestamp > maxAgeMs) return false;
        if (!targetId) return true;
        const id = item.targetId || item.target?.id;
        return id === targetId;
      }) || null
    );
  } catch {
    return null;
  }
}

async function findAuditExecutor(guild, type, targetId, maxAgeMs = 5000) {
  const entry = await findAuditEntry(guild, type, targetId, maxAgeMs);
  return entry?.executor ?? null;
}

function truncate(text, max = 900) {
  if (!text) return '—';
  const clean = String(text);
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

module.exports = {
  AuditLogEvent,
  getLogChannel,
  sendServerLog,
  sendModLog,
  findAuditExecutor,
  findAuditEntry,
  truncate,
  allLogChannelIds,
  markAction,
  consumeAction,
  hasAction,
};
