const { readJson, writeJson } = require('./store');

const FILE = 'warns.json';

function getWarns(guildId, userId) {
  const data = readJson(FILE, {});
  return data[guildId]?.[userId] || [];
}

function addWarn(guildId, userId, warn) {
  const data = readJson(FILE, {});
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = [];
  data[guildId][userId].push(warn);
  writeJson(FILE, data);
  return data[guildId][userId];
}

function removeWarn(guildId, userId, index1Based) {
  const data = readJson(FILE, {});
  const list = data[guildId]?.[userId];
  if (!list?.length) return { ok: false, reason: 'нет варнов' };

  const idx = Number(index1Based) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) {
    return { ok: false, reason: `номер от 1 до ${list.length}` };
  }

  const [removed] = list.splice(idx, 1);
  if (!list.length) delete data[guildId][userId];
  writeJson(FILE, data);
  return { ok: true, removed, remaining: list.length };
}

function removeWarnByCaseId(guildId, userId, caseId) {
  const data = readJson(FILE, {});
  const list = data[guildId]?.[userId];
  if (!list?.length) return false;

  const next = list.filter((w) => w.caseId !== caseId);
  if (next.length === list.length) return false;

  if (!next.length) delete data[guildId][userId];
  else data[guildId][userId] = next;
  writeJson(FILE, data);
  return true;
}

function clearWarns(guildId, userId) {
  const data = readJson(FILE, {});
  if (data[guildId]) {
    delete data[guildId][userId];
    writeJson(FILE, data);
  }
}

module.exports = {
  getWarns,
  addWarn,
  removeWarn,
  removeWarnByCaseId,
  clearWarns,
};
