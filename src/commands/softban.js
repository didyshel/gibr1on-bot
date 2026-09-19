const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate } = require('../utils/moderation');
const { sendModLog, markAction } = require('../utils/logger');
const { successEmbed, errorReply, BRAND } = require('../utils/style');
const { createCase, formatCaseId } = require('../utils/cases');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Softban: бан + разбан (чистит сообщения)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Кого softban').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Причина').setRequired(false),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('delete_days')
        .setDescription('Удалить сообщения за N дней (1–7)')
        .setMinValue(1)
        .setMaxValue(7)
        .setRequired(false),
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const reason =
      interaction.options.getString('reason') || 'не указана';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 1;

    const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (target) {
      const check = canModerate(interaction.member, target);
      if (!check.ok) {
        return interaction.reply(errorReply(check.reason));
      }
    }

    const caseEntry = createCase(interaction.guild.id, {
      type: 'softban',
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
      meta: { deleteDays },
    });
    const caseLabel = formatCaseId(caseEntry.id);

    markAction(`modlog:ban:${interaction.guild.id}:${targetUser.id}`);
    markAction(`modlog:unban:${interaction.guild.id}:${targetUser.id}`);
    markAction(`ban:${interaction.guild.id}:${targetUser.id}`);
    markAction(`leave:${interaction.guild.id}:${targetUser.id}`);

    await interaction.guild.members.ban(targetUser.id, {
      reason: `${caseLabel} · softban · ${reason}`,
      deleteMessageSeconds: deleteDays * 24 * 60 * 60,
    });
    await interaction.guild.members.unban(targetUser.id, `${caseLabel} · softban unban`);

    await interaction.reply({
      embeds: [
        successEmbed({
          title: 'softban',
          color: BRAND.warn,
          thumbnail: targetUser.displayAvatarURL({ size: 256 }),
          fields: [
            { name: 'участник', value: `${targetUser}`, inline: true },
            { name: 'case', value: `\`${caseLabel}\``, inline: true },
            { name: 'сообщения', value: `\`${deleteDays}д\``, inline: true },
            { name: 'причина', value: reason },
          ],
        }),
      ],
    });

    await sendModLog(interaction.guild, {
      title: `softban · ${caseLabel}`,
      color: BRAND.warn,
      fields: [
        { name: 'участник', value: `${targetUser}` },
        { name: 'модератор', value: `${interaction.user}` },
        { name: 'причина', value: reason },
        { name: 'case', value: caseLabel, inline: true },
      ],
      footer: `id · ${targetUser.id}`,
    });
  },
};
