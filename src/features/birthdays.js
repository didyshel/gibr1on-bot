const { Events } = require('discord.js');
const { readJson, writeJson } = require('../utils/store');
const { birthdayChannelId } = require('../utils/config');
const { brandEmbed, BRAND } = require('../utils/style');

const FILE = 'birthdays.json';

function load() {
  return readJson(FILE, { users: {}, lastWish: {} });
}

function save(data) {
  writeJson(FILE, data);
}

function setBirthday(guildId, userId, day, month) {
  const data = load();
  if (!data.users[guildId]) data.users[guildId] = {};
  data.users[guildId][userId] = { day, month };
  save(data);
}

function getBirthday(guildId, userId) {
  return load().users[guildId]?.[userId] || null;
}

function listBirthdays(guildId) {
  return load().users[guildId] || {};
}

function registerBirthdays(client) {
  const check = async () => {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const key = `${now.getFullYear()}-${month}-${day}`;
    const data = load();

    for (const [guildId, users] of Object.entries(data.users)) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;

      const channelId = birthdayChannelId();
      if (!channelId) continue;
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased()) continue;

      for (const [userId, bday] of Object.entries(users)) {
        if (bday.day !== day || bday.month !== month) continue;
        const wishKey = `${guildId}:${userId}:${key}`;
        if (data.lastWish[wishKey]) continue;

        const embed = brandEmbed({
          title: 'happy birthday',
          description: `<@${userId}>\n\nс днём рождения`,
          color: BRAND.glow,
        });
        await channel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(() => null);
        data.lastWish[wishKey] = Date.now();
      }
    }
    save(data);
  };

  client.once(Events.ClientReady, () => {
    check();
    setInterval(check, 60 * 60 * 1000);
  });
}

module.exports = {
  registerBirthdays,
  setBirthday,
  getBirthday,
  listBirthdays,
};
