const { Events } = require('discord.js');
const { isInfoUserChannel } = require('./userInfoChannel');
const { isLogChannelId } = require('../utils/config');
const { isAllowedGuild } = require('../utils/security');

const EGGS = [
  { test: (t) => /\bпинг\b/i.test(t), reply: 'Понг. Я на связи.' },
  { test: (t) => /\bбот\s*живой\b/i.test(t), reply: 'Живее всех живых.' },
  { test: (t) => /\bgibr1on\b/i.test(t), reply: 'gibr1on на месте.' },
  { test: (t) => /доброе\s*утро/i.test(t), reply: 'Доброе! Пусть день будет спокойным.' },
  { test: (t) => /спокойной\s*ночи/i.test(t), reply: 'Спокойной ночи. Я остаюсь на страже логов.' },
];

function registerEasterEggs(client) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!isAllowedGuild(message.guild.id)) return;
      if (isInfoUserChannel(message.channel)) return;
      if (isLogChannelId(message.channelId)) return;

      const text = message.content?.trim();
      if (!text || text.length > 120) return;

      const egg = EGGS.find((item) => item.test(text));
      if (!egg) return;

      await message.reply(egg.reply);
    } catch (error) {
      console.error('easterEggs:', error);
    }
  });
}

module.exports = { registerEasterEggs };
