const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sendServerLog, markAction } = require('../utils/logger');
const { infoEmbed, errorEmbed, errorReply, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Удалить сообщения в канале')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Сколько сообщений удалить (1–100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount', true);

    if (!interaction.channel?.isTextBased() || interaction.channel.isDMBased()) {
      return interaction.reply(errorReply('только в текстовом канале'));
    }

    await interaction.deferReply({ ephemeral: true });

    markAction(`bulk:${interaction.guild.id}:${interaction.channel.id}`);

    const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
    if (!deleted) {
      return interaction.editReply({
        embeds: [
          errorEmbed({
            title: 'clear',
            description: 'не удалось удалить (сообщения старше 14 дней bulk delete не трогает)',
          }),
        ],
      });
    }

    await interaction.editReply({
      embeds: [
        infoEmbed({
          title: 'clear',
          color: BRAND.soft,
          fields: [
            { name: 'удалено', value: `\`${deleted.size}\``, inline: true },
            { name: 'канал', value: `${interaction.channel}`, inline: true },
          ],
        }),
      ],
    });

    await sendServerLog(interaction.guild, {
      category: 'message',
      title: 'clear',
      color: BRAND.soft,
      fields: [
        { name: 'модератор', value: `${interaction.user}` },
        { name: 'канал', value: `${interaction.channel}` },
        { name: 'удалено', value: String(deleted.size) },
      ],
    });
  },
};
