const { Events, PermissionFlagsBits } = require('discord.js');
const { automodInvites, automodSpam, isLogChannelId } = require('../utils/config');
const { isInfoUserChannel } = require('./userInfoChannel');
const { sendServerLog, markAction } = require('../utils/logger');
const { BRAND } = require('../utils/style');
const { isAllowedGuild } = require('../utils/security');

const inviteRegex = /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[a-z0-9-]+/i;
const spamMap = new Map();

function registerAutomod(client) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!isAllowedGuild(message.guild.id)) return;
      if (isInfoUserChannel(message.channel)) return;
      if (isLogChannelId(message.channelId)) return;
      if (message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return;

      if (automodInvites() && inviteRegex.test(message.content || '')) {
        markAction(`delmsg:${message.id}`);
        await message.delete().catch(() => null);
        const warn = await message.channel
          .send(`${message.author}, инвайты на другие серверы запрещены.`)
          .catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => null), 5000);

        await sendServerLog(message.guild, {
          category: 'message',
          title: 'Автомод: инвайт',
          color: BRAND.warn,
          fields: [
            { name: 'Кто', value: `${message.author} (\`${message.author.tag}\`)` },
            { name: 'Канал', value: `${message.channel}` },
            { name: 'Сообщение', value: (message.content || '').slice(0, 500) },
          ],
        });
        return;
      }

      if (!automodSpam()) return;

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

module.exports = { registerAutomod };
