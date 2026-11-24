const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate } = require('../utils/moderation');
const { addWarn } = require('../utils/warns');
const { applyWarnEscalation } = require('../utils/warnEscalate');
const { sendModLog } = require('../utils/logger');
const { warnEmbed, errorReply, BRAND } = require('../utils/style');
const { createCase, formatCaseId } = require('../utils/cases');
const {
  warnTimeoutAt,
  warnKickAt,
  warnTimeoutMinutes,
} = require('../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Видати попередження')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Кому видати warn').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Причина').setRequired(true),
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (target) {
      const check = canModerate(interaction.member, target);
      if (!check.ok) {
        return interaction.reply(errorReply(check.reason));
      }
    }

    const caseEntry = createCase(interaction.guild.id, {
      type: 'warn',
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
    });
    const caseLabel = formatCaseId(caseEntry.id);

    const warns = addWarn(interaction.guild.id, targetUser.id, {
      reason,
      moderatorId: interaction.user.id,
      at: Date.now(),
      caseId: caseEntry.id,
    });

    const { actions } = await applyWarnEscalation({
      guild: interaction.guild,
      targetUser,
      targetMember: target,
      moderator: interaction.member,
      warnCount: warns.length,
    });

    const fields = [
      { name: 'учасник', value: `${targetUser}`, inline: true },
      { name: 'case', value: `\`${caseLabel}\``, inline: true },
      { name: 'всього', value: `\`${warns.length}\``, inline: true },
      { name: 'причина', value: reason },
    ];

    if (actions.length) {
      fields.push({ name: 'ескалація', value: actions.map((a) => `\`${a}\``).join(' · ') });
    } else {
      const tips = [];
      const tAt = warnTimeoutAt();
      const kAt = warnKickAt();
      if (tAt > 0) tips.push(`timeout @${tAt} (${warnTimeoutMinutes()}хв)`);
      if (kAt > 0) tips.push(`kick @${kAt}`);
      if (tips.length) {
        fields.push({ name: 'пороги', value: tips.join(' · ') });
      }
    }

    await interaction.reply({
      embeds: [
        warnEmbed({
          title: actions.length ? 'warn · escalate' : 'warn',
          thumbnail: targetUser.displayAvatarURL({ size: 256 }),
          author: {
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL({ size: 64 }),
          },
          fields,
        }),
      ],
    });

    await targetUser
      .send({
        embeds: [
          warnEmbed({
            title: 'попередження',
            description: `сервер **${interaction.guild.name}**`,
            fields: [
              { name: 'причина', value: reason },
              { name: 'case', value: `\`${caseLabel}\``, inline: true },
              { name: 'всього', value: `\`${warns.length}\``, inline: true },
              ...(actions.length
                ? [{ name: 'ескалація', value: actions.join(' · ') }]
                : []),
            ],
          }),
        ],
      })
      .catch(() => null);

    await sendModLog(interaction.guild, {
      title: `warn · ${caseLabel}`,
      color: BRAND.warn,
      fields: [
        { name: 'учасник', value: `${targetUser}` },
        { name: 'модератор', value: `${interaction.user}` },
        { name: 'причина', value: reason },
        { name: 'всього', value: String(warns.length), inline: true },
        { name: 'case', value: caseLabel, inline: true },
        ...(actions.length
          ? [{ name: 'ескалація', value: actions.join(' · ') }]
          : []),
      ],
      footer: `id · ${targetUser.id}`,
    });
  },
};
