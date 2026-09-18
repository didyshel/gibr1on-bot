const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate } = require('../utils/moderation');
const { sendModLog, markAction } = require('../utils/logger');
const { successEmbed, warnEmbed, errorReply, BRAND } = require('../utils/style');

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

    markAction(`timeout:${interaction.guild.id}:${targetUser.id}`);

    if (minutes === 0) {
      await target.timeout(null, reason);
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
              { name: 'причина', value: reason },
            ],
          }),
        ],
      });
      await sendModLog(interaction.guild, {
        title: 'timeout · снят',
        color: BRAND.success,
        fields: [
          { name: 'участник', value: `${targetUser} (\`${targetUser.tag}\`)` },
          { name: 'модератор', value: `${interaction.user}` },
          { name: 'причина', value: reason },
        ],
        footer: `id · ${targetUser.id}`,
      });
      return;
    }

    await target.timeout(minutes * 60 * 1000, reason);
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
            { name: 'причина', value: reason },
          ],
        }),
      ],
    });

    await sendModLog(interaction.guild, {
      title: 'timeout',
      color: BRAND.warn,
      fields: [
        { name: 'участник', value: `${targetUser} (\`${targetUser.tag}\`)` },
        { name: 'модератор', value: `${interaction.user}` },
        { name: 'длительность', value: `${minutes} мин` },
        { name: 'причина', value: reason },
      ],
      footer: `id · ${targetUser.id}`,
    });
  },
};
