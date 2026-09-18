const { Events } = require('discord.js');
const { readJson, writeJson } = require('../utils/store');
const { isInfoUserChannel } = require('./userInfoChannel');
const { isLogChannelId } = require('../utils/config');
const { isAllowedGuild } = require('../utils/security');

const FILE = 'activity.json';
let cache = null;
let dirty = false;

function ensure() {
  if (!cache) cache = readJson(FILE, {});
  return cache;
}

function touchActivity(guildId, userId) {
  const data = ensure();
  if (!data[guildId]) data[guildId] = {};
  data[guildId][userId] = Date.now();
  dirty = true;
}

function getActivity(guildId, userId) {
  return ensure()[guildId]?.[userId] || null;
}

function registerActivity(client) {
  client.on(Events.MessageCreate, (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!isAllowedGuild(message.guild.id)) return;
      if (isInfoUserChannel(message.channel)) return;
      if (isLogChannelId(message.channelId)) return;
      touchActivity(message.guild.id, message.author.id);
    } catch (error) {
      console.error('activity:', error);
    }
  });

  client.once(Events.ClientReady, () => {
    setInterval(() => {
      if (!dirty || !cache) return;
      writeJson(FILE, cache);
      dirty = false;
    }, 30_000);
  });
}

module.exports = { registerActivity, getActivity, touchActivity };
