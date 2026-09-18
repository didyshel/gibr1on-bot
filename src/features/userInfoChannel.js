const { brandEmbed, infoEmbed, errorEmbed, BRAND } = require('../utils/style');
const { infoUserChannelId } = require('../utils/config');
const { isAllowedGuild } = require('../utils/security');

const FLAG_LABELS = {
  Staff: 'Discord Staff',
  Partner: 'Partner',
  Hypesquad: 'HypeSquad Events',
  BugHunterLevel1: 'Bug Hunter',
  BugHunterLevel2: 'Bug Hunter Gold',
  HypeSquadOnlineHouse1: 'Bravery',
  HypeSquadOnlineHouse2: 'Brilliance',
  HypeSquadOnlineHouse3: 'Balance',
  PremiumEarlySupporter: 'Early Supporter',
  VerifiedDeveloper: 'Verified Bot Dev',
  CertifiedModerator: 'Mod Alumni',
  ActiveDeveloper: 'Active Developer',
  BotHTTPInteractions: 'HTTP Interactions Bot',
};

function normalizeChannelName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function isInfoUserChannel(channel) {
  if (!channel || channel.isDMBased?.()) return false;
  const configured = infoUserChannelId();
  if (configured) return channel.id === configured;
  return normalizeChannelName(channel.name) === 'infouser';
}

function extractUserIds(content) {
  const ids = new Set();
  for (const match of content.matchAll(/<@!?(\d{17,20})>/g)) {
    ids.add(match[1]);
  }
  for (const match of content.matchAll(/\b(\d{17,20})\b/g)) {
    ids.add(match[1]);
  }
  return [...ids];
}

function formatFlags(user) {
  const bits = user.flags ?? user.publicFlags;
  if (!bits) return '—';
  const list = bits.toArray?.() || [];
  if (!list.length) return '—';
  return list.map((flag) => FLAG_LABELS[flag] || flag).join(', ');
}

async function buildUserInfoEmbed(guild, userId, client) {
  let user;
  try {
    user = await client.users.fetch(userId, { force: true });
  } catch {
    return null;
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  const createdTs = Math.floor(user.createdTimestamp / 1000);
  const accent =
    member?.displayHexColor && member.displayHexColor !== '#000000'
      ? member.displayHexColor
      : BRAND.color;

  const embed = brandEmbed({
    title: user.bot ? `bot · ${user.tag}` : `user · ${user.tag}`,
    color: accent,
    thumbnail: user.displayAvatarURL({ size: 4096 }),
    footer: `id · ${user.id}`,
    fields: [
      { name: 'имя', value: user.username, inline: true },
      { name: 'display', value: user.globalName || '—', inline: true },
      { name: 'id', value: `\`${user.id}\``, inline: true },
      { name: 'создан', value: `<t:${createdTs}:R>`, inline: true },
      { name: 'бот', value: user.bot ? 'да' : 'нет', inline: true },
      { name: 'бейджи', value: formatFlags(user) },
      {
        name: 'аватар',
        value: `[открыть](${user.displayAvatarURL({ size: 4096 })})`,
        inline: true,
      },
    ],
  });

  if (user.banner) {
    const banner = user.bannerURL({ size: 4096 });
    embed.setImage(banner);
    embed.addFields({ name: 'баннер', value: `[открыть](${banner})`, inline: true });
  } else if (user.accentColor) {
    embed.addFields({
      name: 'accent',
      value: `#${user.accentColor.toString(16).padStart(6, '0')}`,
      inline: true,
    });
  }

  if (member) {
    const joinedTs = member.joinedTimestamp
      ? Math.floor(member.joinedTimestamp / 1000)
      : null;
    const roles = member.roles.cache
      .filter((r) => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => `${r}`);

    embed.addFields(
      { name: 'на сервере', value: 'да', inline: true },
      { name: 'ник', value: member.nickname || '—', inline: true },
      {
        name: 'зашёл',
        value: joinedTs ? `<t:${joinedTs}:R>` : '—',
        inline: true,
      },
      {
        name: 'буст',
        value: member.premiumSince
          ? `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`
          : 'нет',
        inline: true,
      },
      {
        name: 'timeout',
        value: member.communicationDisabledUntilTimestamp
          ? `до <t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>`
          : 'нет',
        inline: true,
      },
      {
        name: 'войс',
        value: member.voice?.channel ? `${member.voice.channel}` : 'нет',
        inline: true,
      },
      {
        name: `роли · ${roles.length}`,
        value: roles.length ? roles.slice(0, 30).join(' ') : '—',
      },
      {
        name: 'высшая',
        value: member.roles.highest?.id !== guild.id
          ? `${member.roles.highest}`
          : '—',
        inline: true,
      },
      {
        name: 'админ',
        value: member.permissions.has('Administrator') ? 'да' : 'нет',
        inline: true,
      },
    );
  } else {
    embed.addFields({
      name: 'на этом сервере',
      value: 'нет',
    });
  }

  return embed;
}

function registerUserInfoChannel(client) {
  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!isAllowedGuild(message.guild.id)) return;
      if (!isInfoUserChannel(message.channel)) return;

      const ids = extractUserIds(message.content);
      if (!ids.length) {
        await message.reply({
          embeds: [
            infoEmbed({
              title: 'user info',
              description: 'вставь **id** или упоминание',
            }),
          ],
        });
        return;
      }

      const embeds = [];
      for (const id of ids.slice(0, 3)) {
        const embed = await buildUserInfoEmbed(message.guild, id, client);
        if (embed) embeds.push(embed);
        else {
          await message.reply({
            embeds: [
              errorEmbed({
                title: 'user info',
                description: `не найден · \`${id}\``,
              }),
            ],
          });
        }
      }

      if (embeds.length) {
        await message.reply({ embeds });
      }
    } catch (error) {
      console.error('userInfoChannel:', error);
      await message
        .reply({
          embeds: [
            errorEmbed({
              title: 'user info',
              description: 'не удалось получить данные',
            }),
          ],
        })
        .catch(() => null);
    }
  });
}

module.exports = {
  registerUserInfoChannel,
  isInfoUserChannel,
};
