const {
  Events,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = require('discord.js');
const { tempVoiceHubId, tempVoiceCategoryId } = require('../utils/config');
const { sendServerLog, markAction } = require('../utils/logger');
const { BRAND, infoEmbed, errorReply, successEmbed } = require('../utils/style');
const { readJson, writeJson } = require('../utils/store');
const { isAllowedGuild } = require('../utils/security');

const FILE = 'temp-voices.json';

function loadStore() {
  const raw = readJson(FILE, { channels: {} });
  if (Array.isArray(raw.channels)) {
    const channels = {};
    for (const id of raw.channels) channels[id] = { ownerId: null, locked: false };
    return { channels };
  }
  if (!raw.channels || typeof raw.channels !== 'object') return { channels: {} };
  return raw;
}

function saveStore(store) {
  writeJson(FILE, store);
}

function isTempName(name) {
  return typeof name === 'string' && name.startsWith('⏳');
}

function controlRow(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tv:rename:${channelId}`)
      .setLabel('имя')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tv:limit:${channelId}`)
      .setLabel('лимит')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tv:lock:${channelId}`)
      .setLabel('lock')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tv:kick:${channelId}`)
      .setLabel('kick')
      .setStyle(ButtonStyle.Danger),
  );
}

async function sendOwnerPanel(channel, owner) {
  const embed = infoEmbed({
    title: 'temp voice',
    description: [
      `${channel}`,
      '',
      'управление комнатой · только владелец',
      '`имя` · `лимит` · `lock` · `kick`',
    ].join('\n'),
    color: BRAND.soft,
  });

  const payload = { embeds: [embed], components: [controlRow(channel.id)] };

  try {
    await channel.send(payload);
  } catch {
    await owner.send(payload).catch(() => null);
  }
}

async function deleteIfEmpty(channel, leavingUserId) {
  if (!channel || !channel.isVoiceBased?.()) return false;
  const remaining = channel.members.filter((m) => m.id !== leavingUserId).size;
  if (remaining > 0) return false;
  await channel.delete('Temp voice empty').catch(() => null);
  return true;
}

function isOwnerOf(store, channelId, userId) {
  const meta = store.channels[channelId];
  return Boolean(meta && meta.ownerId === userId);
}

async function assertTempOwner(interaction, channelId) {
  const store = loadStore();
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isVoiceBased?.()) {
    return { ok: false, reason: 'комната не найдена' };
  }
  if (!store.channels[channelId] && !isTempName(channel.name)) {
    return { ok: false, reason: 'это не temp voice' };
  }
  const meta = store.channels[channelId];
  const ownerId = meta?.ownerId;
  const isMod = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
  if (ownerId && ownerId !== interaction.user.id && !isMod) {
    return { ok: false, reason: 'только владелец комнаты' };
  }
  return { ok: true, channel, store, meta };
}

