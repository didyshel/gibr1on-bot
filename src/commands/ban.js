const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate } = require('../utils/moderation');
const { markAction } = require('../utils/logger');
const { successEmbed, errorReply, BRAND } = require('../utils/style');
const { createCase, formatCaseId } = require('../utils/cases');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Забанити учасника')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Кого забанити').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Причина').setRequired(false),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('delete_days')
        .setDescription('Видалити повідомлення за N днів (0–7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false),
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const reason =
      interaction.options.getString('reason') || 'не вказана';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (target) {
      const check = canModerate(interaction.member, target);
      if (!check.ok) {
        return interaction.reply(errorReply(check.reason));
      }
    }

    const caseEntry = createCase(interaction.guild.id, {
      type: 'ban',
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
      meta: { deleteDays: deleteDays },
    });
    const caseLabel = formatCaseId(caseEntry.id);

    // Лише придушуємо «вийшов» / другий leave-лог; сам бан пише audit-лог один раз
    markAction(`ban:${interaction.guild.id}:${targetUser.id}`);
    markAction(`leave:${interaction.guild.id}:${targetUser.id}`);

    await interaction.guild.members.ban(targetUser.id, {
      reason: `${caseLabel} · ${reason} · by ${interaction.user.tag}`,
      deleteMessageSeconds: deleteDays * 24 * 60 * 60,
    });

    await interaction.reply({
      embeds: [
        successEmbed({
          title: 'ban',
          color: BRAND.danger,
          thumbnail: targetUser.displayAvatarURL({ size: 256 }),
          author: {
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL({ size: 64 }),
          },
          fields: [
            { name: 'учасник', value: `${targetUser}`, inline: true },
            { name: 'case', value: `\`${caseLabel}\``, inline: true },
            { name: 'id', value: `\`${targetUser.id}\``, inline: true },
            { name: 'причина', value: reason },
          ],
        }),
      ],
    });
  },
};
