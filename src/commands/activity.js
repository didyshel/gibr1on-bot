const { SlashCommandBuilder } = require('discord.js');
const { getActivity } = require('../features/activity');
const { brandEmbed, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activity')
    .setDescription('Когда пользователь последний раз писал')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Пользователь').setRequired(false),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const ts = getActivity(interaction.guildId, user.id);

    const embed = brandEmbed({
      title: 'activity',
      color: BRAND.soft,
      thumbnail: user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: 'участник', value: `${user}`, inline: true },
        {
          name: 'последнее сообщение',
          value: ts
            ? `<t:${Math.floor(ts / 1000)}:R>`
            : 'нет данных',
        },
      ],
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
