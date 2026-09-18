const { SlashCommandBuilder } = require('discord.js');
const { addReminder, parseDuration } = require('../features/reminders');
const { infoEmbed, errorReply, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Поставить напоминание')
    .addStringOption((opt) =>
      opt
        .setName('time')
        .setDescription('Через сколько: 30m, 2h, 1d')
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('text').setDescription('О чём напомнить').setRequired(true),
    ),

  async execute(interaction) {
    const timeRaw = interaction.options.getString('time', true);
    const text = interaction.options.getString('text', true);
    const ms = parseDuration(timeRaw);

    if (!ms) {
      return interaction.reply(
        errorReply('формат: `10m` · `2h` · `1d` (от 10с до 30д)'),
      );
    }

    const at = Date.now() + ms;
    addReminder({
      id: `${interaction.id}`,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      text,
      at,
    });

    await interaction.reply({
      embeds: [
        infoEmbed({
          title: 'remind',
          color: BRAND.glow,
          description: text,
          fields: [
            { name: 'когда', value: `<t:${Math.floor(at / 1000)}:R>`, inline: true },
          ],
        }),
      ],
    });
  },
};
