const {
  Events,
  AuditLogEvent,
  ChannelType,
} = require('discord.js');
const {
  sendServerLog,
  findAuditExecutor,
  findAuditEntry,
  truncate,
  getLogChannel,
  consumeAction,
  hasAction,
  markAction,
} = require('../utils/logger');
const { isLogChannelId, tempVoiceHubId } = require('../utils/config');
const { isInfoUserChannel } = require('../features/userInfoChannel');
const { BRAND } = require('../utils/style');

const messageCache = new Map();
const CACHE_LIMIT = 3000;

function cacheMessage(message) {
  if (!message?.id || message.author?.bot) return;
  messageCache.set(message.id, {
    content: message.content || '',
    authorId: message.author.id,
    authorTag: message.author.tag,
    channelId: message.channelId,
    attachments: [...message.attachments.values()].map((a) => a.url),
    stickers: [...message.stickers.values()].map((s) => s.name),
  });
  if (messageCache.size > CACHE_LIMIT) {
    const oldest = messageCache.keys().next().value;
    messageCache.delete(oldest);
  }
}

function channelLabel(channel) {
  if (!channel) return 'невідомий канал';
  if (channel.type === ChannelType.GuildCategory) return `категорія **${channel.name}**`;
  if (channel.isVoiceBased?.()) return `${channel} (${channel.name})`;
  return `${channel}`;
}

function isLogChannel(channelId) {
  return isLogChannelId(channelId);
}

function shouldSkipMessageLog(channel) {
  if (!channel) return true;
  if (isLogChannel(channel.id)) return true;
  if (isInfoUserChannel(channel)) return true;
  return false;
}

function isTempVoiceName(name) {
  return typeof name === 'string' && name.startsWith('⏳');
}

