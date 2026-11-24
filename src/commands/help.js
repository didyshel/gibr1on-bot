const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { brandEmbed, BRAND } = require('../utils/style');

const PAGES = {
  home: {
    title: 'Nemiroff App',
    description: [
      'особистий бот сервера',
      '',
      'модерація · логи · ролі · рівні · войс',
      '',
      'обери розділ нижче',
    ].join('\n'),
  },
  mod: {
    title: 'модерація',
    description: [
      'лише gibr1on (OWNER_IDS):',
      '`/kick` · `/ban` · `/softban` · `/unban`',
      '`/timeout` · `/warn` · `/warns` · `/case`',
      '`/clear` · `/automod` · `/levelrole` · `/roles` · `/voice` · `/apply`',
    ].join('\n'),
  },
  util: {
    title: 'утиліти',
    description: [
      '`/ping` · `/server` · `/help`',
      '`/roles setup` — панель ролей',
      '`/apply setup` — панель заявок на вступ',
      '`/remind add|list|cancel` · `/activity` · `/bday`',
      '`/level` · `/leaderboard` · `/levelrole setup`',
      '`/vc` — керування temp voice',
      '`/voice` — moveall / muteall / afk',
      'канал **info user** — картка за id',
    ].join('\n'),
  },
  server: {
    title: 'сервер',
    description: [
      'тимчасові войси — hub + панель власника',
      'заявки — модалка + прийняти/відхилити',
      'автомод — тогли + ignore + стоп-слова',
      'варни — ескалація timeout/kick за порогами',
      'левелінг — повідомлення + войс · ролі активності',
      'welcome card · статистика · логи',
      'бекап `src/data` раз на добу',
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
      .setLabel('головна')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('help:mod')
      .setLabel('модерація')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('help:util')
      .setLabel('утиліти')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('help:server')
      .setLabel('сервер')
      .setStyle(ButtonStyle.Danger),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Довідка щодо команд бота'),
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
