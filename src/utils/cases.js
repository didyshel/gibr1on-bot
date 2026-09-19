const { readJson, writeJson } = require('./store');

const FILE = 'cases.json';

function ensureGuild(data, guildId) {
  if (!data[guildId]) data[guildId] = { next: 1, items: {} };
  if (!data[guildId].items) data[guildId].items = {};
  if (!data[guildId].next) data[guildId].next = 1;
  return data[guildId];
}

function createCase(guildId, { type, userId, moderatorId, reason, meta = {} }) {
  const data = readJson(FILE, {});
  const guild = ensureGuild(data, guildId);
  const id = guild.next++;
  const entry = {
    id,
    type,
    userId: String(userId),
    moderatorId: String(moderatorId),
    reason: reason || 'не указана',
    meta,
    at: Date.now(),
    voided: false,
  };
  guild.items[String(id)] = entry;
  writeJson(FILE, data);
  return entry;
}

function getCase(guildId, caseId) {
  const data = readJson(FILE, {});
  return data[guildId]?.items?.[String(caseId)] || null;
}

function listCasesByUser(guildId, userId, { limit = 15, includeVoided = true } = {}) {
  const data = readJson(FILE, {});
  const items = Object.values(data[guildId]?.items || {});
  const uid = String(userId);
  return items
    .filter((c) => c.userId === uid)
    .filter((c) => includeVoided || !c.voided)
    .sort((a, b) => b.id - a.id)
    .slice(0, Math.max(1, Math.min(limit, 25)));
}

function voidCase(guildId, caseId, { moderatorId, reason } = {}) {
  const data = readJson(FILE, {});
  const entry = data[guildId]?.items?.[String(caseId)];
  if (!entry) return null;
  if (entry.voided) return entry;

  entry.voided = true;
  entry.voidedBy = String(moderatorId || '');
  entry.voidedAt = Date.now();
  entry.voidReason = reason || 'отменён';
  writeJson(FILE, data);
  return entry;
}

function updateCaseReason(guildId, caseId, reason) {
  const data = readJson(FILE, {});
  const entry = data[guildId]?.items?.[String(caseId)];
  if (!entry) return null;
  entry.reason = reason || 'не указана';
  entry.reasonUpdatedAt = Date.now();
  writeJson(FILE, data);
  return entry;
}

function formatCaseId(id) {
  return `#${id}`;
}

module.exports = {
  createCase,
  getCase,
  listCasesByUser,
  voidCase,
  updateCaseReason,
  formatCaseId,
};
