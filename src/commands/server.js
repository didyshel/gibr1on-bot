const { SlashCommandBuilder } = require('discord.js');
const { brandEmbed, BRAND } = require('../utils/style');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Карточка сервера'),

  async execute(interaction) {
    const guild = interaction.guild;
    await guild.fetch().catch(() => null);

    const owner = await guild.fetchOwner().catch(() => null);
    const created = Math.floor(guild.createdTimestamp / 1000);
    const channels = guild.channels.cache;
    const text = channels.filter((c) => c.isTextBased?.() && !c.isThread?.()).size;
    const voice = channels.filter((c) => c.isVoiceBased?.()).size;
    const boosts = guild.premiumSubscriptionCount || 0;
    const tier = guild.premiumTier || 0;

    await interaction.reply({
      embeds: [
        brandEmbed({
          title: guild.name,
          color: BRAND.color,
          thumbnail: guild.iconURL({ size: 256 }),
          image: guild.bannerURL({ size: 512 }) || undefined,
          fields: [
            { name: 'участники', value: `\`${guild.memberCount}\``, inline: true },
            { name: 'роли', value: `\`${guild.roles.cache.size}\``, inline: true },
            { name: 'эмодзи', value: `\`${guild.emojis.cache.size}\``, inline: true },
            { name: 'текст', value: `\`${text}\``, inline: true },
            { name: 'голос', value: `\`${voice}\``, inline: true },
            { name: 'бусты', value: `\`${boosts}\` · tier ${tier}`, inline: true },
            {
              name: 'владелец',
              value: owner ? `${owner.user}` : '—',
              inline: true,
            },
            { name: 'создан', value: `<t:${created}:D>`, inline: true },
            { name: 'id', value: `\`${guild.id}\``, inline: true },
          ],
          footer: `gibr1on · ${guild.name}`,
        }),
      ],
    });
  },
};
