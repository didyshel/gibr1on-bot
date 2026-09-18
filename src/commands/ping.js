const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Проверка, что бот отвечает'),
  async execute(interaction) {
    const sent = await interaction.reply({
      embeds: [
        infoEmbed({
          title: 'ping',
          description: '…',
        }),
      ],
      fetchReply: true,
    });

    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const api = Math.round(interaction.client.ws.ping);

    await interaction.editReply({
      embeds: [
        infoEmbed({
          title: 'ping',
          color: BRAND.glow,
          fields: [
            { name: 'ответ', value: `\`${latency}ms\``, inline: true },
            { name: 'ws', value: `\`${api}ms\``, inline: true },
          ],
        }),
      ],
    });
  },
};