function registerAuditLogs(client) {
  const botId = () => client.user?.id;

  // Лише кеш — без логу кожного повідомлення (інакше спам)
  client.on(Events.MessageCreate, (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (shouldSkipMessageLog(message.channel)) return;
      cacheMessage(message);
    } catch (error) {
      console.error('log messageCreate:', error);
    }
  });

  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    try {
      if (!newMessage.guild) return;
      if (newMessage.partial) {
        try {
          newMessage = await newMessage.fetch();
        } catch {
          return;
        }
      }
      if (!newMessage.author || newMessage.author.bot) return;
      if (shouldSkipMessageLog(newMessage.channel)) return;

      const before =
        oldMessage.content ??
        messageCache.get(newMessage.id)?.content ??
        '(невідомо)';
      const after = newMessage.content ?? '';
      if (before === after) return;

      cacheMessage(newMessage);

      await sendServerLog(newMessage.guild, {
        category: 'message',
        title: 'Повідомлення змінено',
        color: BRAND.warn,
        fields: [
          { name: 'Автор', value: `${newMessage.author} (\`${newMessage.author.tag}\`)`, inline: true },
          { name: 'Канал', value: `${newMessage.channel}`, inline: true },
          { name: 'Було', value: truncate(before) },
          { name: 'Стало', value: truncate(after || '(порожньо)') },
          { name: 'Посилання', value: `[Перейти](${newMessage.url})` },
        ],
        footer: `ID: ${newMessage.id}`,
      });
    } catch (error) {
      console.error('log messageUpdate:', error);
    }
  });

  client.on(Events.MessageDelete, async (message) => {
    try {
      const guild = message.guild;
      if (!guild) return;
      if (shouldSkipMessageLog(message.channel) || isLogChannel(message.channelId)) return;

      // Точковий skip лише для повідомлень, які видалив автомод/бот сам
      if (consumeAction(`delmsg:${message.id}`)) {
        messageCache.delete(message.id);
        return;
      }

      const cached = messageCache.get(message.id);
      const author =
        message.author ||
        (cached
          ? { id: cached.authorId, tag: cached.authorTag, toString: () => `<@${cached.authorId}>` }
          : null);

      if (author?.bot) return;

      const executor = await findAuditExecutor(
        guild,
        AuditLogEvent.MessageDelete,
        author?.id,
      );

      const content =
        message.content ||
        cached?.content ||
        '(вміст недоступний — повідомлення не було в кеші)';
      const attachments =
        [...(message.attachments?.values?.() || [])].map((a) => a.url) ||
        cached?.attachments ||
        [];

      const fields = [
        {
          name: 'Автор',
          value: author
            ? `${author} (\`${author.tag || author.id}\`)`
            : 'невідомо',
          inline: true,
        },
        {
          name: 'Канал',
          value: message.channel ? `${message.channel}` : `<#${message.channelId}>`,
          inline: true,
        },
        { name: 'Вміст', value: truncate(content) },
      ];
      if (executor && executor.id !== botId()) {
        fields.push({ name: 'Видалив', value: `${executor} (\`${executor.tag}\`)`, inline: true });
      }
      if (attachments.length) {
        fields.push({ name: 'Вкладення', value: truncate(attachments.join('\n')) });
      }

      await sendServerLog(guild, {
        category: 'message',
        title: 'Повідомлення видалено',
        color: BRAND.danger,
        fields,
        footer: `ID: ${message.id}`,
      });
      messageCache.delete(message.id);
    } catch (error) {
      console.error('log messageDelete:', error);
    }
  });

  client.on(Events.MessageBulkDelete, async (messages) => {
    try {
      const first = messages.first();
      const channel = first?.channel;
      const guild = channel?.guild || first?.guild;
      if (!guild || !channel || isLogChannel(channel.id)) return;

      if (consumeAction(`bulk:${guild.id}:${channel.id}`)) return;

      const executor = await findAuditExecutor(guild, AuditLogEvent.MessageBulkDelete, channel.id);

      await sendServerLog(guild, {
        category: 'message',
        title: 'Масове видалення повідомлень',
        color: BRAND.danger,
        fields: [
          { name: 'Канал', value: `${channel}`, inline: true },
          { name: 'Кількість', value: String(messages.size), inline: true },
          {
            name: 'Хто видалив',
            value: executor ? `${executor} (\`${executor.tag}\`)` : 'невідомо',
          },
        ],
      });
    } catch (error) {
      console.error('log messageBulkDelete:', error);
    }
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;
      const guild = newState.guild || oldState.guild;
      const hubId = tempVoiceHubId();

      const oldCh = oldState.channel;
      const newCh = newState.channel;

      // Пропускаємо лише вхід/вихід із hub, переміщення логуємо
      const hubJoin = hubId && !oldCh && newCh?.id === hubId;
      const hubLeave = hubId && oldCh?.id === hubId && !newCh;

      if (!hubJoin && !hubLeave) {
        if (!oldCh && newCh) {
          await sendServerLog(guild, {
            category: 'member',
            title: 'Голос: вхід',
            color: BRAND.success,
            fields: [
              { name: 'Учасник', value: `${member} (\`${member.user.tag}\`)`, inline: true },
              { name: 'Канал', value: channelLabel(newCh), inline: true },
            ],
          });
        } else if (oldCh && !newCh) {
          await sendServerLog(guild, {
            category: 'member',
            title: 'Голос: вихід',
            color: BRAND.danger,
            fields: [
              { name: 'Учасник', value: `${member} (\`${member.user.tag}\`)`, inline: true },
              { name: 'Канал', value: channelLabel(oldCh), inline: true },
            ],
          });
        } else if (oldCh && newCh && oldCh.id !== newCh.id) {
          if (consumeAction(`voicemove:${guild.id}:${member.id}`)) {
            // temp voice / afk / moveall вже залогували або не потрібні
          } else {
            const mover = await findAuditExecutor(guild, AuditLogEvent.MemberMove, member.id);
            if (!(mover && botId() && mover.id === botId())) {
              const fields = [
                { name: 'Учасник', value: `${member} (\`${member.user.tag}\`)`, inline: true },
                { name: 'Звідки', value: channelLabel(oldCh), inline: true },
                { name: 'Куди', value: channelLabel(newCh), inline: true },
              ];
              if (mover && mover.id !== member.id) {
                fields.push({ name: 'Перемістив', value: `${mover} (\`${mover.tag}\`)` });
              }
              await sendServerLog(guild, {
                category: 'member',
                title: 'Голос: переміщення',
                color: BRAND.warn,
                fields,
              });
            }
          }
        }
      }

      const voiceFlags = [];
      if (oldState.serverMute !== newState.serverMute) {
        voiceFlags.push(newState.serverMute ? 'серверний мут увімкнено' : 'серверний мут знято');
      }
      if (oldState.serverDeaf !== newState.serverDeaf) {
        voiceFlags.push(newState.serverDeaf ? 'серверний deaf увімкнено' : 'серверний deaf знято');
      }

      if (voiceFlags.length) {
        const executor = await findAuditExecutor(guild, AuditLogEvent.MemberUpdate, member.id);
        if (executor && botId() && executor.id === botId()) return;

        const fields = [
          { name: 'Учасник', value: `${member} (\`${member.user.tag}\`)`, inline: true },
          { name: 'Канал', value: channelLabel(newCh || oldCh), inline: true },
          { name: 'Зміни', value: voiceFlags.map((f) => `• ${f}`).join('\n') },
        ];
        if (executor) {
          fields.push({ name: 'Хто змінив', value: `${executor} (\`${executor.tag}\`)` });
        }

        await sendServerLog(guild, {
          category: 'member',
          title: 'Голос: статус',
          color: BRAND.soft,
          fields,
        });
      }
    } catch (error) {
      console.error('log voiceStateUpdate:', error);
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      await sendServerLog(member.guild, {
        category: 'member',
        title: 'Учасник зайшов на сервер',
        color: BRAND.success,
        fields: [
          { name: 'Користувач', value: `${member} (\`${member.user.tag}\`)`, inline: true },
          { name: 'Акаунт створено', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Учасників', value: String(member.guild.memberCount), inline: true },
        ],
        footer: `ID: ${member.id}`,
      });
    } catch (error) {
      console.error('log guildMemberAdd:', error);
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      // Вже залоговано командою /ban /kick або буде GuildBanAdd
      if (consumeAction(`leave:${member.guild.id}:${member.id}`)) return;
      if (hasAction(`ban:${member.guild.id}:${member.id}`)) return;

      const banned = await findAuditEntry(
        member.guild,
        AuditLogEvent.MemberBanAdd,
        member.id,
        3000,
      );
      if (banned) {
        markAction(`leave:${member.guild.id}:${member.id}`);
        return;
      }

      const executor = await findAuditExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
      const fields = [
        {
          name: 'Користувач',
          value: `${member.user?.tag || member.id} (\`${member.id}\`)`,
        },
      ];
      if (executor) {
        fields.push({ name: 'Модератор', value: `${executor} (\`${executor.tag}\`)` });
      }

      await sendServerLog(member.guild, {
        category: 'member',
        title: executor ? 'Учасника кікнуто' : 'Учасник вийшов',
        color: BRAND.danger,
        fields,
        footer: `ID: ${member.id}`,
      });
    } catch (error) {
      console.error('log guildMemberRemove:', error);
    }
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      if (oldMember.nickname !== newMember.nickname) {
        const executor = await findAuditExecutor(
          newMember.guild,
          AuditLogEvent.MemberUpdate,
          newMember.id,
        );
        const fields = [
          { name: 'Учасник', value: `${newMember} (\`${newMember.user.tag}\`)` },
          { name: 'Було', value: oldMember.nickname || '—', inline: true },
          { name: 'Стало', value: newMember.nickname || '—', inline: true },
        ];
        if (executor) {
          fields.push({ name: 'Хто змінив', value: `${executor} (\`${executor.tag}\`)` });
        }
        await sendServerLog(newMember.guild, {
          category: 'member',
          title: 'Нікнейм змінено',
          color: BRAND.warn,
          fields,
          footer: `ID: ${newMember.id}`,
        });
      }

      const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);
      const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);

      if (added.size || removed.size) {
        if (consumeAction(`roles:${newMember.guild.id}:${newMember.id}`)) {
          // авторола / level / self-role — без дубля
        } else {
          const executor = await findAuditExecutor(
            newMember.guild,
            AuditLogEvent.MemberRoleUpdate,
            newMember.id,
          );
          // Ролі, які видав сам бот, вже відображені в інших логах/командах
          if (!(executor && botId() && executor.id === botId())) {
            const fields = [
              { name: 'Учасник', value: `${newMember} (\`${newMember.user.tag}\`)` },
            ];
            if (added.size) {
              fields.push({
                name: 'Видано',
                value: truncate([...added.values()].map((r) => `${r}`).join(', ')),
              });
            }
            if (removed.size) {
              fields.push({
                name: 'Знято',
                value: truncate([...removed.values()].map((r) => `${r}`).join(', ')),
              });
            }
            if (executor) {
              fields.push({ name: 'Хто змінив', value: `${executor} (\`${executor.tag}\`)` });
            }
            await sendServerLog(newMember.guild, {
              category: 'role',
              title: 'Ролі учасника змінено',
              color: BRAND.soft,
              fields,
              footer: `ID: ${newMember.id}`,
            });
          }
        }
      }

      if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
        // автомод вже залогував
        if (consumeAction(`timeout:${newMember.guild.id}:${newMember.id}`)) return;

        const executor = await findAuditExecutor(
          newMember.guild,
          AuditLogEvent.MemberUpdate,
          newMember.id,
        );
        const active = Boolean(newMember.communicationDisabledUntilTimestamp);
        const fields = [
          { name: 'Учасник', value: `${newMember} (\`${newMember.user.tag}\`)` },
          {
            name: 'Timeout',
            value: active
              ? `до <t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>`
              : 'знято',
          },
        ];
        if (executor) {
          fields.push({ name: 'Модератор', value: `${executor} (\`${executor.tag}\`)` });
        }
        await sendServerLog(newMember.guild, {
          category: 'member',
          title: active ? 'Timeout видано' : 'Timeout знято',
          color: active ? BRAND.warn : BRAND.success,
          fields,
          footer: `ID: ${newMember.id}`,
        });
      }
    } catch (error) {
      console.error('log guildMemberUpdate:', error);
    }
  });

  client.on(Events.GuildBanAdd, async (ban) => {
    try {
      // softban вже написав mod-лог
      if (consumeAction(`modlog:ban:${ban.guild.id}:${ban.user.id}`)) return;

      const entry = await findAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      const executor = entry?.executor ?? null;
      const reason = entry?.reason;

      await sendServerLog(ban.guild, {
        category: 'member',
        title: 'Бан',
        color: BRAND.danger,
        fields: [
          { name: 'Користувач', value: `${ban.user} (\`${ban.user.tag}\`)` },
          { name: 'Модератор', value: executor ? `${executor} (\`${executor.tag}\`)` : 'невідомо' },
          { name: 'Причина', value: reason || 'не вказана' },
        ],
        footer: `ID: ${ban.user.id}`,
      });
    } catch (error) {
      console.error('log guildBanAdd:', error);
    }
  });

  client.on(Events.GuildBanRemove, async (ban) => {
    try {
      if (consumeAction(`modlog:unban:${ban.guild.id}:${ban.user.id}`)) return;
      if (hasAction(`modlog:ban:${ban.guild.id}:${ban.user.id}`)) return;
      if (hasAction(`ban:${ban.guild.id}:${ban.user.id}`)) return;

      const executor = await findAuditExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);

      await sendServerLog(ban.guild, {
        category: 'member',
        title: 'Розбан',
        color: BRAND.success,
        fields: [
          { name: 'Користувач', value: `${ban.user} (\`${ban.user.tag}\`)` },
          { name: 'Модератор', value: executor ? `${executor} (\`${executor.tag}\`)` : 'невідомо' },
        ],
        footer: `ID: ${ban.user.id}`,
      });
    } catch (error) {
      console.error('log guildBanRemove:', error);
    }
  });

  client.on(Events.ChannelCreate, async (channel) => {
    try {
      if (!channel.guild || isLogChannel(channel.id)) return;
      if (isTempVoiceName(channel.name)) return;
      const executor = await findAuditExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
      if (executor && botId() && executor.id === botId()) return;

      const typeName =
        channel.type === ChannelType.GuildCategory
          ? 'Категорія'
          : channel.isVoiceBased?.()
            ? 'Голосовий канал'
            : 'Текстовий канал';

      await sendServerLog(channel.guild, {
        category: 'server',
        title: `${typeName} створено`,
        color: BRAND.success,
        fields: [
          { name: 'Назва', value: channelLabel(channel) },
          { name: 'Хто створив', value: executor ? `${executor} (\`${executor.tag}\`)` : 'невідомо' },
        ],
        footer: `ID: ${channel.id}`,
      });
    } catch (error) {
      console.error('log channelCreate:', error);
    }
  });

  client.on(Events.ChannelDelete, async (channel) => {
    try {
      if (!channel.guild || isLogChannel(channel.id)) return;
      if (isTempVoiceName(channel.name)) return;
      const executor = await findAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
      if (executor && botId() && executor.id === botId()) return;

      const typeName =
        channel.type === ChannelType.GuildCategory
          ? 'Категорія'
          : channel.isVoiceBased?.()
            ? 'Голосовий канал'
            : 'Канал';

      await sendServerLog(channel.guild, {
        category: 'server',
        title: `${typeName} видалено`,
        color: BRAND.danger,
        fields: [
          { name: 'Назва', value: `**${channel.name}**` },
          { name: 'Хто видалив', value: executor ? `${executor} (\`${executor.tag}\`)` : 'невідомо' },
        ],
        footer: `ID: ${channel.id}`,
      });
    } catch (error) {
      console.error('log channelDelete:', error);
    }
  });

  client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
    try {
      if (!newChannel.guild || isLogChannel(newChannel.id)) return;
      if (isTempVoiceName(newChannel.name) || isTempVoiceName(oldChannel.name)) return;

      const changes = [];
      if (oldChannel.name !== newChannel.name) {
        changes.push(`назва: **${oldChannel.name}** → **${newChannel.name}**`);
      }
      if ('topic' in oldChannel && oldChannel.topic !== newChannel.topic) {
        changes.push(`опис: ${truncate(oldChannel.topic || '—')} → ${truncate(newChannel.topic || '—')}`);
      }
      if ('nsfw' in oldChannel && oldChannel.nsfw !== newChannel.nsfw) {
        changes.push(`NSFW: ${oldChannel.nsfw} → ${newChannel.nsfw}`);
      }
      if ('rateLimitPerUser' in oldChannel && oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
        changes.push(`slowmode: ${oldChannel.rateLimitPerUser}s → ${newChannel.rateLimitPerUser}s`);
      }
      if ('bitrate' in oldChannel && oldChannel.bitrate !== newChannel.bitrate) {
        changes.push(`bitrate: ${oldChannel.bitrate} → ${newChannel.bitrate}`);
      }
      if ('userLimit' in oldChannel && oldChannel.userLimit !== newChannel.userLimit) {
        changes.push(`ліміт: ${oldChannel.userLimit} → ${newChannel.userLimit}`);
      }
      if (oldChannel.parentId !== newChannel.parentId) {
        changes.push(
          `категорія: ${oldChannel.parent?.name || '—'} → ${newChannel.parent?.name || '—'}`,
        );
      }
      if (!changes.length) return;

      const executor = await findAuditExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
      if (executor && botId() && executor.id === botId()) return;

      await sendServerLog(newChannel.guild, {
        category: 'server',
        title: 'Канал змінено',
        color: BRAND.warn,
        fields: [
          { name: 'Канал', value: channelLabel(newChannel) },
          { name: 'Зміни', value: changes.map((c) => `• ${c}`).join('\n') },
          { name: 'Хто змінив', value: executor ? `${executor} (\`${executor.tag}\`)` : 'невідомо' },
        ],
        footer: `ID: ${newChannel.id}`,
      });
    } catch (error) {
      console.error('log channelUpdate:', error);
    }
  });

  client.on(Events.GuildRoleCreate, async (role) => {
    try {
      const executor = await findAuditExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
      await sendServerLog(role.guild, {
        category: 'role',
        title: 'Роль створено',
        color: BRAND.success,
        fields: [
          { name: 'Роль', value: `${role} (\`${role.name}\`)` },
          { name: 'Хто створив', value: executor ? `${executor} (\`${executor.tag}\`)` : 'невідомо' },
        ],
        footer: `ID: ${role.id}`,
      });
    } catch (error) {
      console.error('log roleCreate:', error);
    }
  });

  client.on(Events.GuildRoleDelete, async (role) => {
    try {
      const executor = await findAuditExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
      await sendServerLog(role.guild, {
        category: 'role',
        title: 'Роль видалено',
        color: BRAND.danger,
        fields: [
          { name: 'Роль', value: `**${role.name}**` },
          { name: 'Хто видалив', value: executor ? `${executor} (\`${executor.tag}\`)` : 'невідомо' },
        ],
        footer: `ID: ${role.id}`,
      });
    } catch (error) {
      console.error('log roleDelete:', error);
    }
  });

  client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
    try {
      const changes = [];
      if (oldRole.name !== newRole.name) changes.push(`назва: **${oldRole.name}** → **${newRole.name}**`);
      if (oldRole.hexColor !== newRole.hexColor) changes.push(`колір: ${oldRole.hexColor} → ${newRole.hexColor}`);
      if (oldRole.hoist !== newRole.hoist) changes.push(`окремо: ${oldRole.hoist} → ${newRole.hoist}`);
      if (oldRole.mentionable !== newRole.mentionable) {
        changes.push(`згадувана: ${oldRole.mentionable} → ${newRole.mentionable}`);
      }
      if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        changes.push('права ролі змінено');
      }
      if (!changes.length) return;

      const executor = await findAuditExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
      await sendServerLog(newRole.guild, {
        category: 'role',
        title: 'Роль змінено',
        color: BRAND.warn,
        fields: [
          { name: 'Роль', value: `${newRole}` },
          { name: 'Зміни', value: changes.map((c) => `• ${c}`).join('\n') },
          { name: 'Хто змінив', value: executor ? `${executor} (\`${executor.tag}\`)` : 'невідомо' },
        ],
        footer: `ID: ${newRole.id}`,
      });
    } catch (error) {
      console.error('log roleUpdate:', error);
    }
  });

  client.on(Events.InviteCreate, async (invite) => {
    try {
      if (!invite.guild) return;
      await sendServerLog(invite.guild, {
        category: 'server',
        title: 'Інвайт створено',
        color: BRAND.success,
        fields: [
          { name: 'Код', value: invite.code, inline: true },
          { name: 'Канал', value: invite.channel ? `${invite.channel}` : '—', inline: true },
          { name: 'Хто створив', value: invite.inviter ? `${invite.inviter} (\`${invite.inviter.tag}\`)` : 'невідомо' },
          { name: 'Макс. використань', value: String(invite.maxUses || '∞'), inline: true },
          { name: 'Термін', value: invite.maxAge ? `${invite.maxAge}s` : 'безстроково', inline: true },
        ],
      });
    } catch (error) {
      console.error('log inviteCreate:', error);
    }
  });

  client.on(Events.InviteDelete, async (invite) => {
    try {
      if (!invite.guild) return;
      await sendServerLog(invite.guild, {
        category: 'server',
        title: 'Інвайт видалено',
        color: BRAND.danger,
        fields: [
          { name: 'Код', value: invite.code },
          { name: 'Канал', value: invite.channel ? `${invite.channel}` : '—' },
        ],
      });
    } catch (error) {
      console.error('log inviteDelete:', error);
    }
  });

  client.on(Events.GuildEmojiCreate, async (emoji) => {
    try {
      const executor = await findAuditExecutor(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
      await sendServerLog(emoji.guild, {
        category: 'server',
        title: 'Емодзі додано',
        color: BRAND.success,
        fields: [
          { name: 'Емодзі', value: `${emoji} \`:${emoji.name}:\`` },
          { name: 'Хто додав', value: executor ? `${executor} (\`${executor.tag}\`)` : 'невідомо' },
        ],
      });
    } catch (error) {
      console.error('log emojiCreate:', error);
    }
  });

  client.on(Events.GuildEmojiDelete, async (emoji) => {
    try {
      const executor = await findAuditExecutor(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
      await sendServerLog(emoji.guild, {
        category: 'server',
        title: 'Емодзі видалено',
        color: BRAND.danger,
        fields: [
          { name: 'Ім\'я', value: `:${emoji.name}:` },
          { name: 'Хто видалив', value: executor ? `${executor} (\`${executor.tag}\`)` : 'невідомо' },
        ],
      });
    } catch (error) {
      console.error('log emojiDelete:', error);
    }
  });

  client.on(Events.ThreadCreate, async (thread) => {
    try {
      if (!thread.guild || isLogChannel(thread.parentId)) return;
      await sendServerLog(thread.guild, {
        category: 'server',
        title: 'Гілку створено',
        color: BRAND.success,
        fields: [
          { name: 'Гілка', value: `${thread}` },
          { name: 'Канал', value: thread.parent ? `${thread.parent}` : '—' },
          { name: 'Автор', value: thread.ownerId ? `<@${thread.ownerId}>` : 'невідомо' },
        ],
      });
    } catch (error) {
      console.error('log threadCreate:', error);
    }
  });

  client.on(Events.ThreadDelete, async (thread) => {
    try {
      if (!thread.guild) return;
      await sendServerLog(thread.guild, {
        category: 'server',
        title: 'Гілку видалено',
        color: BRAND.danger,
        fields: [
          { name: 'Назва', value: `**${thread.name}**` },
          { name: 'Канал', value: thread.parentId ? `<#${thread.parentId}>` : '—' },
        ],
      });
    } catch (error) {
      console.error('log threadDelete:', error);
    }
  });

  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) {
      const categories = [
        ['member', 'Member logs'],
        ['role', 'Role logs'],
        ['server', 'Server logs'],
        ['message', 'Message logs'],
      ];
      for (const [key, label] of categories) {
        const channel = await getLogChannel(guild, key);
        if (!channel) {
          console.warn(`[logs] ${guild.name}: не задано/не знайдено канал для ${label}`);
        } else {
          console.log(`[logs] ${label} → #${channel.name} (${channel.id}) @ ${guild.name}`);
        }
      }
    }
  });
}

module.exports = { registerAuditLogs };
