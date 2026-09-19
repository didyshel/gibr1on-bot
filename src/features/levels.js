const { Events } = require('discord.js');
const { readJson, writeJson } = require('../utils/store');
const { isInfoUserChannel } = require('./userInfoChannel');
const {
  isLogChannelId,
  levelMessageXp,
  levelVoiceXp,
  levelVoiceXpAmount,
  afkChannelId,
} = require('../utils/config');
const { isAllowedGuild } = require('../utils/security');
const { touchActivity } = require('./activity');
const { brandEmbed, BRAND } = require('../utils/style');
const { markAction } = require('../utils/logger');

const FILE = 'levels.json';
const ROLES_FILE = 'level-roles.json';
const MSG_COOLDOWN_MS = 60_000;
const VOICE_TICK_MS = 60_000;
const MSG_XP_MIN = 15;
const MSG_XP_MAX = 25;

let cache = null;
let dirty = false;
/** @type {Map<string, number>} */
const msgCooldown = new Map();
/** @type {Map<string, number>} */
const voiceJoinedAt = new Map();

function ensure() {
  if (!cache) cache = readJson(FILE, {});
  return cache;
}

function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

function totalXpForLevel(level) {
  let total = 0;
  for (let i = 0; i < level; i += 1) total += xpForLevel(i);
  return total;
}

function levelFromXp(xp) {
  let level = 0;
  let remaining = Math.max(0, xp);
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
    if (level > 500) break;
  }
  return { level, intoLevel: remaining, need: xpForLevel(level) };
}

function getUser(guildId, userId, { create = true } = {}) {
  const data = ensure();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) {
    if (!create) return { xp: 0, messages: 0, voiceMinutes: 0 };
    data[guildId][userId] = { xp: 0, messages: 0, voiceMinutes: 0 };
  }
  return data[guildId][userId];
}

function getLevelRoles(guildId) {
  const data = readJson(ROLES_FILE, {});
  return data[guildId] || {};
}

function setLevelRole(guildId, level, roleId) {
  const data = readJson(ROLES_FILE, {});
  if (!data[guildId]) data[guildId] = {};
  data[guildId][String(level)] = roleId;
  writeJson(ROLES_FILE, data);
}

function setLevelRolesBulk(guildId, map) {
  const data = readJson(ROLES_FILE, {});
  data[guildId] = { ...(data[guildId] || {}), ...map };
  writeJson(ROLES_FILE, data);
}

function removeLevelRole(guildId, level) {
  const data = readJson(ROLES_FILE, {});
  if (data[guildId]) {
    delete data[guildId][String(level)];
    writeJson(ROLES_FILE, data);
  }
}

function getRank(guildId, userId) {
  const data = ensure()[guildId] || {};
  const sorted = Object.entries(data).sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0));
  const idx = sorted.findIndex(([id]) => id === userId);
  return idx >= 0 ? idx + 1 : null;
}

