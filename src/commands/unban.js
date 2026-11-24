const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorReply, BRAND } = require('../utils/style');
const { createCase, formatCaseId } = require('../utils/cases');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Розбанити користувача')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((opt) =>
      opt.setName('user_id').setDescription('ID користувача').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Причина').setRequired(false),
    ),

  async execute(interaction) {
    const userId = interaction.options.getString('user_id', true).trim();
    const reason =
      interaction.options.getString('reason') || 'не вказана';

    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply(errorReply('потрібен числовий user id'));
    }

    const bans = await interaction.guild.bans.fetch().catch(() => null);
    const ban = bans?.get(userId);
    if (!ban) {
      return interaction.reply(errorReply('цей id не в бані'));
    }

    const caseEntry = createCase(interaction.guild.id, {
      type: 'unban',
      userId,
      moderatorId: interaction.user.id,
      reason,
    });
    const caseLabel = formatCaseId(caseEntry.id);

    await interaction.guild.members.unban(
      userId,
      `${caseLabel} · ${reason} · by ${interaction.user.tag}`,
    );

    const user = ban.user;
    await interaction.reply({
      embeds: [
        successEmbed({
          title: 'unban',
          color: BRAND.success,
          thumbnail: user.displayAvatarURL({ size: 256 }),
          fields: [
            { name: 'учасник', value: `${user}`, inline: true },
            { name: 'case', value: `\`${caseLabel}\``, inline: true },
            { name: 'причина', value: reason },
          ],
        }),
      ],
    });
  },
};
