const { SlashCommandBuilder } = require('discord.js');
const { getActivity } = require('../features/activity');
const { brandEmbed, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activity')
    .setDescription('Коли користувач востаннє писав')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Користувач').setRequired(false),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const ts = getActivity(interaction.guildId, user.id);

    const embed = brandEmbed({
      title: 'activity',
      color: BRAND.soft,
      thumbnail: user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: 'учасник', value: `${user}`, inline: true },
        {
          name: 'останнє повідомлення',
          value: ts
            ? `<t:${Math.floor(ts / 1000)}:R>`
            : 'немає даних',
        },
      ],
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
