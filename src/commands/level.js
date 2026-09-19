const { SlashCommandBuilder } = require('discord.js');
const {
  getUser,
  levelFromXp,
  getRank,
  highestRoleForLevel,
} = require('../features/levels');
const { brandEmbed, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Уровень, XP и активность')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Участник').setRequired(false),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const row = getUser(interaction.guildId, user.id, { create: false });
    const { level, intoLevel, need } = levelFromXp(row.xp || 0);
    const rank = getRank(interaction.guildId, user.id);
    const pct = need ? Math.min(100, Math.round((intoLevel / need) * 100)) : 0;
    const barLen = 12;
    const filled = Math.round((pct / 100) * barLen);
    const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
    const activity = highestRoleForLevel(interaction.guildId, level);

    const voiceMin = row.voiceMinutes || 0;
    const voiceLabel =
      voiceMin >= 60 ? `${Math.floor(voiceMin / 60)}ч ${voiceMin % 60}м` : `${voiceMin} мин`;

    await interaction.reply({
      embeds: [
        brandEmbed({
          title: 'level',
          color: BRAND.soft,
          thumbnail: user.displayAvatarURL({ size: 256 }),
          fields: [
            { name: 'участник', value: `${user}`, inline: true },
            { name: 'уровень', value: `\`${level}\``, inline: true },
            { name: 'ранг', value: rank ? `\`${rank}\`` : '—', inline: true },
            {
              name: 'активность',
              value: activity ? `<@&${activity.roleId}>` : '—',
              inline: true,
            },
            { name: 'сообщения', value: `\`${row.messages || 0}\``, inline: true },
            { name: 'голос', value: `\`${voiceLabel}\``, inline: true },
            { name: 'xp', value: `\`${row.xp || 0}\` · ${bar} ${pct}%` },
            {
              name: 'до следующего',
              value: `\`${intoLevel}/${need}\``,
              inline: true,
            },
          ],
        }),
      ],
      ephemeral: true,
    });
  },
};
