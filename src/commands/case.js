const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  getCase,
  listCasesByUser,
  voidCase,
  updateCaseReason,
  formatCaseId,
} = require('../utils/cases');
const { removeWarnByCaseId } = require('../utils/warns');
const { sendModLog } = require('../utils/logger');
const { infoEmbed, successEmbed, errorReply, BRAND } = require('../utils/style');

function caseFields(entry) {
  const fields = [
    { name: 'тип', value: `\`${entry.type}\``, inline: true },
    { name: 'когда', value: `<t:${Math.floor(entry.at / 1000)}:R>`, inline: true },
    {
      name: 'статус',
      value: entry.voided ? '`void`' : '`active`',
      inline: true,
    },
    { name: 'участник', value: `<@${entry.userId}> (\`${entry.userId}\`)` },
    { name: 'модератор', value: `<@${entry.moderatorId}>` },
    { name: 'причина', value: entry.reason || '—' },
  ];
  if (entry.voided) {
    fields.push({
      name: 'void',
      value: [
        entry.voidedBy ? `<@${entry.voidedBy}>` : '—',
        entry.voidedAt ? ` · <t:${Math.floor(entry.voidedAt / 1000)}:R>` : '',
        entry.voidReason ? `\n${entry.voidReason}` : '',
      ].join(''),
    });
  }
  return fields;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Кейсы модерации')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName('get')
        .setDescription('Найти кейс по номеру')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('Номер кейса').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('user')
        .setDescription('Список кейсов участника')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Участник').setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('limit')
            .setDescription('Сколько показать (1–25)')
            .setMinValue(1)
            .setMaxValue(25),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('void')
        .setDescription('Отменить кейс (и связанный warn)')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('Номер кейса').setRequired(true).setMinValue(1),
        )
        .addStringOption((opt) =>
          opt.setName('reason').setDescription('Почему отменяешь'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reason')
        .setDescription('Изменить причину кейса')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('Номер кейса').setRequired(true).setMinValue(1),
        )
        .addStringOption((opt) =>
          opt.setName('text').setDescription('Новая причина').setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'get') {
      const id = interaction.options.getInteger('id', true);
      const entry = getCase(interaction.guildId, id);
      if (!entry) {
        return interaction.reply(errorReply(`кейс ${formatCaseId(id)} не найден`));
      }

      return interaction.reply({
        embeds: [
          infoEmbed({
            title: `case ${formatCaseId(entry.id)}`,
            color: entry.voided ? BRAND.muted : BRAND.color,
            fields: caseFields(entry),
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'user') {
      const user = interaction.options.getUser('user', true);
      const limit = interaction.options.getInteger('limit') || 15;
      const list = listCasesByUser(interaction.guildId, user.id, { limit });

      if (!list.length) {
        return interaction.reply({
          embeds: [
            infoEmbed({
              title: 'cases',
              description: `у ${user} нет кейсов`,
              thumbnail: user.displayAvatarURL({ size: 256 }),
            }),
          ],
          ephemeral: true,
        });
      }

      const lines = list.map((c) => {
        const mark = c.voided ? '~~' : '';
        const voidTag = c.voided ? ' · void' : '';
        return (
          `${mark}**${formatCaseId(c.id)}** · \`${c.type}\`${voidTag}${mark}\n` +
          `${mark}${c.reason || '—'}${mark}\n` +
          `<t:${Math.floor(c.at / 1000)}:R> · <@${c.moderatorId}>`
        );
      });

      return interaction.reply({
        embeds: [
          infoEmbed({
            title: 'cases',
            thumbnail: user.displayAvatarURL({ size: 256 }),
            description: lines.join('\n\n').slice(0, 4000),
            fields: [
              { name: 'участник', value: `${user}`, inline: true },
              { name: 'показано', value: `\`${list.length}\``, inline: true },
            ],
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'void') {
      const id = interaction.options.getInteger('id', true);
      const reason = interaction.options.getString('reason') || 'отменён';
      const existing = getCase(interaction.guildId, id);
      if (!existing) {
        return interaction.reply(errorReply(`кейс ${formatCaseId(id)} не найден`));
      }
      if (existing.voided) {
        return interaction.reply(errorReply(`кейс ${formatCaseId(id)} уже void`));
      }

      const entry = voidCase(interaction.guildId, id, {
        moderatorId: interaction.user.id,
        reason,
      });

      if (entry.type === 'warn') {
        removeWarnByCaseId(interaction.guildId, entry.userId, entry.id);
      }

      await interaction.reply({
        embeds: [
          successEmbed({
            title: `case · void · ${formatCaseId(entry.id)}`,
            fields: [
              { name: 'тип', value: `\`${entry.type}\``, inline: true },
              { name: 'участник', value: `<@${entry.userId}>`, inline: true },
              { name: 'причина void', value: reason },
            ],
          }),
        ],
      });

      await sendModLog(interaction.guild, {
        title: `case void · ${formatCaseId(entry.id)}`,
        color: BRAND.muted,
        description: `${interaction.user} · <@${entry.userId}> · \`${entry.type}\`\n${reason}`,
        footer: `id · ${entry.userId}`,
      });
      return;
    }

    if (sub === 'reason') {
      const id = interaction.options.getInteger('id', true);
      const text = interaction.options.getString('text', true);
      const entry = updateCaseReason(interaction.guildId, id, text);
      if (!entry) {
        return interaction.reply(errorReply(`кейс ${formatCaseId(id)} не найден`));
      }

      return interaction.reply({
        embeds: [
          successEmbed({
            title: `case · reason · ${formatCaseId(entry.id)}`,
            fields: [
              { name: 'участник', value: `<@${entry.userId}>`, inline: true },
              { name: 'причина', value: entry.reason },
            ],
          }),
        ],
        ephemeral: true,
      });
    }
  },
};
