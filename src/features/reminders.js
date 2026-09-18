const { Events } = require('discord.js');
const { readJson, writeJson } = require('../utils/store');
const { brandEmbed, BRAND } = require('../utils/style');

const FILE = 'reminders.json';

function load() {
  return readJson(FILE, { items: [] });
}

function save(data) {
  writeJson(FILE, data);
}

function addReminder(reminder) {
  const data = load();
  data.items.push(reminder);
  save(data);
  return reminder;
}

function registerReminders(client) {
  const tick = async () => {
    const data = load();
    const now = Date.now();
    const due = data.items.filter((item) => item.at <= now);
    if (!due.length) return;

    data.items = data.items.filter((item) => item.at > now);
    save(data);

    for (const item of due) {
      try {
        const channel = await client.channels.fetch(item.channelId).catch(() => null);
        if (!channel?.isTextBased()) continue;
        const embed = brandEmbed({
          title: 'remind',
          description: item.text,
          color: BRAND.glow,
          fields: [{ name: 'кому', value: `<@${item.userId}>` }],
        });
        await channel.send({ content: `<@${item.userId}>`, embeds: [embed] });
      } catch (error) {
        console.error('remind deliver:', error);
      }
    }
  };

  client.once(Events.ClientReady, () => {
    setInterval(tick, 15_000);
  });
}

function parseDuration(input) {
  const match = String(input)
    .trim()
    .toLowerCase()
    .match(/^(\d+)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] || 'm';
  const mult =
    unit.startsWith('s') ? 1000 :
    unit.startsWith('h') ? 3600000 :
    unit.startsWith('d') ? 86400000 :
    60000;
  const ms = amount * mult;
  if (ms < 10000 || ms > 30 * 86400000) return null;
  return ms;
}

module.exports = { registerReminders, addReminder, parseDuration };
