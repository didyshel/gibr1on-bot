const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const {
  loadStore,
  saveStore,
  controlRow,
  sendOwnerPanel,
} = require('../features/tempVoice');
const { successEmbed, errorReply, infoEmbed } = require('../utils/style');

function resolveTempChannel(interaction) {
  const store = loadStore();
  const opted = interaction.options.getChannel('channel');
  const voice = interaction.member?.voice?.channel;
  const channel = opted || voice;
  if (!channel?.isVoiceBased?.()) return { error: 'зайди в temp voice або вкажи канал' };
  if (!store.channels[channel.id] && !String(channel.name || '').startsWith('⏳')) {
    return { error: 'це не temp voice' };
  }
  const meta = store.channels[channel.id];
  const isMod = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
  if (meta?.ownerId && meta.ownerId !== interaction.user.id && !isMod) {
    return { error: 'лише власник кімнати' };
  }
  return { channel, store, meta };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vc')
    .setDescription('Керування своєю temp voice кімнатою')
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('Панель кнопок керування')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Кімната')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('rename')
        .setDescription('Перейменувати кімнату')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Нова назва').setRequired(true).setMaxLength(90),
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Кімната')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('limit')
        .setDescription('Ліміт учасників (0 = без ліміту)')
        .addIntegerOption((opt) =>
          opt.setName('count').setDescription('0–99').setRequired(true).setMinValue(0).setMaxValue(99),
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Кімната')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('lock')
        .setDescription('Закрити/відкрити кімнату')
        .addBooleanOption((opt) =>
          opt.setName('state').setDescription('true = lock').setRequired(false),
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Кімната')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('kick')
        .setDescription('Вигнати з кімнати')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Кого').setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Кімната')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const resolved = resolveTempChannel(interaction);
    if (resolved.error) return interaction.reply(errorReply(resolved.error));

    const { channel, store, meta } = resolved;

    if (sub === 'panel') {
      await sendOwnerPanel(channel, interaction.user);
      return interaction.reply({
        embeds: [
          infoEmbed({
            title: 'temp voice',
            description: `панель · ${channel}`,
          }),
        ],
        components: [controlRow(channel.id)],
        ephemeral: true,
      });
    }

    if (sub === 'rename') {
      const name = interaction.options.getString('name', true).trim();
      await channel.setName(`⏳ ${name}`.slice(0, 100));
      return interaction.reply({
        embeds: [successEmbed({ title: 'vc', description: `назва · **${channel.name}**` })],
        ephemeral: true,
      });
    }

    if (sub === 'limit') {
      const count = interaction.options.getInteger('count', true);
      await channel.setUserLimit(count);
      return interaction.reply({
        embeds: [
          successEmbed({
            title: 'vc',
            description: count ? `ліміт · **${count}**` : 'ліміт знято',
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'lock') {
      const want = interaction.options.getBoolean('state');
      const locked = want == null ? !Boolean(meta?.locked) : want;
      const everyone = interaction.guild.roles.everyone;
      await channel.permissionOverwrites.edit(everyone, { Connect: locked ? false : true });
      store.channels[channel.id] = {
        ...(meta || {}),
        ownerId: meta?.ownerId || interaction.user.id,
        locked,
      };
      saveStore(store);
      return interaction.reply({
        embeds: [
          successEmbed({
            title: 'vc',
            description: locked ? `${channel} · locked` : `${channel} · unlocked`,
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'kick') {
      const user = interaction.options.getUser('user', true);
      if (user.id === interaction.user.id) {
        return interaction.reply(errorReply('не можна кікнути себе'));
      }
      const target = channel.members.get(user.id);
      if (!target) return interaction.reply(errorReply('учасника немає в цій кімнаті'));
      await target.voice.disconnect('Temp voice kick').catch(() => null);
      return interaction.reply({
        embeds: [successEmbed({ title: 'vc', description: `${user} вигнано` })],
        ephemeral: true,
      });
    }
  },
};
