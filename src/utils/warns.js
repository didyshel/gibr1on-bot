const fs = require('node:fs');
const path = require('node:path');

const filePath = path.join(__dirname, '..', 'data', 'warns.json');

function ensureFile() {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '{}', 'utf8');
}

function readAll() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(data) {
  ensureFile();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getWarns(guildId, userId) {
  const data = readAll();
  return data[guildId]?.[userId] || [];
}

function addWarn(guildId, userId, warn) {
  const data = readAll();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = [];
  data[guildId][userId].push(warn);
  writeAll(data);
  return data[guildId][userId];
}

function clearWarns(guildId, userId) {
  const data = readAll();
  if (data[guildId]) {
    delete data[guildId][userId];
    writeAll(data);
  }
}

module.exports = { getWarns, addWarn, clearWarns };
