const { SlashCommandBuilder } = require('discord.js');
const {
  addReminder,
  listReminders,
  cancelReminder,
  parseDuration,
} = require('../features/reminders');
const { infoEmbed, successEmbed, errorReply, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Напоминания')
    .addSubcommand((sub) =>
      sub
        .setName('add')
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
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Твои активные напоминания'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Отменить напоминание')
        .addStringOption((opt) =>
          opt.setName('id').setDescription('ID из /remind list').setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const timeRaw = interaction.options.getString('time', true);
      const text = interaction.options.getString('text', true);
      const ms = parseDuration(timeRaw);

      if (!ms) {
        return interaction.reply(
          errorReply('формат: `10m` · `2h` · `1d` (от 10с до 30д)'),
        );
      }

      const at = Date.now() + ms;
      const id = `${interaction.id}`;
      addReminder({
        id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        text,
        at,
      });

      return interaction.reply({
        embeds: [
          infoEmbed({
            title: 'remind',
            color: BRAND.glow,
            description: text,
            fields: [
              { name: 'когда', value: `<t:${Math.floor(at / 1000)}:R>`, inline: true },
              { name: 'id', value: `\`${id}\``, inline: true },
            ],
          }),
        ],
      });
    }

    if (sub === 'list') {
      const items = listReminders(interaction.user.id, interaction.guildId);
      if (!items.length) {
        return interaction.reply({
          embeds: [
            infoEmbed({
              title: 'remind · list',
              description: 'нет активных напоминаний · `/remind add`',
            }),
          ],
          ephemeral: true,
        });
      }

      return interaction.reply({
        embeds: [
          infoEmbed({
            title: 'remind · list',
            color: BRAND.glow,
            description: items
              .map(
                (item, i) =>
                  `**${i + 1}.** \`${item.id}\`\n${item.text}\n<t:${Math.floor(item.at / 1000)}:R>`,
              )
              .join('\n\n')
              .slice(0, 4000),
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'cancel') {
      const id = interaction.options.getString('id', true).trim();
      const removed = cancelReminder(interaction.user.id, id);
      if (!removed) {
        return interaction.reply(errorReply('напоминание не найдено (или не твоё)'));
      }

      return interaction.reply({
        embeds: [
          successEmbed({
            title: 'remind · cancel',
            description: removed.text,
            fields: [{ name: 'id', value: `\`${removed.id}\`` }],
          }),
        ],
        ephemeral: true,
      });
    }
  },
};
