const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getWarns, clearWarns } = require('../utils/warns');
const { sendModLog } = require('../utils/logger');
const { warnEmbed, successEmbed, infoEmbed, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Посмотреть или очистить предупреждения')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Список варнов участника')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Участник').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Очистить варны участника')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Участник').setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user', true);

    if (sub === 'list') {
      const warns = getWarns(interaction.guild.id, user.id);
      if (!warns.length) {
        return interaction.reply({
          embeds: [
            infoEmbed({
              title: 'warns',
              description: `у ${user} нет предупреждений`,
              thumbnail: user.displayAvatarURL({ size: 256 }),
            }),
          ],
          ephemeral: true,
        });
      }

      const embed = warnEmbed({
        title: 'warns',
        thumbnail: user.displayAvatarURL({ size: 256 }),
        description: warns
          .map(
            (w, i) =>
              `**${i + 1}.** ${w.reason}\n<t:${Math.floor(w.at / 1000)}:R> · <@${w.moderatorId}>`,
          )
          .join('\n\n'),
        fields: [
          { name: 'участник', value: `${user}`, inline: true },
          { name: 'всего', value: `\`${warns.length}\``, inline: true },
        ],
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    clearWarns(interaction.guild.id, user.id);
    await interaction.reply({
      embeds: [
        successEmbed({
          title: 'warns · clear',
          thumbnail: user.displayAvatarURL({ size: 256 }),
          description: `варны ${user} очищены`,
        }),
      ],
    });
    await sendModLog(interaction.guild, {
      title: 'warns · clear',
      description: `${user} · модератор ${interaction.user}`,
      color: BRAND.success,
      footer: `id · ${user.id}`,
    });
  },
};
