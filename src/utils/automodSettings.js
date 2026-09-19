const { readJson, writeJson } = require('../utils/store');
const {
  automodInvites,
  automodSpam,
  automodWords,
  automodCaps,
  automodLinks,
  automodRaid,
} = require('../utils/config');

const FILE = 'automod-settings.json';

const FEATURES = ['invites', 'spam', 'words', 'caps', 'links', 'raid'];

const ENV_DEFAULTS = {
  invites: automodInvites,
  spam: automodSpam,
  words: automodWords,
  caps: automodCaps,
  links: automodLinks,
  raid: automodRaid,
};

function load() {
  return readJson(FILE, {});
}

function save(data) {
  writeJson(FILE, data);
}

function guildSettings(guildId) {
  const data = load();
  if (!data[guildId]) {
    data[guildId] = {
      toggles: {},
      ignoreChannels: [],
      ignoreRoles: [],
    };
  }
  const g = data[guildId];
  if (!g.toggles) g.toggles = {};
  if (!Array.isArray(g.ignoreChannels)) g.ignoreChannels = [];
  if (!Array.isArray(g.ignoreRoles)) g.ignoreRoles = [];
  return { data, g };
}

function isFeatureEnabled(guildId, feature) {
  const { g } = guildSettings(guildId);
  if (Object.prototype.hasOwnProperty.call(g.toggles, feature)) {
    return Boolean(g.toggles[feature]);
  }
  const envFn = ENV_DEFAULTS[feature];
  return envFn ? envFn() : true;
}

function setFeature(guildId, feature, enabled) {
  if (!FEATURES.includes(feature)) return null;
  const { data, g } = guildSettings(guildId);
  g.toggles[feature] = Boolean(enabled);
  save(data);
  return g.toggles[feature];
}

function toggleFeature(guildId, feature) {
  const next = !isFeatureEnabled(guildId, feature);
  setFeature(guildId, feature, next);
  return next;
}

function getStatus(guildId) {
  return Object.fromEntries(FEATURES.map((f) => [f, isFeatureEnabled(guildId, f)]));
}

function addIgnoreChannel(guildId, channelId) {
  const { data, g } = guildSettings(guildId);
  const id = String(channelId);
  if (!g.ignoreChannels.includes(id)) g.ignoreChannels.push(id);
  save(data);
  return g.ignoreChannels;
}

function removeIgnoreChannel(guildId, channelId) {
  const { data, g } = guildSettings(guildId);
  g.ignoreChannels = g.ignoreChannels.filter((id) => id !== String(channelId));
  save(data);
  return g.ignoreChannels;
}

function addIgnoreRole(guildId, roleId) {
  const { data, g } = guildSettings(guildId);
  const id = String(roleId);
  if (!g.ignoreRoles.includes(id)) g.ignoreRoles.push(id);
  save(data);
  return g.ignoreRoles;
}

function removeIgnoreRole(guildId, roleId) {
  const { data, g } = guildSettings(guildId);
  g.ignoreRoles = g.ignoreRoles.filter((id) => id !== String(roleId));
  save(data);
  return g.ignoreRoles;
}

function getIgnores(guildId) {
  const { g } = guildSettings(guildId);
  return {
    channels: [...g.ignoreChannels],
    roles: [...g.ignoreRoles],
  };
}

function shouldIgnoreMember(guildId, member, channelId) {
  const { g } = guildSettings(guildId);
  if (channelId && g.ignoreChannels.includes(String(channelId))) return true;
  if (member?.roles?.cache) {
    for (const roleId of g.ignoreRoles) {
      if (member.roles.cache.has(roleId)) return true;
    }
  }
  return false;
}

module.exports = {
  FEATURES,
  isFeatureEnabled,
  setFeature,
  toggleFeature,
  getStatus,
  addIgnoreChannel,
  removeIgnoreChannel,
  addIgnoreRole,
  removeIgnoreRole,
  getIgnores,
  shouldIgnoreMember,
};