async function handleTempVoiceInteraction(interaction) {
  if (interaction.isButton() && interaction.customId.startsWith('tv:')) {
    const [, action, channelId] = interaction.customId.split(':');
    const check = await assertTempOwner(interaction, channelId);
    if (!check.ok) return interaction.reply(errorReply(check.reason));

    if (action === 'rename') {
      const modal = new ModalBuilder()
        .setCustomId(`tvmodal:rename:${channelId}`)
        .setTitle('имя комнаты');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('новое имя')
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(90)
            .setRequired(true),
        ),
      );
      return interaction.showModal(modal);
    }

    if (action === 'limit') {
      const modal = new ModalBuilder()
        .setCustomId(`tvmodal:limit:${channelId}`)
        .setTitle('лимит участников');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('limit')
            .setLabel('0 = без лимита · макс 99')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
      return interaction.showModal(modal);
    }

    if (action === 'lock') {
      const locked = Boolean(check.meta?.locked);
      const everyone = interaction.guild.roles.everyone;
      if (!locked) {
        await check.channel.permissionOverwrites.edit(everyone, { Connect: false });
        check.store.channels[channelId] = {
          ...(check.meta || {}),
          ownerId: check.meta?.ownerId || interaction.user.id,
          locked: true,
        };
        saveStore(check.store);
        return interaction.reply({
          embeds: [successEmbed({ title: 'temp voice', description: `${check.channel} · locked` })],
          ephemeral: true,
        });
      }
      await check.channel.permissionOverwrites.edit(everyone, { Connect: true });
      check.store.channels[channelId] = {
        ...(check.meta || {}),
        ownerId: check.meta?.ownerId || interaction.user.id,
        locked: false,
      };
      saveStore(check.store);
      return interaction.reply({
        embeds: [successEmbed({ title: 'temp voice', description: `${check.channel} · unlocked` })],
        ephemeral: true,
      });
    }

    if (action === 'kick') {
      const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`tvselect:kick:${channelId}`)
          .setPlaceholder('кого выгнать')
          .setMinValues(1)
          .setMaxValues(1),
      );
      return interaction.reply({
        embeds: [infoEmbed({ title: 'temp voice · kick', description: 'выбери участника' })],
        components: [row],
        ephemeral: true,
      });
    }
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('tvmodal:')) {
    const [, action, channelId] = interaction.customId.split(':');
    const check = await assertTempOwner(interaction, channelId);
    if (!check.ok) return interaction.reply(errorReply(check.reason));

    if (action === 'rename') {
      const name = interaction.fields.getTextInputValue('name').trim();
      await check.channel.setName(`⏳ ${name}`.slice(0, 100));
      return interaction.reply({
        embeds: [successEmbed({ title: 'temp voice', description: `имя · **${check.channel.name}**` })],
        ephemeral: true,
      });
    }

    if (action === 'limit') {
      const raw = interaction.fields.getTextInputValue('limit').trim();
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 99) {
        return interaction.reply(errorReply('лимит: целое 0–99'));
      }
      await check.channel.setUserLimit(n);
      return interaction.reply({
        embeds: [
          successEmbed({
            title: 'temp voice',
            description: n ? `лимит · **${n}**` : 'лимит снят',
          }),
        ],
        ephemeral: true,
      });
    }
  }

  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('tvselect:kick:')) {
    const channelId = interaction.customId.slice('tvselect:kick:'.length);
    const check = await assertTempOwner(interaction, channelId);
    if (!check.ok) return interaction.reply(errorReply(check.reason));

    const targetId = interaction.values[0];
    if (targetId === interaction.user.id) {
      return interaction.reply(errorReply('нельзя кикнуть себя'));
    }
    const target = check.channel.members.get(targetId);
    if (!target) {
      return interaction.reply(errorReply('участник не в этой комнате'));
    }
    await target.voice.disconnect('Temp voice kick').catch(() => null);
    return interaction.reply({
      embeds: [successEmbed({ title: 'temp voice', description: `${target} выгнан` })],
      ephemeral: true,
    });
  }

  return false;
}

function registerTempVoice(client) {
  let store = loadStore();

  const remember = (id, ownerId) => {
    store.channels[id] = {
      ownerId: ownerId || store.channels[id]?.ownerId || null,
      locked: Boolean(store.channels[id]?.locked),
    };
    saveStore(store);
  };

  const forget = (id) => {
    if (!store.channels[id]) return;
    delete store.channels[id];
    saveStore(store);
  };

  client.once(Events.ClientReady, async () => {
    store = loadStore();
    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased?.()) continue;
        if (!store.channels[channel.id] && !isTempName(channel.name)) continue;
        if (channel.members.size === 0) {
          await channel.delete('Temp voice cleanup on startup').catch(() => null);
          forget(channel.id);
        } else {
          remember(channel.id, store.channels[channel.id]?.ownerId);
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
          console.warn('tempVoice create retry without overwrites:', error.message);
          channel = await guild.channels.create({
            name: `⏳ ${member.displayName}`.slice(0, 100),
            type: ChannelType.GuildVoice,
            parent: parentId || undefined,
            reason: `Temp voice for ${member.user.tag}`,
          });
        }

        remember(channel.id, member.id);

        try {
          markAction(`voicemove:${guild.id}:${member.id}`);
          await member.voice.setChannel(channel);
        } catch (err) {
          console.error('tempVoice move failed:', err.message);
          await sendServerLog(guild, {
            category: 'server',
            title: 'Temp voice: не переместил',
            color: BRAND.warn,
            description: `Комната ${channel} создана. Нужно право **Перемещать участников**.`,
          });
          setTimeout(async () => {
            const fresh = await guild.channels.fetch(channel.id).catch(() => null);
            if (fresh && fresh.members.size === 0) {
              await fresh.delete('Temp voice unused').catch(() => null);
              forget(channel.id);
            }
          }, 3000);
        }

        await sendOwnerPanel(channel, member.user);
      }

      const leftId = oldState.channelId;
      if (leftId && leftId !== hubId) {
        const leftChannel = oldState.channel;
        const tracked = Boolean(store.channels[leftId]) || isTempName(leftChannel?.name);
        if (tracked && leftChannel) {
          const deleted = await deleteIfEmpty(leftChannel, member.id);
          if (deleted) forget(leftId);
        }
      }

      if (leftId && store.channels[leftId] && !oldState.channel) {
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

module.exports = {
  registerTempVoice,
  handleTempVoiceInteraction,
  loadStore,
  saveStore,
  isOwnerOf,
  controlRow,
  sendOwnerPanel,
};