function getLeaderboard(guildId, limit = 10) {
  const data = ensure()[guildId] || {};
  return Object.entries(data)
    .map(([userId, row]) => ({
      userId,
      xp: row.xp || 0,
      messages: row.messages || 0,
      voiceMinutes: row.voiceMinutes || 0,
      ...levelFromXp(row.xp || 0),
    }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

/** Высшая роль за достигнутый уровень из привязок */
function highestRoleForLevel(guildId, level) {
  const roles = getLevelRoles(guildId);
  let best = null;
  let bestLvl = -1;
  for (const [lvl, roleId] of Object.entries(roles)) {
    const n = Number(lvl);
    if (n <= level && n > bestLvl) {
      bestLvl = n;
      best = roleId;
    }
  }
  return best ? { roleId: best, level: bestLvl } : null;
}

/**
 * Оставляем только текущий ранг активности (снимаем остальные level-роли).
 */
async function applyLevelRoles(member, level) {
  const roles = getLevelRoles(member.guild.id);
  const allIds = [...new Set(Object.values(roles))];
  if (!allIds.length) return null;

  const best = highestRoleForLevel(member.guild.id, level);
  const wantId = best?.roleId || null;

  markAction(`roles:${member.guild.id}:${member.id}`);

  for (const roleId of allIds) {
    const has = member.roles.cache.has(roleId);
    if (roleId === wantId) {
      if (!has) await member.roles.add(roleId).catch(() => null);
    } else if (has) {
      await member.roles.remove(roleId).catch(() => null);
    }
  }

  return wantId;
}

async function addXp(member, amount, source) {
  if (!member || member.user.bot || amount <= 0) return null;
  const row = getUser(member.guild.id, member.id);
  const before = levelFromXp(row.xp || 0).level;
  row.xp = (row.xp || 0) + amount;
  if (source === 'message') row.messages = (row.messages || 0) + 1;
  if (source === 'voice') row.voiceMinutes = (row.voiceMinutes || 0) + 1;
  dirty = true;

  const after = levelFromXp(row.xp).level;
  if (after > before) {
    const roleId = await applyLevelRoles(member, after);
    return { leveled: true, level: after, xp: row.xp, roleId, from: before };
  }
  return { leveled: false, level: after, xp: row.xp, roleId: null };
}

function voiceKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function isVoiceEligible(voiceState) {
  if (!voiceState?.channelId) return false;
  if (voiceState.deaf || voiceState.selfDeaf) return false;
  if (voiceState.serverMute || voiceState.serverDeaf) return false;

  const afkId = afkChannelId();
  if (afkId && voiceState.channelId === afkId) return false;

  const channel = voiceState.channel;
  if (!channel) return false;

  // XP только если в канале есть ещё кто-то живой (не соло-фарм)
  const others = channel.members.filter((m) => !m.user.bot && m.id !== voiceState.id);
  if (others.size < 1) return false;

  return true;
}

function trackVoiceMember(member) {
  if (!member || member.user.bot) return;
  const key = voiceKey(member.guild.id, member.id);
  if (isVoiceEligible(member.voice)) {
    if (!voiceJoinedAt.has(key)) voiceJoinedAt.set(key, Date.now());
  } else {
    voiceJoinedAt.delete(key);
  }
}

function seedVoiceTracking(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!isAllowedGuild(guild.id)) continue;
    for (const state of guild.voiceStates.cache.values()) {
      const member = state.member;
      if (!member || member.user.bot) continue;
      if (isVoiceEligible(state)) {
        voiceJoinedAt.set(voiceKey(guild.id, member.id), Date.now());
      }
    }
  }
}

function registerLevels(client) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!levelMessageXp()) return;
      if (!message.guild || message.author.bot) return;
      if (!isAllowedGuild(message.guild.id)) return;
      if (isInfoUserChannel(message.channel)) return;
      if (isLogChannelId(message.channelId)) return;

      // Пустые сообщения / только компоненты — не считаем
      const content = (message.content || '').trim();
      const hasMedia =
        message.attachments?.size > 0 ||
        message.stickers?.size > 0 ||
        Boolean(message.reference);
      if (!content && !hasMedia) return;

      touchActivity(message.guild.id, message.author.id);

      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      const last = msgCooldown.get(key) || 0;
      if (now - last < MSG_COOLDOWN_MS) return;
      msgCooldown.set(key, now);

      const member =
        message.member ||
        (await message.guild.members.fetch(message.author.id).catch(() => null));
      if (!member) return;

      const xp = MSG_XP_MIN + Math.floor(Math.random() * (MSG_XP_MAX - MSG_XP_MIN + 1));
      const result = await addXp(member, xp, 'message');
      if (result?.leveled && message.channel?.isTextBased?.()) {
        const rolePart = result.roleId ? ` · <@&${result.roleId}>` : '';
        await message.channel
          .send({
            embeds: [
              brandEmbed({
                title: 'level up',
                color: BRAND.success,
                description: `${message.author} · уровень **${result.level}**${rolePart}`,
              }),
            ],
          })
          .catch(() => null);
      }
    } catch (error) {
      console.error('levels message:', error);
    }
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    try {
      if (!levelVoiceXp()) return;
      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;
      const guild = newState.guild || oldState.guild;
      if (!guild || !isAllowedGuild(guild.id)) return;

      trackVoiceMember(member);

      // Пересчитать соседей в старом и новом канале
      for (const ch of [oldState.channel, newState.channel]) {
        if (!ch) continue;
        for (const m of ch.members.values()) {
          if (m.user.bot) continue;
          trackVoiceMember(m);
        }
      }
    } catch (error) {
      console.error('levels voice state:', error);
    }
  });

  client.once(Events.ClientReady, () => {
    seedVoiceTracking(client);

    setInterval(async () => {
      if (!levelVoiceXp()) return;
      const amount = levelVoiceXpAmount();
      for (const [key, since] of voiceJoinedAt.entries()) {
        if (Date.now() - since < VOICE_TICK_MS) continue;
        voiceJoinedAt.set(key, Date.now());
        const [guildId, userId] = key.split(':');
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          voiceJoinedAt.delete(key);
          continue;
        }
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member || !isVoiceEligible(member.voice)) {
          voiceJoinedAt.delete(key);
          continue;
        }
        const result = await addXp(member, amount, 'voice');
        if (result?.leveled) {
          const rolePart = result.roleId ? ` · <@&${result.roleId}>` : '';
          const ch = member.voice?.channel;
          if (ch?.isTextBased?.()) {
            await ch
              .send({
                embeds: [
                  brandEmbed({
                    title: 'level up',
                    color: BRAND.success,
                    description: `${member} · уровень **${result.level}**${rolePart}`,
                  }),
                ],
              })
              .catch(() => null);
          }
        }
      }
    }, 30_000);

    setInterval(() => {
      if (!dirty || !cache) return;
      writeJson(FILE, cache);
      dirty = false;
    }, 30_000);
  });
}

module.exports = {
  registerLevels,
  getUser,
  levelFromXp,
  xpForLevel,
  totalXpForLevel,
  getRank,
  getLeaderboard,
  getLevelRoles,
  setLevelRole,
  setLevelRolesBulk,
  removeLevelRole,
  highestRoleForLevel,
  applyLevelRoles,
  addXp,
};
