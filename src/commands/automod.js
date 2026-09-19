const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { addWord, removeWord, getWords } = require('../features/automod');
const {
  FEATURES,
  toggleFeature,
  getStatus,
  addIgnoreChannel,
  removeIgnoreChannel,
  addIgnoreRole,
  removeIgnoreRole,
  getIgnores,
} = require('../utils/automodSettings');
const { successEmbed, infoEmbed, errorReply } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Управление автомодом')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Статус фильтров и ignore-списков'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Вкл/выкл фильтр')
        .addStringOption((opt) =>
          opt
            .setName('feature')
            .setDescription('Что переключить')
            .setRequired(true)
            .addChoices(
              { name: 'invites', value: 'invites' },
              { name: 'spam', value: 'spam' },
              { name: 'words', value: 'words' },
              { name: 'caps', value: 'caps' },
              { name: 'links', value: 'links' },
              { name: 'raid', value: 'raid' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('ignore')
        .setDescription('Исключить канал или роль из автомода')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Канал')
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildForum,
              ChannelType.GuildVoice,
            ),
        )
        .addRoleOption((opt) => opt.setName('role').setDescription('Роль')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unignore')
        .setDescription('Убрать исключение канала или роли')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Канал')
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildForum,
              ChannelType.GuildVoice,
            ),
        )
        .addRoleOption((opt) => opt.setName('role').setDescription('Роль')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('word')
        .setDescription('Добавить стоп-слово')
        .addStringOption((opt) =>
          opt.setName('add').setDescription('Слово').setRequired(true).setMaxLength(40),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unword')
        .setDescription('Убрать стоп-слово')
        .addStringOption((opt) =>
          opt.setName('remove').setDescription('Слово').setRequired(true).setMaxLength(40),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('words').setDescription('Список стоп-слов'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId;

    if (sub === 'status') {
      const status = getStatus(gid);
      const ignores = getIgnores(gid);
      const flags = FEATURES.map((f) => `\`${f}\` · ${status[f] ? 'on' : 'off'}`).join('\n');
      const ch =
        ignores.channels.map((id) => `<#${id}>`).join(' ') || '—';
      const roles =
        ignores.roles.map((id) => `<@&${id}>`).join(' ') || '—';

      return interaction.reply({
        embeds: [
          infoEmbed({
            title: 'automod · status',
            fields: [
              { name: 'фильтры', value: flags },
              { name: 'ignore каналы', value: ch },
              { name: 'ignore роли', value: roles },
            ],
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'toggle') {
      const feature = interaction.options.getString('feature', true);
      const enabled = toggleFeature(gid, feature);
      return interaction.reply({
        embeds: [
          successEmbed({
            title: 'automod · toggle',
            description: `\`${feature}\` → **${enabled ? 'on' : 'off'}**`,
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'ignore' || sub === 'unignore') {
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');
      if (!channel && !role) {
        return interaction.reply(errorReply('укажи channel или role'));
      }

      const parts = [];
      if (channel) {
        if (sub === 'ignore') addIgnoreChannel(gid, channel.id);
        else removeIgnoreChannel(gid, channel.id);
        parts.push(`${channel}`);
      }
      if (role) {
        if (sub === 'ignore') addIgnoreRole(gid, role.id);
        else removeIgnoreRole(gid, role.id);
        parts.push(`${role}`);
      }

      return interaction.reply({
        embeds: [
          successEmbed({
            title: `automod · ${sub}`,
            description: parts.join(' · '),
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'words') {
      const list = getWords(gid);
      return interaction.reply({
        embeds: [
          infoEmbed({
            title: 'automod · words',
            description: list.length
              ? list.map((w) => `\`${w}\``).join(', ')
              : 'список пуст · `/automod word`',
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'word') {
      const word = interaction.options.getString('add', true).trim();
      if (word.length < 2) return interaction.reply(errorReply('слишком коротко'));
      const list = addWord(gid, word);
      return interaction.reply({
        embeds: [
          successEmbed({
            title: 'automod',
            description: `добавлено \`${word.toLowerCase()}\` · всего ${list.length}`,
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'unword') {
      const word = interaction.options.getString('remove', true).trim();
      const list = removeWord(gid, word);
      return interaction.reply({
        embeds: [
          successEmbed({
            title: 'automod',
            description: `убрано \`${word.toLowerCase()}\` · всего ${list.length}`,
          }),
        ],
        ephemeral: true,
      });
    }
  },
};
