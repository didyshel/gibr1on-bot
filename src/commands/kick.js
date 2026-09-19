const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate } = require('../utils/moderation');
const { warnEmbed, errorReply, BRAND } = require('../utils/style');
const { createCase, formatCaseId } = require('../utils/cases');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Кикнуть участника с сервера')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Кого кикнуть').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Причина').setRequired(false),
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
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
      type: 'kick',
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
    });
    const caseLabel = formatCaseId(caseEntry.id);

    // Не глушим leave — audit-лог «кикнут» должен отправиться один раз
    await target.kick(`${caseLabel} · ${reason} · by ${interaction.user.tag}`);

    await interaction.reply({
      embeds: [
        warnEmbed({
          title: 'kick',
          color: BRAND.warn,
          thumbnail: targetUser.displayAvatarURL({ size: 256 }),
          author: {
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL({ size: 64 }),
          },
          fields: [
            { name: 'участник', value: `${targetUser}`, inline: true },
            { name: 'case', value: `\`${caseLabel}\``, inline: true },
            { name: 'id', value: `\`${targetUser.id}\``, inline: true },
            { name: 'причина', value: reason },
          ],
        }),
      ],
    });
  },
};
