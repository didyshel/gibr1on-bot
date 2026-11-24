const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { successEmbed, errorReply, infoEmbed } = require('../utils/style');
const { afkChannelId, afkMinutes, afkDetect } = require('../utils/config');
const { markAction } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Голосові утиліти')
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .addSubcommand((sub) =>
      sub
        .setName('moveall')
        .setDescription('Перемістити всіх з каналу в інший')
        .addChannelOption((opt) =>
          opt
            .setName('to')
            .setDescription('Куди')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName('from')
            .setDescription('Звідки (за замовчуванням — твій канал)')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('muteall')
        .setDescription('Замутити / розмутити всіх у каналі')
        .addBooleanOption((opt) =>
          opt.setName('mute').setDescription('true = mute').setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Канал (за замовчуванням — твій)')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('afkinfo').setDescription('Статус AFK-детекту'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'afkinfo') {
      return interaction.reply({
        embeds: [
          infoEmbed({
            title: 'afk detect',
            fields: [
              { name: 'увімкнено', value: afkDetect() ? 'так' : 'ні', inline: true },
              { name: 'хвилин', value: `\`${afkMinutes()}\``, inline: true },
              {
                name: 'канал',
                value: afkChannelId() ? `<#${afkChannelId()}>` : 'не задано · `AFK_CHANNEL_ID`',
              },
            ],
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'moveall') {
      const from =
        interaction.options.getChannel('from') || interaction.member?.voice?.channel;
      const to = interaction.options.getChannel('to', true);
      if (!from?.isVoiceBased?.()) {
        return interaction.reply(errorReply('вкажи from або зайди у войс'));
      }
      if (from.id === to.id) {
        return interaction.reply(errorReply('канали однакові'));
      }

      let moved = 0;
      for (const member of from.members.values()) {
        if (member.user.bot) continue;
        markAction(`voicemove:${interaction.guild.id}:${member.id}`);
        await member.voice.setChannel(to).catch(() => null);
        moved += 1;
      }

      return interaction.reply({
        embeds: [
          successEmbed({
            title: 'moveall',
            description: `переміщено **${moved}** · ${from} → ${to}`,
          }),
        ],
      });
    }

    if (sub === 'muteall') {
      const mute = interaction.options.getBoolean('mute', true);
      const channel =
        interaction.options.getChannel('channel') || interaction.member?.voice?.channel;
      if (!channel?.isVoiceBased?.()) {
        return interaction.reply(errorReply('вкажи channel або зайди у войс'));
      }

      let n = 0;
      for (const member of channel.members.values()) {
        if (member.user.bot) continue;
        if (member.id === interaction.user.id) continue;
        await member.voice.setMute(mute, 'voice muteall').catch(() => null);
        n += 1;
      }

      return interaction.reply({
        embeds: [
          successEmbed({
            title: 'muteall',
            description: `${mute ? 'mute' : 'unmute'} · **${n}** у ${channel}`,
          }),
        ],
      });
    }
  },
};
