const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Проверка, что бот отвечает'),
  async execute(interaction) {
    const ws = Math.round(interaction.client.ws.ping || 0);
    const started = Date.now();

    await interaction.reply({
      embeds: [
        infoEmbed({
          title: 'ping',
          color: BRAND.glow,
          fields: [
            { name: 'ws', value: `\`${ws}ms\``, inline: true },
            { name: 'ответ', value: '`…`', inline: true },
          ],
        }),
      ],
    });

    const roundtrip = Date.now() - started;

    await interaction.editReply({
      embeds: [
        infoEmbed({
          title: 'ping',
          color: BRAND.glow,
          fields: [
            { name: 'ws', value: `\`${ws}ms\``, inline: true },
            { name: 'ответ', value: `\`${roundtrip}ms\``, inline: true },
          ],
        }),
      ],
    });
  },
};
