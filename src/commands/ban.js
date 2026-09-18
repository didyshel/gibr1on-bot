const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate } = require('../utils/moderation');
const { sendModLog, markAction } = require('../utils/logger');
const { successEmbed, errorReply, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Забанить участника')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Кого забанить').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Причина').setRequired(false),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('delete_days')
        .setDescription('Удалить сообщения за N дней (0–7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false),
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const reason =
      interaction.options.getString('reason') || 'не указана';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (target) {
      const check = canModerate(interaction.member, target);
      if (!check.ok) {
        return interaction.reply(errorReply(check.reason));
      }
    }

    markAction(`ban:${interaction.guild.id}:${targetUser.id}`);
    markAction(`leave:${interaction.guild.id}:${targetUser.id}`);

    await interaction.guild.members.ban(targetUser.id, {
      reason,
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
            { name: 'участник', value: `${targetUser}`, inline: true },
            { name: 'id', value: `\`${targetUser.id}\``, inline: true },
            { name: 'причина', value: reason },
          ],
        }),
      ],
    });

    await sendModLog(interaction.guild, {
      title: 'ban',
      color: BRAND.danger,
      fields: [
        { name: 'участник', value: `${targetUser} (\`${targetUser.tag}\`)` },
        { name: 'модератор', value: `${interaction.user}` },
        { name: 'причина', value: reason },
      ],
      footer: `id · ${targetUser.id}`,
    });
  },
};
