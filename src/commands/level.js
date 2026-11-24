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
    .setDescription('Рівень, XP та активність')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Учасник').setRequired(false),
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
          ? `${Math.floor(voiceMin / 60)}г ${voiceMin % 60}хв`
          : `${voiceMin} хв`;

      await interaction.editReply({
        embeds: [
          brandEmbed({
            title: 'level',
            color: BRAND.soft,
            thumbnail: user.displayAvatarURL({ size: 256 }),
            fields: [
              { name: 'учасник', value: `${user}`, inline: true },
              { name: 'рівень', value: `\`${level}\``, inline: true },
              { name: 'ранг', value: rank ? `\`${rank}\`` : '—', inline: true },
              {
                name: 'активність',
                value: activity ? `<@&${activity.roleId}>` : '—',
                inline: true,
              },
              { name: 'повідомлення', value: `\`${row.messages || 0}\``, inline: true },
              { name: 'голос', value: `\`${voiceLabel}\``, inline: true },
              {
                name: 'xp',
                value: `\`${row.xp || 0}\` · ${progressBar(pct)} ${pct}%`,
              },
              {
                name: 'до наступного',
                value: `\`${intoLevel}/${need}\``,
                inline: true,
              },
            ],
          }),
        ],
      });
    } catch (error) {
      console.error('level cmd:', error);
      const payload = errorReply(error?.message || 'не вдалося показати рівень');
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => null);
      } else {
        await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    }
  },
};
