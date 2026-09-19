const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getWarns, clearWarns, removeWarn } = require('../utils/warns');
const { voidCase, formatCaseId } = require('../utils/cases');
const { sendModLog } = require('../utils/logger');
const { warnEmbed, successEmbed, infoEmbed, errorReply, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Посмотреть, удалить или очистить предупреждения')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Список варнов участника')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Участник').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Удалить один варн по номеру из списка')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Участник').setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('index')
            .setDescription('Номер из /warns list (1, 2, …)')
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Очистить все варны участника')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Участник').setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user', true);

    if (sub === 'list') {
      const warns = getWarns(interaction.guild.id, user.id);
      if (!warns.length) {
        return interaction.reply({
          embeds: [
            infoEmbed({
              title: 'warns',
              description: `у ${user} нет предупреждений`,
              thumbnail: user.displayAvatarURL({ size: 256 }),
            }),
          ],
          ephemeral: true,
        });
      }

      const embed = warnEmbed({
        title: 'warns',
        thumbnail: user.displayAvatarURL({ size: 256 }),
        description: warns
          .map((w, i) => {
            const casePart = w.caseId != null ? ` · \`${formatCaseId(w.caseId)}\`` : '';
            return `**${i + 1}.** ${w.reason}\n<t:${Math.floor(w.at / 1000)}:R> · <@${w.moderatorId}>${casePart}`;
          })
          .join('\n\n'),
        fields: [
          { name: 'участник', value: `${user}`, inline: true },
          { name: 'всего', value: `\`${warns.length}\``, inline: true },
          {
            name: 'удалить один',
            value: '`/warns remove` · номер из списка',
          },
        ],
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'remove') {
      const index = interaction.options.getInteger('index', true);
      const result = removeWarn(interaction.guild.id, user.id, index);
      if (!result.ok) {
        return interaction.reply(errorReply(result.reason));
      }

      const removed = result.removed;
      const casePart =
        removed.caseId != null ? ` · case \`${formatCaseId(removed.caseId)}\`` : '';

      if (removed.caseId != null) {
        voidCase(interaction.guild.id, removed.caseId, {
          moderatorId: interaction.user.id,
          reason: `warn remove #${index}`,
        });
      }

      await interaction.reply({
        embeds: [
          successEmbed({
            title: 'warns · remove',
            thumbnail: user.displayAvatarURL({ size: 256 }),
            description: `убран варн **#${index}** у ${user}${casePart}`,
            fields: [
              { name: 'причина варна', value: removed.reason || '—' },
              { name: 'осталось', value: `\`${result.remaining}\``, inline: true },
            ],
          }),
        ],
      });

      await sendModLog(interaction.guild, {
        title: 'warns · remove',
        description: `${user} · модератор ${interaction.user}\nубран #${index}: ${removed.reason || '—'}`,
        color: BRAND.success,
        footer: `id · ${user.id}`,
      });
      return;
    }

    clearWarns(interaction.guild.id, user.id);
    await interaction.reply({
      embeds: [
        successEmbed({
          title: 'warns · clear',
          thumbnail: user.displayAvatarURL({ size: 256 }),
          description: `варны ${user} очищены`,
        }),
      ],
    });
    await sendModLog(interaction.guild, {
      title: 'warns · clear',
      description: `${user} · модератор ${interaction.user}`,
      color: BRAND.success,
      footer: `id · ${user.id}`,
    });
  },
};
