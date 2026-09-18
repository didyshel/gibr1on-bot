const { Events } = require('discord.js');
const {
  statsMembersChannelId,
  statsOnlineChannelId,
} = require('../utils/config');

async function updateStats(guild) {
  const membersId = statsMembersChannelId();
  const onlineId = statsOnlineChannelId();
  if (!membersId && !onlineId) return;

  if (membersId) {
    const channel = await guild.channels.fetch(membersId).catch(() => null);
    if (channel) {
      const name = `👥 Участники: ${guild.memberCount}`.slice(0, 100);
      if (channel.name !== name) {
        await channel.setName(name).catch(() => null);
      }
    }
  }

  if (onlineId) {
    const channel = await guild.channels.fetch(onlineId).catch(() => null);
    if (channel) {
      let online = guild.members.cache.filter(
        (m) => !m.user.bot && m.presence && m.presence.status !== 'offline',
      ).size;

      // fallback if Presence Intent off / cache empty
      if (!online && typeof guild.approximatePresenceCount === 'number') {
        online = guild.approximatePresenceCount;
      }
      if (!online) {
        online = guild.members.cache.filter((m) => m.voice?.channelId).size;
      }

      const name = `🟢 Онлайн: ${online}`.slice(0, 100);
      if (channel.name !== name) {
        await channel.setName(name).catch(() => null);
      }
    }
  }
}

function registerStats(client) {
  const run = async () => {
    for (const guild of client.guilds.cache.values()) {
      await updateStats(guild);
    }
  };

  client.once(Events.ClientReady, () => {
    run();
    setInterval(run, 5 * 60 * 1000);
  });

  client.on(Events.GuildMemberAdd, (member) => updateStats(member.guild));
  client.on(Events.GuildMemberRemove, (member) => updateStats(member.guild));
}

module.exports = { registerStats };
