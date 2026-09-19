const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate } = require('../utils/moderation');
const { successEmbed, warnEmbed, errorReply, BRAND } = require('../utils/style');
const { createCase, formatCaseId } = require('../utils/cases');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Замутить участника (timeout)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Кого замутить').setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('minutes')
        .setDescription('На сколько минут (1–40320, 0 = снять)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(40320),
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Причина').setRequired(false),
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const reason =
      interaction.options.getString('reason') || 'не указана';

    const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!target) {
      return interaction.reply(errorReply('участник не на сервере'));
    }

    const check = canModerate(interaction.member, target);
    if (!check.ok) {
      return interaction.reply(errorReply(check.reason));
    }

    const caseEntry = createCase(interaction.guild.id, {
      type: minutes === 0 ? 'untimeout' : 'timeout',
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
      meta: { minutes },
    });
    const caseLabel = formatCaseId(caseEntry.id);
    const auditReason = `${caseLabel} · ${reason} · by ${interaction.user.tag}`;

    if (minutes === 0) {
      await target.timeout(null, auditReason);
      await interaction.reply({
        embeds: [
          successEmbed({
            title: 'timeout · снят',
            thumbnail: targetUser.displayAvatarURL({ size: 256 }),
            author: {
              name: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL({ size: 64 }),
            },
            fields: [
              { name: 'участник', value: `${targetUser}`, inline: true },
              { name: 'case', value: `\`${caseLabel}\``, inline: true },
              { name: 'причина', value: reason },
            ],
          }),
        ],
      });
      return;
    }

    await target.timeout(minutes * 60 * 1000, auditReason);
    await interaction.reply({
      embeds: [
        warnEmbed({
          title: 'timeout',
          thumbnail: targetUser.displayAvatarURL({ size: 256 }),
          author: {
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL({ size: 64 }),
          },
          fields: [
            { name: 'участник', value: `${targetUser}`, inline: true },
            { name: 'длительность', value: `\`${minutes} мин\``, inline: true },
            { name: 'case', value: `\`${caseLabel}\``, inline: true },
            { name: 'причина', value: reason },
          ],
        }),
      ],
    });
  },
};
