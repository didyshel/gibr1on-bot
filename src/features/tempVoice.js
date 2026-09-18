const { Events, ChannelType, PermissionFlagsBits } = require('discord.js');
const { tempVoiceHubId, tempVoiceCategoryId } = require('../utils/config');
const { sendServerLog } = require('../utils/logger');
const { BRAND } = require('../utils/style');
const { readJson, writeJson } = require('../utils/store');
const { isAllowedGuild } = require('../utils/security');

const FILE = 'temp-voices.json';

function loadIds() {
  const data = readJson(FILE, { channels: [] });
  return new Set(data.channels || []);
}

function saveIds(set) {
  writeJson(FILE, { channels: [...set] });
}

function isTempName(name) {
  return typeof name === 'string' && (name.startsWith('⏳') || name.startsWith('⏳ '));
}

async function deleteIfEmpty(channel, leavingUserId) {
  if (!channel || !channel.isVoiceBased?.()) return false;
  const remaining = channel.members.filter((m) => m.id !== leavingUserId).size;
  if (remaining > 0) return false;
  await channel.delete('Temp voice empty').catch(() => null);
  return true;
}

function registerTempVoice(client) {
  /** @type {Set<string>} */
  let tempChannels = loadIds();

  const remember = (id) => {
    tempChannels.add(id);
    saveIds(tempChannels);
  };

  const forget = (id) => {
    if (!tempChannels.has(id)) return;
    tempChannels.delete(id);
    saveIds(tempChannels);
  };

  client.once(Events.ClientReady, async () => {
    tempChannels = loadIds();
    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased?.()) continue;
        if (!tempChannels.has(channel.id) && !isTempName(channel.name)) continue;
        if (channel.members.size === 0) {
          await channel.delete('Temp voice cleanup on startup').catch(() => null);
          forget(channel.id);
        } else {
          remember(channel.id);
        }
      }
    }
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      const hubId = tempVoiceHubId();
      if (!hubId) return;

      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;

      const guild = newState.guild || oldState.guild;
      if (!guild || !isAllowedGuild(guild.id)) return;
      const me = guild.members.me;

      // Join hub -> create room in the SAME category as the hub
      if (newState.channelId === hubId && oldState.channelId !== hubId) {
        if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
          console.error('tempVoice: нет права Manage Channels');
          await sendServerLog(guild, {
            category: 'server',
            title: 'Temp voice: нет прав',
            color: BRAND.danger,
            description:
              'Роли бота нужно: **Управлять каналами**, **Управлять ролями**, **Перемещать участников**.',
          });
          return;
        }

        const hubChannel = newState.channel;
        // Приоритет: категория самого hub (чтобы комнаты были рядом), иначе .env
        const configuredCat = tempVoiceCategoryId();
        const parentId = hubChannel?.parentId || configuredCat || null;

        if (parentId) {
          const parent = await guild.channels.fetch(parentId).catch(() => null);
          if (!parent || parent.type !== ChannelType.GuildCategory) {
            console.error('tempVoice: parent не категория:', parentId);
            await sendServerLog(guild, {
              category: 'server',
              title: 'Temp voice: неверная категория',
              color: BRAND.danger,
              description:
                '`TEMP_VOICE_CATEGORY_ID` должен быть ID **категории**, либо поставь hub внутрь нужной категории.',
            });
            return;
          }
          if (!parent.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) {
            await sendServerLog(guild, {
              category: 'server',
              title: 'Temp voice: блок в категории',
              color: BRAND.danger,
              description: `В категории **${parent.name}** боту запрещено управлять каналами.`,
            });
            return;
          }
        }

        const createOptions = {
          name: `⏳ ${member.displayName}`.slice(0, 100),
          type: ChannelType.GuildVoice,
          reason: `Temp voice for ${member.user.tag}`,
        };

        if (parentId) createOptions.parent = parentId;

        if (me.permissions.has(PermissionFlagsBits.ManageRoles)) {
          createOptions.permissionOverwrites = [
            {
              id: guild.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
            },
            {
              id: member.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.MoveMembers,
                PermissionFlagsBits.MuteMembers,
              ],
            },
          ];
        }

        let channel;
        try {
          channel = await guild.channels.create(createOptions);
        } catch (error) {
          // Повтор только без overwrites, но С той же категорией
          console.warn('tempVoice create retry without overwrites:', error.message);
          channel = await guild.channels.create({
            name: `⏳ ${member.displayName}`.slice(0, 100),
            type: ChannelType.GuildVoice,
            parent: parentId || undefined,
            reason: `Temp voice for ${member.user.tag}`,
          });
        }

        remember(channel.id);

        try {
          await member.voice.setChannel(channel);
        } catch (err) {
          console.error('tempVoice move failed:', err.message);
          await sendServerLog(guild, {
            category: 'server',
            title: 'Temp voice: не переместил',
            color: BRAND.warn,
            description: `Комната ${channel} создана. Нужно право **Перемещать участников**.`,
          });
          // если никто не зашёл — удалить пустую
          setTimeout(async () => {
            const fresh = await guild.channels.fetch(channel.id).catch(() => null);
            if (fresh && fresh.members.size === 0) {
              await fresh.delete('Temp voice unused').catch(() => null);
              forget(channel.id);
            }
          }, 3000);
        }
      }

      // Cleanup when leaving a temp room
      const leftId = oldState.channelId;
      if (leftId && leftId !== hubId) {
        const leftChannel = oldState.channel;
        const tracked = tempChannels.has(leftId) || isTempName(leftChannel?.name);
        if (tracked && leftChannel) {
          const deleted = await deleteIfEmpty(leftChannel, member.id);
          if (deleted) forget(leftId);
        }
      }

      // Also if someone left and channel id was in store but channel object partial
      if (leftId && tempChannels.has(leftId) && !oldState.channel) {
        const ch = await guild.channels.fetch(leftId).catch(() => null);
        if (ch) {
          const deleted = await deleteIfEmpty(ch, member.id);
          if (deleted) forget(leftId);
        }
      }
    } catch (error) {
      console.error('tempVoice:', error);
    }
  });
}

module.exports = { registerTempVoice };
