const { readJson, writeJson } = require('./store');

const FILE = 'selfroles.json';

function load() {
  return readJson(FILE, { guilds: {} });
}

function save(data) {
  writeJson(FILE, data);
}

function allowRoles(guildId, roleIds) {
  const data = load();
  if (!data.guilds[guildId]) data.guilds[guildId] = [];
  const set = new Set(data.guilds[guildId]);
  for (const id of roleIds) set.add(String(id));
  data.guilds[guildId] = [...set];
  save(data);
  return data.guilds[guildId];
}

function isAllowedSelfRole(guildId, roleId) {
  const list = load().guilds[guildId] || [];
  return list.includes(String(roleId));
}

module.exports = { allowRoles, isAllowedSelfRole };
