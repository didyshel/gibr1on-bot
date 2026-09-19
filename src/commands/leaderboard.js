const { SlashCommandBuilder } = require('discord.js');
const { getLeaderboard } = require('../features/levels');
const { brandEmbed, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Топ активности сервера'),

  async execute(interaction) {
    const top = getLeaderboard(interaction.guildId, 10);
    if (!top.length) {
      return interaction.reply({
        embeds: [
          brandEmbed({
            title: 'leaderboard',
            description: 'пока пусто · пишите в чат и сидите в войсе вместе',
            color: BRAND.soft,
          }),
        ],
        ephemeral: true,
      });
    }

    const lines = top.map((row, i) => {
      const voice =
        row.voiceMinutes >= 60
          ? `${Math.floor(row.voiceMinutes / 60)}ч`
          : `${row.voiceMinutes}м`;
      return (
        `**${i + 1}.** <@${row.userId}> · lvl \`${row.level}\` · \`${row.xp}\` xp\n` +
        `msgs \`${row.messages}\` · voice \`${voice}\``
      );
    });

    await interaction.reply({
      embeds: [
        brandEmbed({
          title: 'leaderboard · активность',
          description: lines.join('\n'),
          color: BRAND.color,
        }),
      ],
    });
  },
};
