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
  if (!channel) return 'неизвестный канал';
  if (channel.type === ChannelType.GuildCategory) return `категория **${channel.name}**`;
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

  // Только кэш — без лога каждого сообщения (иначе спам)
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
        '(неизвестно)';
      const after = newMessage.content ?? '';
      if (before === after) return;

      cacheMessage(newMessage);

      await sendServerLog(newMessage.guild, {
        category: 'message',
        title: 'Сообщение изменено',
        color: BRAND.warn,
        fields: [
          { name: 'Автор', value: `${newMessage.author} (\`${newMessage.author.tag}\`)`, inline: true },
          { name: 'Канал', value: `${newMessage.channel}`, inline: true },
          { name: 'Было', value: truncate(before) },
          { name: 'Стало', value: truncate(after || '(пусто)') },
          { name: 'Ссылка', value: `[Перейти](${newMessage.url})` },
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

      // Точечный skip только для сообщений, которые удалил автомод/бот сам
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
        '(содержимое недоступно — сообщение не было в кэше)';
      const attachments =
        [...(message.attachments?.values?.() || [])].map((a) => a.url) ||
        cached?.attachments ||
        [];

      const fields = [
        {
          name: 'Автор',
          value: author
            ? `${author} (\`${author.tag || author.id}\`)`
            : 'неизвестно',
          inline: true,
        },
        {
          name: 'Канал',
          value: message.channel ? `${message.channel}` : `<#${message.channelId}>`,
          inline: true,
        },
        { name: 'Содержимое', value: truncate(content) },
      ];
      if (executor && executor.id !== botId()) {
        fields.push({ name: 'Удалил', value: `${executor} (\`${executor.tag}\`)`, inline: true });
      }
      if (attachments.length) {
        fields.push({ name: 'Вложения', value: truncate(attachments.join('\n')) });
      }

      await sendServerLog(guild, {
        category: 'message',
        title: 'Сообщение удалено',
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
        title: 'Массовое удаление сообщений',
        color: BRAND.danger,
        fields: [
          { name: 'Канал', value: `${channel}`, inline: true },
          { name: 'Количество', value: String(messages.size), inline: true },
          {
            name: 'Кто удалил',
            value: executor ? `${executor} (\`${executor.tag}\`)` : 'неизвестно',
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

      // Пропускаем только вход/выход из hub, перемещения логируем
      const hubJoin = hubId && !oldCh && newCh?.id === hubId;
      const hubLeave = hubId && oldCh?.id === hubId && !newCh;

      if (!hubJoin && !hubLeave) {
        if (!oldCh && newCh) {
          await sendServerLog(guild, {
            category: 'member',
            title: 'Войс: вход',
            color: BRAND.success,
            fields: [
              { name: 'Участник', value: `${member} (\`${member.user.tag}\`)`, inline: true },
              { name: 'Канал', value: channelLabel(newCh), inline: true },
            ],
          });
        } else if (oldCh && !newCh) {
          await sendServerLog(guild, {
            category: 'member',
            title: 'Войс: выход',
            color: BRAND.danger,
            fields: [
              { name: 'Участник', value: `${member} (\`${member.user.tag}\`)`, inline: true },
              { name: 'Канал', value: channelLabel(oldCh), inline: true },
            ],
          });
        } else if (oldCh && newCh && oldCh.id !== newCh.id) {
          const mover = await findAuditExecutor(guild, AuditLogEvent.MemberMove, member.id);
          const fields = [
            { name: 'Участник', value: `${member} (\`${member.user.tag}\`)`, inline: true },
            { name: 'Откуда', value: channelLabel(oldCh), inline: true },
            { name: 'Куда', value: channelLabel(newCh), inline: true },
          ];
          if (mover && mover.id !== member.id) {
            fields.push({ name: 'Переместил', value: `${mover} (\`${mover.tag}\`)` });
          }
          await sendServerLog(guild, {
            category: 'member',
            title: 'Войс: перемещение',
            color: BRAND.warn,
            fields,
          });
        }
      }

      const voiceFlags = [];
      if (oldState.serverMute !== newState.serverMute) {
        voiceFlags.push(newState.serverMute ? 'серверный мут включён' : 'серверный мут снят');
      }
      if (oldState.serverDeaf !== newState.serverDeaf) {
        voiceFlags.push(newState.serverDeaf ? 'серверный deaf включён' : 'серверный deaf снят');
      }

      if (voiceFlags.length) {
        const executor = await findAuditExecutor(guild, AuditLogEvent.MemberUpdate, member.id);
        const fields = [
          { name: 'Участник', value: `${member} (\`${member.user.tag}\`)`, inline: true },
          { name: 'Канал', value: channelLabel(newCh || oldCh), inline: true },
          { name: 'Изменения', value: voiceFlags.map((f) => `• ${f}`).join('\n') },
        ];
        if (executor) {
          fields.push({ name: 'Кто изменил', value: `${executor} (\`${executor.tag}\`)` });
        }

        await sendServerLog(guild, {
          category: 'member',
          title: 'Войс: статус',
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
        title: 'Участник зашёл на сервер',
        color: BRAND.success,
        fields: [
          { name: 'Пользователь', value: `${member} (\`${member.user.tag}\`)`, inline: true },
          { name: 'Аккаунт создан', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Участников', value: String(member.guild.memberCount), inline: true },
        ],
        footer: `ID: ${member.id}`,
      });
    } catch (error) {
      console.error('log guildMemberAdd:', error);
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      // Уже залогировано командой /ban /kick или будет GuildBanAdd
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
          name: 'Пользователь',
          value: `${member.user?.tag || member.id} (\`${member.id}\`)`,
        },
      ];
      if (executor) {
        fields.push({ name: 'Модератор', value: `${executor} (\`${executor.tag}\`)` });
      }

      await sendServerLog(member.guild, {
        category: 'member',
        title: executor ? 'Участник кикнут' : 'Участник вышел',
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
          { name: 'Участник', value: `${newMember} (\`${newMember.user.tag}\`)` },
          { name: 'Было', value: oldMember.nickname || '—', inline: true },
          { name: 'Стало', value: newMember.nickname || '—', inline: true },
        ];
        if (executor) {
          fields.push({ name: 'Кто изменил', value: `${executor} (\`${executor.tag}\`)` });
        }
        await sendServerLog(newMember.guild, {
          category: 'member',
          title: 'Никнейм изменён',
          color: BRAND.warn,
          fields,
          footer: `ID: ${newMember.id}`,
        });
      }

      const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);
      const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);

      if (added.size || removed.size) {
        const executor = await findAuditExecutor(
          newMember.guild,
          AuditLogEvent.MemberRoleUpdate,
          newMember.id,
        );
        const fields = [
          { name: 'Участник', value: `${newMember} (\`${newMember.user.tag}\`)` },
        ];
        if (added.size) {
          fields.push({ name: 'Выданы', value: truncate([...added.values()].map((r) => `${r}`).join(', ')) });
        }
        if (removed.size) {
          fields.push({ name: 'Сняты', value: truncate([...removed.values()].map((r) => `${r}`).join(', ')) });
        }
        if (executor) {
          fields.push({ name: 'Кто изменил', value: `${executor} (\`${executor.tag}\`)` });
        }
        await sendServerLog(newMember.guild, {
          category: 'role',
          title: 'Роли участника изменены',
          color: BRAND.soft,
          fields,
          footer: `ID: ${newMember.id}`,
        });
      }

      if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
        // /timeout и автомод уже залогировали
        if (consumeAction(`timeout:${newMember.guild.id}:${newMember.id}`)) return;

        const executor = await findAuditExecutor(
          newMember.guild,
          AuditLogEvent.MemberUpdate,
          newMember.id,
        );
        const active = Boolean(newMember.communicationDisabledUntilTimestamp);
        const fields = [
          { name: 'Участник', value: `${newMember} (\`${newMember.user.tag}\`)` },
          {
            name: 'Timeout',
            value: active
              ? `до <t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>`
              : 'снят',
          },
        ];
        if (executor) {
          fields.push({ name: 'Модератор', value: `${executor} (\`${executor.tag}\`)` });
        }
        await sendServerLog(newMember.guild, {
          category: 'member',
          title: active ? 'Timeout выдан' : 'Timeout снят',
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
      if (consumeAction(`ban:${ban.guild.id}:${ban.user.id}`)) return;

      const entry = await findAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      const executor = entry?.executor ?? null;
      const reason = entry?.reason;

      await sendServerLog(ban.guild, {
        category: 'member',
        title: 'Бан',
        color: BRAND.danger,
        fields: [
          { name: 'Пользователь', value: `${ban.user} (\`${ban.user.tag}\`)` },
          { name: 'Модератор', value: executor ? `${executor} (\`${executor.tag}\`)` : 'неизвестно' },
          { name: 'Причина', value: reason || 'не указана' },
        ],
        footer: `ID: ${ban.user.id}`,
      });
    } catch (error) {
      console.error('log guildBanAdd:', error);
    }
  });

  client.on(Events.GuildBanRemove, async (ban) => {
    try {
      const executor = await findAuditExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
      await sendServerLog(ban.guild, {
        category: 'member',
        title: 'Разбан',
        color: BRAND.success,
        fields: [
          { name: 'Пользователь', value: `${ban.user} (\`${ban.user.tag}\`)` },
          { name: 'Модератор', value: executor ? `${executor} (\`${executor.tag}\`)` : 'неизвестно' },
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
          ? 'Категория'
          : channel.isVoiceBased?.()
            ? 'Голосовой канал'
            : 'Текстовый канал';

      await sendServerLog(channel.guild, {
        category: 'server',
        title: `${typeName} создан`,
        color: BRAND.success,
        fields: [
          { name: 'Название', value: channelLabel(channel) },
          { name: 'Кто создал', value: executor ? `${executor} (\`${executor.tag}\`)` : 'неизвестно' },
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
          ? 'Категория'
          : channel.isVoiceBased?.()
            ? 'Голосовой канал'
            : 'Канал';

      await sendServerLog(channel.guild, {
        category: 'server',
        title: `${typeName} удалён`,
        color: BRAND.danger,
        fields: [
          { name: 'Название', value: `**${channel.name}**` },
          { name: 'Кто удалил', value: executor ? `${executor} (\`${executor.tag}\`)` : 'неизвестно' },
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
        changes.push(`имя: **${oldChannel.name}** → **${newChannel.name}**`);
      }
      if ('topic' in oldChannel && oldChannel.topic !== newChannel.topic) {
        changes.push(`описание: ${truncate(oldChannel.topic || '—')} → ${truncate(newChannel.topic || '—')}`);
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
        changes.push(`лимит: ${oldChannel.userLimit} → ${newChannel.userLimit}`);
      }
      if (oldChannel.parentId !== newChannel.parentId) {
        changes.push(
          `категория: ${oldChannel.parent?.name || '—'} → ${newChannel.parent?.name || '—'}`,
        );
      }
      if (!changes.length) return;

      const executor = await findAuditExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
      if (executor && botId() && executor.id === botId()) return;

      await sendServerLog(newChannel.guild, {
        category: 'server',
        title: 'Канал изменён',
        color: BRAND.warn,
        fields: [
          { name: 'Канал', value: channelLabel(newChannel) },
          { name: 'Изменения', value: changes.map((c) => `• ${c}`).join('\n') },
          { name: 'Кто изменил', value: executor ? `${executor} (\`${executor.tag}\`)` : 'неизвестно' },
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
        title: 'Роль создана',
        color: BRAND.success,
        fields: [
          { name: 'Роль', value: `${role} (\`${role.name}\`)` },
          { name: 'Кто создал', value: executor ? `${executor} (\`${executor.tag}\`)` : 'неизвестно' },
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
        title: 'Роль удалена',
        color: BRAND.danger,
        fields: [
          { name: 'Роль', value: `**${role.name}**` },
          { name: 'Кто удалил', value: executor ? `${executor} (\`${executor.tag}\`)` : 'неизвестно' },
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
      if (oldRole.name !== newRole.name) changes.push(`имя: **${oldRole.name}** → **${newRole.name}**`);
      if (oldRole.hexColor !== newRole.hexColor) changes.push(`цвет: ${oldRole.hexColor} → ${newRole.hexColor}`);
      if (oldRole.hoist !== newRole.hoist) changes.push(`отдельно: ${oldRole.hoist} → ${newRole.hoist}`);
      if (oldRole.mentionable !== newRole.mentionable) {
        changes.push(`упоминаемая: ${oldRole.mentionable} → ${newRole.mentionable}`);
      }
      if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        changes.push('права роли изменены');
      }
      if (!changes.length) return;

      const executor = await findAuditExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
      await sendServerLog(newRole.guild, {
        category: 'role',
        title: 'Роль изменена',
        color: BRAND.warn,
        fields: [
          { name: 'Роль', value: `${newRole}` },
          { name: 'Изменения', value: changes.map((c) => `• ${c}`).join('\n') },
          { name: 'Кто изменил', value: executor ? `${executor} (\`${executor.tag}\`)` : 'неизвестно' },
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
        title: 'Инвайт создан',
        color: BRAND.success,
        fields: [
          { name: 'Код', value: invite.code, inline: true },
          { name: 'Канал', value: invite.channel ? `${invite.channel}` : '—', inline: true },
          { name: 'Кто создал', value: invite.inviter ? `${invite.inviter} (\`${invite.inviter.tag}\`)` : 'неизвестно' },
          { name: 'Макс. использований', value: String(invite.maxUses || '∞'), inline: true },
          { name: 'Срок', value: invite.maxAge ? `${invite.maxAge}s` : 'бессрочно', inline: true },
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
        title: 'Инвайт удалён',
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
        title: 'Эмодзи добавлен',
        color: BRAND.success,
        fields: [
          { name: 'Эмодзи', value: `${emoji} \`:${emoji.name}:\`` },
          { name: 'Кто добавил', value: executor ? `${executor} (\`${executor.tag}\`)` : 'неизвестно' },
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
        title: 'Эмодзи удалён',
        color: BRAND.danger,
        fields: [
          { name: 'Имя', value: `:${emoji.name}:` },
          { name: 'Кто удалил', value: executor ? `${executor} (\`${executor.tag}\`)` : 'неизвестно' },
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
        title: 'Ветка создана',
        color: BRAND.success,
        fields: [
          { name: 'Ветка', value: `${thread}` },
          { name: 'Канал', value: thread.parent ? `${thread.parent}` : '—' },
          { name: 'Автор', value: thread.ownerId ? `<@${thread.ownerId}>` : 'неизвестно' },
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
        title: 'Ветка удалена',
        color: BRAND.danger,
        fields: [
          { name: 'Название', value: `**${thread.name}**` },
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
          console.warn(`[logs] ${guild.name}: не задан/не найден канал для ${label}`);
        } else {
          console.log(`[logs] ${label} → #${channel.name} (${channel.id}) @ ${guild.name}`);
        }
      }
    }
  });
}

module.exports = { registerAuditLogs };
