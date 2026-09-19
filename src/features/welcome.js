const { Events, AttachmentBuilder } = require('discord.js');
const { welcomeChannelId, autoRoleId, welcomeCard } = require('../utils/config');
const { brandEmbed, BRAND } = require('../utils/style');
const { isAllowedGuild } = require('../utils/security');
const { renderWelcomeCard } = require('../utils/welcomeCard');
const { markAction } = require('../utils/logger');

function registerWelcome(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      if (!isAllowedGuild(member.guild.id)) return;
      const roleId = autoRoleId();
      if (roleId) {
        markAction(`roles:${member.guild.id}:${member.id}`);
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

      const payload = { content: `${member}`, embeds: [embed] };

      if (welcomeCard()) {
        try {
          const buffer = await renderWelcomeCard({
            displayName: member.displayName,
            username: member.user.username,
            avatarURL: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
            guildName: member.guild.name,
            memberCount: member.guild.memberCount,
          });
          if (buffer) {
            const file = new AttachmentBuilder(buffer, { name: 'welcome.png' });
            embed.setImage('attachment://welcome.png');
            payload.files = [file];
            payload.embeds = [embed];
          }
        } catch (err) {
          console.warn('welcome card:', err.message);
        }
      }

      await channel.send(payload);
    } catch (error) {
      console.error('Ошибка приветствия:', error);
    }
  });
}

module.exports = { registerWelcome };
