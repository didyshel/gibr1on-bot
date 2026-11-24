const { Events } = require('discord.js');
const { isInfoUserChannel } = require('./userInfoChannel');
const { isLogChannelId } = require('../utils/config');
const { isAllowedGuild } = require('../utils/security');

// \b не працює з кирилицею, тому межі слів задаємо через Unicode-властивості
const L = '(?<![\\p{L}\\p{N}_])';
const R = '(?![\\p{L}\\p{N}_])';
const re = (body) => new RegExp(`${L}(?:${body})${R}`, 'iu');

const EGGS = [
  { test: (t) => re('пінг|пинг').test(t), reply: 'Понг. Я на зв’язку.' },
  { test: (t) => re('бот\\s*(?:живий|живой)').test(t), reply: 'Живіший за всіх живих.' },
  { test: (t) => /\bgibr1on\b/i.test(t), reply: 'gibr1on на місці.' },
  {
    test: (t) =>
      re('добр(?:е|ий)\\s*ранок|доброго\\s*ранку|доброе\\s*утро').test(t),
    reply: 'Добрий ранок! Нехай день буде спокійним.',
  },
  {
    test: (t) =>
      re('спокійної\\s*ночі|на\\s*добраніч|добраніч|спокойной\\s*ночи').test(t),
    reply: 'Спокійної ночі. Я залишаюсь на варті логів.',
  },
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
