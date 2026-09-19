const { Events, PermissionFlagsBits } = require('discord.js');
const {
  automodCapsPercent,
  automodCapsMinLen,
  automodLinksMax,
  automodRaidJoins,
  automodRaidWindowSec,
  isLogChannelId,
} = require('../utils/config');
const {
  isFeatureEnabled,
  shouldIgnoreMember,
} = require('../utils/automodSettings');
const { isInfoUserChannel } = require('./userInfoChannel');
const { sendServerLog, markAction } = require('../utils/logger');
const { BRAND } = require('../utils/style');
const { isAllowedGuild } = require('../utils/security');
const { readJson, writeJson } = require('../utils/store');

const WORDS_FILE = 'automod-words.json';
const inviteRegex = /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[a-z0-9-]+/i;
const linkRegex = /https?:\/\/|www\./i;
const spamMap = new Map();
const joinMap = new Map();

function getWords(guildId) {
  const data = readJson(WORDS_FILE, {});
  return Array.isArray(data[guildId]) ? data[guildId] : [];
}

function setWords(guildId, words) {
  const data = readJson(WORDS_FILE, {});
  data[guildId] = [...new Set(words.map((w) => String(w).toLowerCase().trim()).filter(Boolean))];
  writeJson(WORDS_FILE, data);
  return data[guildId];
}

function addWord(guildId, word) {
  const list = getWords(guildId);
  const w = String(word).toLowerCase().trim();
  if (!w || list.includes(w)) return list;
  list.push(w);
  return setWords(guildId, list);
}

function removeWord(guildId, word) {
  const w = String(word).toLowerCase().trim();
  return setWords(
    guildId,
    getWords(guildId).filter((x) => x !== w),
  );
}

function findBadWord(content, words) {
  const lower = String(content || '').toLowerCase();
  return words.find((w) => w && lower.includes(w)) || null;
}

function capsRatio(content) {
  const letters = String(content || '').replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
  if (letters.length < automodCapsMinLen()) return 0;
  const upper = letters.replace(/[^A-ZА-ЯЁ]/g, '').length;
  return (upper / letters.length) * 100;
}

function countLinks(content) {
  const matches = String(content || '').match(/https?:\/\/|www\./gi);
  return matches ? matches.length : 0;
}

async function punishDelete(message, title, extraFields = []) {
  markAction(`delmsg:${message.id}`);
  await message.delete().catch(() => null);
  const warn = await message.channel
    .send(`${message.author}, сообщение удалено · автомод`)
    .catch(() => null);
  if (warn) setTimeout(() => warn.delete().catch(() => null), 5000);

  await sendServerLog(message.guild, {
    category: 'message',
    title,
    color: BRAND.warn,
    fields: [
      { name: 'Кто', value: `${message.author} (\`${message.author.tag}\`)` },
      { name: 'Канал', value: `${message.channel}` },
      { name: 'Сообщение', value: (message.content || '').slice(0, 500) || '—' },
      ...extraFields,
    ],
  });
}

function registerAutomod(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      if (!isFeatureEnabled(member.guild.id, 'raid')) return;
      if (!isAllowedGuild(member.guild.id)) return;

      const gid = member.guild.id;
      const now = Date.now();
      const windowMs = Math.max(3, automodRaidWindowSec()) * 1000;
      const list = (joinMap.get(gid) || []).filter((t) => now - t < windowMs);
      list.push(now);
      joinMap.set(gid, list);

      if (list.length < automodRaidJoins()) return;

      joinMap.set(gid, []);
      await member.timeout(10 * 60_000, 'Антирейд').catch(() => null);

      await sendServerLog(member.guild, {
        category: 'member',
        title: 'Автомод: антирейд',
        color: BRAND.danger,
        fields: [
          { name: 'участник', value: `${member}` },
          {
            name: 'окно',
            value: `${list.length}+ джойнов / ${automodRaidWindowSec()}с · timeout 10 мин`,
          },
        ],
      });
    } catch (error) {
      console.error('automod raid:', error);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!isAllowedGuild(message.guild.id)) return;
      if (isInfoUserChannel(message.channel)) return;
      if (isLogChannelId(message.channelId)) return;
      if (message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return;
      if (shouldIgnoreMember(message.guild.id, message.member, message.channelId)) return;

      const content = message.content || '';
      const gid = message.guild.id;

      if (isFeatureEnabled(gid, 'invites') && inviteRegex.test(content)) {
        await punishDelete(message, 'Автомод: инвайт');
        return;
      }

      if (isFeatureEnabled(gid, 'words')) {
        const hit = findBadWord(content, getWords(gid));
        if (hit) {
          await punishDelete(message, 'Автомод: стоп-слово', [
            { name: 'слово', value: `\`${hit}\`` },
          ]);
          return;
        }
      }

      if (isFeatureEnabled(gid, 'links') && (linkRegex.test(content) || countLinks(content) > 0)) {
        const n = countLinks(content);
        if (n > automodLinksMax()) {
          await punishDelete(message, 'Автомод: ссылки', [
            { name: 'лимит', value: `${n} > ${automodLinksMax()}` },
          ]);
          return;
        }
      }

      if (isFeatureEnabled(gid, 'caps')) {
        const ratio = capsRatio(content);
        if (ratio >= automodCapsPercent()) {
          await punishDelete(message, 'Автомод: капс', [
            { name: 'капс', value: `${Math.round(ratio)}%` },
          ]);
          return;
        }
      }

      if (!isFeatureEnabled(gid, 'spam')) return;

      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      const list = (spamMap.get(key) || []).filter((t) => now - t < 5000);
      list.push(now);
      spamMap.set(key, list);

      if (list.length >= 6) {
        spamMap.set(key, []);

        const recent = (await message.channel.messages.fetch({ limit: 10 }).catch(() => null))
          ?.filter((m) => m.author.id === message.author.id && now - m.createdTimestamp < 7000);

        if (recent?.size) {
          for (const id of recent.keys()) markAction(`delmsg:${id}`);
          markAction(`bulk:${message.guild.id}:${message.channel.id}`);
          await message.channel.bulkDelete(recent, true).catch(() => null);
        }

        markAction(`timeout:${message.guild.id}:${message.author.id}`);
        await message.member?.timeout(60_000, 'Антиспам').catch(() => null);

        const warn = await message.channel
          .send(`${message.author}, слишком быстро. Timeout 1 мин.`)
          .catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => null), 6000);

        await sendServerLog(message.guild, {
          category: 'message',
          title: 'Автомод: спам',
          color: BRAND.danger,
          fields: [
            { name: 'Кто', value: `${message.author} (\`${message.author.tag}\`)` },
            { name: 'Канал', value: `${message.channel}` },
            { name: 'Действие', value: 'удаление + timeout 1 мин' },
          ],
        });
      }
    } catch (error) {
      console.error('automod:', error);
    }
  });
}

module.exports = { registerAutomod, getWords, addWord, removeWord, setWords };
