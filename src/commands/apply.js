const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { successEmbed, errorReply } = require('../utils/style');
const {
  panelPayload,
  loadStore,
  saveStore,
  guildSettings,
} = require('../features/applications');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Заявки на вступ')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Надіслати кнопку заявки в канал')
        .addChannelOption((opt) =>
          opt
            .setName('review_channel')
            .setDescription('Куди надходять заявки на розгляд')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName('panel_channel')
            .setDescription('Куди поставити кнопку (за замовчуванням — цей канал)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addRoleOption((opt) =>
          opt
            .setName('role')
            .setDescription('Роль при прийнятті заявки')
            .setRequired(false),
        ),
    ),

  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'setup') return;

    const reviewChannel = interaction.options.getChannel('review_channel', true);
    const panelChannel =
      interaction.options.getChannel('panel_channel') || interaction.channel;
    const role = interaction.options.getRole('role');

    if (!reviewChannel?.isTextBased?.()) {
      return interaction.reply(errorReply('потрібен текстовий канал для розгляду'));
    }
    if (!panelChannel?.isTextBased?.()) {
      return interaction.reply(errorReply('потрібен текстовий канал для кнопки'));
    }

    const store = loadStore();
    const settings = guildSettings(store, interaction.guildId);
    settings.reviewChannelId = reviewChannel.id;
    settings.acceptRoleId = role?.id || null;
    settings.panelChannelId = panelChannel.id;
    saveStore(store);

    await panelChannel.send(panelPayload());

    await interaction.reply({
      embeds: [
        successEmbed({
          title: 'apply',
          description: [
            `кнопка · ${panelChannel}`,
            `розгляд · ${reviewChannel}`,
            role ? `роль при прийнятті · ${role}` : 'роль при прийнятті · не задано',
          ].join('\n'),
        }),
      ],
      ephemeral: true,
    });
  },
};
