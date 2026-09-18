const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate } = require('../utils/moderation');
const { sendModLog, markAction } = require('../utils/logger');
const { warnEmbed, errorReply, BRAND } = require('../utils/style');

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

    markAction(`kick:${interaction.guild.id}:${targetUser.id}`);
    markAction(`leave:${interaction.guild.id}:${targetUser.id}`);

    await target.kick(reason);

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
            { name: 'id', value: `\`${targetUser.id}\``, inline: true },
            { name: 'причина', value: reason },
          ],
        }),
      ],
    });

    await sendModLog(interaction.guild, {
      title: 'kick',
      color: BRAND.warn,
      fields: [
        { name: 'участник', value: `${targetUser} (\`${targetUser.tag}\`)` },
        { name: 'модератор', value: `${interaction.user}` },
        { name: 'причина', value: reason },
      ],
      footer: `id · ${targetUser.id}`,
    });
  },
};
