const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { brandEmbed, BRAND } = require('../utils/style');

const PAGES = {
  home: {
    title: 'gibr1on',
    description: [
      'личный бот сервера',
      '',
      'модерация · логи · роли · уровни · войс',
      '',
      'выбери раздел ниже',
    ].join('\n'),
  },
  mod: {
    title: 'модерация',
    description: [
      'только gibr1on (OWNER_IDS):',
      '`/kick` · `/ban` · `/softban` · `/unban`',
      '`/timeout` · `/warn` · `/warns` · `/case`',
      '`/clear` · `/automod` · `/levelrole` · `/roles` · `/voice`',
    ].join('\n'),
  },
  util: {
    title: 'утилиты',
    description: [
      '`/ping` · `/server` · `/help`',
      '`/roles setup` — панель ролей',
      '`/remind add|list|cancel` · `/activity` · `/bday`',
      '`/level` · `/leaderboard` · `/levelrole setup`',
      '`/vc` — управление temp voice',
      '`/voice` — moveall / muteall / afk',
      'канал **info user** — карточка по id',
    ].join('\n'),
  },
  server: {
    title: 'сервер',
    description: [
      'временные войсы — hub + панель владельца',
      'автомод — тогглы + ignore + стоп-слова',
      'варны — эскалация timeout/kick по порогам',
      'левелинг — сообщения + войс · роли активности',
      'welcome card · статистика · логи',
      'бэкап `src/data` раз в сутки',
    ].join('\n'),
  },
};

function pageEmbed(key) {
  const page = PAGES[key] || PAGES.home;
  return brandEmbed({
    title: page.title,
    description: page.description,
    color: key === 'home' ? BRAND.color : BRAND.soft,
  });
}

function pageRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('help:home')
      .setLabel('главная')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('help:mod')
      .setLabel('модерация')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('help:util')
      .setLabel('утилиты')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('help:server')
      .setLabel('сервер')
      .setStyle(ButtonStyle.Secondary),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Справка по командам бота'),
  async execute(interaction) {
    await interaction.reply({
      embeds: [pageEmbed('home')],
      components: [pageRow()],
      ephemeral: true,
    });
  },
  pageEmbed,
  pageRow,
};
