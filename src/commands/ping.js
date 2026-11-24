const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Перевірка, що бот відповідає'),
  async execute(interaction) {
    const ws = Math.round(interaction.client.ws.ping || 0);
    await interaction.reply({
      embeds: [
        infoEmbed({
          title: 'ping',
          color: BRAND.glow,
          description: `ws \`${ws}ms\` · online`,
        }),
      ],
    });
  },
};
