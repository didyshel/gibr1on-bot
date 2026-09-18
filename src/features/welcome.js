const { Events } = require('discord.js');
const { welcomeChannelId, autoRoleId } = require('../utils/config');
const { brandEmbed, BRAND } = require('../utils/style');
const { isAllowedGuild } = require('../utils/security');

function registerWelcome(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      if (!isAllowedGuild(member.guild.id)) return;
      const roleId = autoRoleId();
      if (roleId) {
        await member.roles.add(roleId).catch((err) => {
          console.warn('Не удалось выдать автороль:', err.message);
        });
      }

      const channelId = welcomeChannelId();
      if (!channelId) return;

      const channel = await member.guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased()) return;

      const created = Math.floor(member.user.createdTimestamp / 1000);
      const embed = brandEmbed({
        title: 'welcome',
        description: [
          `${member}`,
          '',
          `**${member.guild.name}**`,
          '',
          'правила · роли · добро пожаловать',
        ].join('\n'),
        thumbnail: member.user.displayAvatarURL({ size: 512 }),
        color: BRAND.color,
        fields: [
          { name: 'участников', value: `\`${member.guild.memberCount}\``, inline: true },
          { name: 'аккаунт', value: `<t:${created}:R>`, inline: true },
        ],
        footer: `id · ${member.id}`,
      });

      await channel.send({ content: `${member}`, embeds: [embed] });
    } catch (error) {
      console.error('Ошибка приветствия:', error);
    }
  });
}

module.exports = { registerWelcome };
