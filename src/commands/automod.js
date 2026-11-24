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
    .setDescription('Керування автомодом')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Статус фільтрів та ignore-списків'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Вкл/вимк фільтр')
        .addStringOption((opt) =>
          opt
            .setName('feature')
            .setDescription('Що перемкнути')
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
        .setDescription('Виключити канал або роль з автомода')
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
        .setDescription('Прибрати виключення каналу або ролі')
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
        .setDescription('Додати стоп-слово')
        .addStringOption((opt) =>
          opt.setName('add').setDescription('Слово').setRequired(true).setMaxLength(40),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unword')
        .setDescription('Прибрати стоп-слово')
        .addStringOption((opt) =>
          opt.setName('remove').setDescription('Слово').setRequired(true).setMaxLength(40),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('words').setDescription('Список стоп-слів'),
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
              { name: 'фільтри', value: flags },
              { name: 'ignore канали', value: ch },
              { name: 'ignore ролі', value: roles },
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
        return interaction.reply(errorReply('вкажи channel або role'));
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
              : 'список порожній · `/automod word`',
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'word') {
      const word = interaction.options.getString('add', true).trim();
      if (word.length < 2) return interaction.reply(errorReply('занадто коротко'));
      const list = addWord(gid, word);
      return interaction.reply({
        embeds: [
          successEmbed({
            title: 'automod',
            description: `додано \`${word.toLowerCase()}\` · всього ${list.length}`,
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
            description: `прибрано \`${word.toLowerCase()}\` · всього ${list.length}`,
          }),
        ],
        ephemeral: true,
      });
    }
  },
};
