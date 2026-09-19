const { Events } = require('discord.js');
const { afkDetect, afkMinutes, afkChannelId } = require('../utils/config');
const { isAllowedGuild } = require('../utils/security');
const { sendServerLog, markAction } = require('../utils/logger');
const { BRAND } = require('../utils/style');

/** @type {Map<string, number>} */
const idleSince = new Map();

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

function isIdleState(state) {
  if (!state?.channelId) return false;
  const afkId = afkChannelId();
  if (afkId && state.channelId === afkId) return false;
  return Boolean(state.selfDeaf || state.deaf || state.selfMute);
}

function registerAfkDetect(client) {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    try {
      if (!afkDetect()) return;
      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;
      const guild = newState.guild || oldState.guild;
      if (!guild || !isAllowedGuild(guild.id)) return;

      const k = key(guild.id, member.id);
      if (isIdleState(newState)) {
        if (!idleSince.has(k)) idleSince.set(k, Date.now());
      } else {
        idleSince.delete(k);
      }
    } catch (error) {
      console.error('afkDetect state:', error);
    }
  });

  client.once(Events.ClientReady, () => {
    setInterval(async () => {
      if (!afkDetect()) return;
      const needMs = Math.max(1, afkMinutes()) * 60_000;
      const targetAfk = afkChannelId();
      if (!targetAfk) return;

      for (const [k, since] of idleSince.entries()) {
        if (Date.now() - since < needMs) continue;
        const [guildId, userId] = k.split(':');
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          idleSince.delete(k);
          continue;
        }
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member?.voice?.channelId) {
          idleSince.delete(k);
          continue;
        }
        if (member.voice.channelId === targetAfk) {
          idleSince.delete(k);
          continue;
        }
        if (!isIdleState(member.voice)) {
          idleSince.delete(k);
          continue;
        }

        markAction(`voicemove:${guild.id}:${member.id}`);
        await member.voice.setChannel(targetAfk, 'AFK detect').catch(() => null);
        idleSince.delete(k);

        await sendServerLog(guild, {
          category: 'member',
          title: 'AFK detect',
          color: BRAND.soft,
          fields: [
            { name: 'участник', value: `${member}` },
            { name: 'куда', value: `<#${targetAfk}>` },
          ],
        });
      }
    }, 30_000);
  });
}

module.exports = { registerAfkDetect };
