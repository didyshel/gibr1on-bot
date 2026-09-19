const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const {
  getUser,
  levelFromXp,
  getRank,
  highestRoleForLevel,
} = require('../features/levels');
const { brandEmbed, errorReply, BRAND } = require('../utils/style');

function progressBar(pct) {
  const len = 10;
  const filled = Math.max(0, Math.min(len, Math.round((pct / 100) * len)));
  return `[${'#'.repeat(filled)}${'-'.repeat(len - filled)}]`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Уровень, XP и активность')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Участник').setRequired(false),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const user = interaction.options.getUser('user') || interaction.user;
      const row = getUser(interaction.guildId, user.id, { create: false });
      const { level, intoLevel, need } = levelFromXp(row.xp || 0);
      const rank = getRank(interaction.guildId, user.id);
      const pct = need ? Math.min(100, Math.round((intoLevel / need) * 100)) : 0;
      const activity = highestRoleForLevel(interaction.guildId, level);

      const voiceMin = Number(row.voiceMinutes) || 0;
      const voiceLabel =
        voiceMin >= 60
          ? `${Math.floor(voiceMin / 60)}ч ${voiceMin % 60}м`
          : `${voiceMin} мин`;

      await interaction.editReply({
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
              {
                name: 'xp',
                value: `\`${row.xp || 0}\` · ${progressBar(pct)} ${pct}%`,
              },
              {
                name: 'до следующего',
                value: `\`${intoLevel}/${need}\``,
                inline: true,
              },
            ],
          }),
        ],
      });
    } catch (error) {
      console.error('level cmd:', error);
      const payload = errorReply(error?.message || 'не удалось показать уровень');
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => null);
      } else {
        await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    }
  },
};
