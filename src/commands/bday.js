const { SlashCommandBuilder } = require('discord.js');
const {
  setBirthday,
  getBirthday,
  listBirthdays,
} = require('../features/birthdays');
const { brandEmbed, infoEmbed, errorReply, successEmbed, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bday')
    .setDescription('Дни рождения')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Установить свой ДР')
        .addStringOption((opt) =>
          opt
            .setName('date')
            .setDescription('Формат ДД.ММ — например 18.09')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('me').setDescription('Показать свой ДР'),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Список дней рождения на сервере'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const raw = interaction.options.getString('date', true).trim();
      const match = raw.match(/^(\d{1,2})[./-](\d{1,2})$/);
      if (!match) {
        return interaction.reply(errorReply('формат: `ДД.ММ` · например `18.09`'));
      }
      const day = Number(match[1]);
      const month = Number(match[2]);
      if (day < 1 || day > 31 || month < 1 || month > 12) {
        return interaction.reply(errorReply('некорректная дата'));
      }

      setBirthday(interaction.guildId, interaction.user.id, day, month);
      return interaction.reply({
        embeds: [
          successEmbed({
            title: 'bday',
            description: `сохранено · **${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}**`,
          }),
        ],
      });
    }

    if (sub === 'me') {
      const bday = getBirthday(interaction.guildId, interaction.user.id);
      if (!bday) {
        return interaction.reply(
          errorReply('др не задан · `/bday set date:18.09`', { title: 'bday' }),
        );
      }
      return interaction.reply({
        embeds: [
          infoEmbed({
            title: 'bday',
            description: `**${String(bday.day).padStart(2, '0')}.${String(bday.month).padStart(2, '0')}**`,
          }),
        ],
        ephemeral: true,
      });
    }

    const all = listBirthdays(interaction.guildId);
    const entries = Object.entries(all);
    if (!entries.length) {
      return interaction.reply({
        embeds: [
          infoEmbed({
            title: 'bday',
            description: 'пока пусто',
          }),
        ],
        ephemeral: true,
      });
    }

    const lines = entries
      .sort((a, b) => a[1].month - b[1].month || a[1].day - b[1].day)
      .slice(0, 40)
      .map(
        ([id, b]) =>
          `· <@${id}> — ${String(b.day).padStart(2, '0')}.${String(b.month).padStart(2, '0')}`,
      );

    const embed = brandEmbed({
      title: 'bday',
      description: lines.join('\n'),
      color: BRAND.soft,
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
