const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate } = require('../utils/moderation');
const { addWarn } = require('../utils/warns');
const { sendModLog } = require('../utils/logger');
const { warnEmbed, errorReply, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Выдать предупреждение')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Кому выдать warn').setRequired(true),
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

    const warns = addWarn(interaction.guild.id, targetUser.id, {
      reason,
      moderatorId: interaction.user.id,
      at: Date.now(),
    });

    await interaction.reply({
      embeds: [
        warnEmbed({
          title: 'warn',
          thumbnail: targetUser.displayAvatarURL({ size: 256 }),
          author: {
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL({ size: 64 }),
          },
          fields: [
            { name: 'участник', value: `${targetUser}`, inline: true },
            { name: 'всего', value: `\`${warns.length}\``, inline: true },
            { name: 'причина', value: reason },
          ],
        }),
      ],
    });

    await targetUser
      .send({
        embeds: [
          warnEmbed({
            title: 'предупреждение',
            description: `сервер **${interaction.guild.name}**`,
            fields: [
              { name: 'причина', value: reason },
              { name: 'всего', value: `\`${warns.length}\``, inline: true },
            ],
          }),
        ],
      })
      .catch(() => null);

    await sendModLog(interaction.guild, {
      title: 'warn',
      color: BRAND.warn,
      fields: [
        { name: 'участник', value: `${targetUser}` },
        { name: 'модератор', value: `${interaction.user}` },
        { name: 'причина', value: reason },
        { name: 'всего', value: String(warns.length), inline: true },
      ],
      footer: `id · ${targetUser.id}`,
    });
  },
};
