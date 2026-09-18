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
      'модерация · логи · роли · утилиты',
      '',
      'выбери раздел ниже',
    ].join('\n'),
  },
  mod: {
    title: 'модерация',
    description: [
      '`/kick` — кик',
      '`/ban` — бан',
      '`/timeout` — мут · `0` снять',
      '`/warn` — предупреждение',
      '`/warns` — список / очистка',
      '`/clear` — удалить сообщения',
    ].join('\n'),
  },
  util: {
    title: 'утилиты',
    description: [
      '`/ping` — задержка',
      '`/roles setup` — панель ролей',
      '`/remind` — напоминание',
      '`/activity` — активность',
      '`/bday` — дни рождения',
      'канал **info user** — карточка по id',
    ].join('\n'),
  },
  server: {
    title: 'сервер',
    description: [
      'временные войсы — hub-канал',
      'автомод — инвайты и антиспам',
      'статистика — автообновление',
      'логи · member / role / server / message',
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
