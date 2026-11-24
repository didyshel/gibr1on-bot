const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { readJson, writeJson } = require('../utils/store');
const { applyReviewChannelId, applyAcceptRoleId } = require('../utils/config');
const { isOwner, isDangerousRole } = require('../utils/security');
const {
  brandEmbed,
  infoEmbed,
  successEmbed,
  errorEmbed,
  errorReply,
  BRAND,
} = require('../utils/style');

const FILE = 'applications.json';

function loadStore() {
  const raw = readJson(FILE, {});
  return raw && typeof raw === 'object' ? raw : {};
}

function saveStore(store) {
  writeJson(FILE, store);
}

function guildSettings(store, guildId) {
  if (!store[guildId] || typeof store[guildId] !== 'object') {
    store[guildId] = { pending: {} };
  }
  if (!store[guildId].pending || typeof store[guildId].pending !== 'object') {
    store[guildId].pending = {};
  }
  return store[guildId];
}

function getReviewChannelId(guildId, settings) {
  return settings.reviewChannelId || applyReviewChannelId() || null;
}

function getAcceptRoleId(guildId, settings) {
  return settings.acceptRoleId || applyAcceptRoleId() || null;
}

function canReview(interaction) {
  if (isOwner(interaction.user.id)) return true;
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild),
  );
}

function panelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('apply:open')
      .setLabel('Подати заявку')
      .setStyle(ButtonStyle.Danger),
  );
}

/** Повідомлення панелі: червона кнопка заявки */
function panelPayload() {
  return { components: [panelRow()] };
}

function buildApplyModal() {
  const modal = new ModalBuilder()
    .setCustomId('apply:modal')
    .setTitle('заявка на вступ');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('nick')
        .setLabel('Нік у грі')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(64)
        .setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Як звати')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(64)
        .setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('age')
        .setLabel('Вік OOC')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(8)
        .setRequired(true)
        .setPlaceholder('справжній вік, наприклад 18'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('time')
        .setLabel('Час на проєкті')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(100)
        .setRequired(true)
        .setPlaceholder('наприклад: 3 місяці'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('experience')
        .setLabel('Досвід в інших сім’ях')
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(1)
        .setMaxLength(800)
        .setRequired(true),
    ),
  );

  return modal;
}

function reviewButtons(userId, appId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`apply:accept:${userId}:${appId}`)
      .setLabel('прийняти')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`apply:reject:${userId}:${appId}`)
      .setLabel('відхилити')
      .setStyle(ButtonStyle.Danger),
  );
}

function applicationEmbed(user, answers, status = 'очікує') {
  const color =
    status === 'прийнята'
      ? BRAND.success
      : status === 'відхилена'
        ? BRAND.danger
        : BRAND.color;

  const tag = user?.tag || user?.username || user?.id || 'unknown';
  const embed = brandEmbed({
    title: `заявка · ${status}`,
    color,
    author: {
      name: String(tag),
      iconURL: typeof user?.displayAvatarURL === 'function' ? user.displayAvatarURL({ size: 128 }) : undefined,
    },
    fields: [
      {
        name: 'Discord',
        value: user?.id ? `<@${user.id}> (\`${user.id}\`)` : '—',
        inline: false,
      },
      { name: 'Нік у грі', value: answers.nick, inline: true },
      { name: 'Як звати', value: answers.name, inline: true },
      { name: 'Вік OOC', value: answers.age, inline: true },
      { name: 'Час на проєкті', value: answers.time, inline: false },
      { name: 'Досвід в інших сім’ях', value: answers.experience, inline: false },
    ],
  });
  return embed;
}

function parseReviewId(customId) {
  // apply:accept:userId:appId | apply:reject:userId:appId
  const parts = customId.split(':');
  if (parts.length !== 4) return null;
  const [, action, userId, appId] = parts;
  if (!['accept', 'reject'].includes(action)) return null;
  if (!/^\d{17,20}$/.test(userId)) return null;
  if (!/^\d+$/.test(appId)) return null;
  return { action, userId, appId };
}

async function handleApplicationsInteraction(interaction) {
  try {
    await handleApplicationsInteractionInner(interaction);
  } catch (error) {
    console.error('[apply] error:', error);
    const payload = errorReply(error?.message || 'помилка заявки');
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else if (interaction.isModalSubmit?.() || interaction.isButton?.()) {
        await interaction.reply(payload);
      }
    } catch (replyErr) {
      console.error('[apply] reply fail:', replyErr.message);
    }
  }
}

async function handleApplicationsInteractionInner(interaction) {
  const id = interaction.customId || '';

  if (interaction.isButton() && id === 'apply:open') {
    const store = loadStore();
    const settings = guildSettings(store, interaction.guildId);
    const pending = settings.pending[interaction.user.id];
    if (pending) {
      return interaction.reply({
        embeds: [
          infoEmbed({
            title: 'заявка',
            description: 'у тебе вже є активна заявка · дочекайся рішення',
            color: BRAND.soft,
          }),
        ],
        ephemeral: true,
      });
    }
    return interaction.showModal(buildApplyModal());
  }

  if (interaction.isModalSubmit() && id === 'apply:modal') {
    const answers = {
      nick: interaction.fields.getTextInputValue('nick').trim(),
      name: interaction.fields.getTextInputValue('name').trim(),
      age: interaction.fields.getTextInputValue('age').trim(),
      time: interaction.fields.getTextInputValue('time').trim(),
      experience: interaction.fields.getTextInputValue('experience').trim(),
    };

    if (!answers.nick || !answers.name || !answers.age || !answers.time || !answers.experience) {
      return interaction.reply(errorReply('заповни всі поля'));
    }

    const ageNum = Number(answers.age.replace(/[^\d]/g, ''));
    if (!Number.isFinite(ageNum) || ageNum < 10 || ageNum > 99) {
      return interaction.reply(errorReply('вік OOC: вкажи число від 10 до 99'));
    }

    const store = loadStore();
    const settings = guildSettings(store, interaction.guildId);

    if (settings.pending[interaction.user.id]) {
      return interaction.reply({
        embeds: [
          infoEmbed({
            title: 'заявка',
            description: 'у тебе вже є активна заявка · дочекайся рішення',
            color: BRAND.soft,
          }),
        ],
        ephemeral: true,
      });
    }

    const reviewChannelId = getReviewChannelId(interaction.guildId, settings);
    if (!reviewChannelId) {
      return interaction.reply(
        errorReply('канал розгляду не налаштовано · `/apply setup`'),
      );
    }

    const channel =
      interaction.guild.channels.cache.get(reviewChannelId) ||
      (await interaction.guild.channels.fetch(reviewChannelId).catch(() => null));

    if (!channel?.isTextBased?.()) {
      return interaction.reply(errorReply('канал розгляду недоступний'));
    }

    const me = interaction.guild.members.me;
    if (me) {
      const perms = channel.permissionsFor(me);
      if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply(
          errorReply(
            `боту закритий канал розгляду ${channel} · видай **Перегляд каналу** і **Надсилання повідомлень**`,
          ),
        );
      }
    }

    const appId = String(Date.now());
    const embed = applicationEmbed(interaction.user, answers, 'очікує');
    let message;
    try {
      message = await channel.send({
        embeds: [embed],
        components: [reviewButtons(interaction.user.id, appId)],
      });
    } catch (sendErr) {
      console.error('[apply] send fail:', sendErr);
      const code = sendErr?.code;
      let hint = 'не вдалося надіслати заявку в канал розгляду';
      if (code === 50001 || code === 50013) {
        hint =
          'боту не вистачає прав у каналі розгляду · потрібні **Перегляд каналу** + **Надсилання повідомлень** + **Вбудовування посилань**';
      } else if (sendErr?.message) {
        hint = `не вдалося надіслати заявку · ${String(sendErr.message).slice(0, 120)}`;
      }
      return interaction.reply(errorReply(hint));
    }

    settings.pending[interaction.user.id] = {
      id: appId,
      messageId: message.id,
      channelId: channel.id,
      answers,
      at: Date.now(),
    };
    saveStore(store);

    return interaction.reply({
      embeds: [
        successEmbed({
          title: 'заявка',
          description: 'заявку надіслано · чекай рішення керівництва',
        }),
      ],
      ephemeral: true,
    });
  }

  if (interaction.isButton() && (id.startsWith('apply:accept:') || id.startsWith('apply:reject:'))) {
    if (!canReview(interaction)) {
      return interaction.reply(errorReply('потрібні права Manage Roles / Manage Guild'));
    }

    const parsed = parseReviewId(id);
    if (!parsed) {
      return interaction.reply(errorReply('некоректна заявка'));
    }

    const store = loadStore();
    const settings = guildSettings(store, interaction.guildId);
    const pending = settings.pending[parsed.userId];

    if (!pending || pending.id !== parsed.appId) {
      try {
        await interaction.update({
          components: [],
          embeds: [
            errorEmbed({
              title: 'заявка · неактуальна',
              description: 'ця заявка вже оброблена або застаріла',
            }),
          ],
        });
      } catch {
        await interaction.reply(errorReply('заявка вже оброблена')).catch(() => null);
      }
      return;
    }

    const answers = pending.answers;
    const member = await interaction.guild.members.fetch(parsed.userId).catch(() => null);
    const user = member?.user || (await interaction.client.users.fetch(parsed.userId).catch(() => null));

    if (parsed.action === 'accept') {
      const roleId = getAcceptRoleId(interaction.guildId, settings);
      if (roleId && member) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role && !isDangerousRole(role)) {
          const me = interaction.guild.members.me;
          if (!me || role.position < me.roles.highest.position) {
            await member.roles.add(roleId).catch(() => null);
          }
        }
      }

      delete settings.pending[parsed.userId];
      saveStore(store);

      const embed = applicationEmbed(user || { id: parsed.userId, tag: parsed.userId }, answers, 'прийнята');
      embed.addFields({
        name: 'рішення',
        value: `прийняв ${interaction.user}`,
        inline: false,
      });

      await interaction.update({ embeds: [embed], components: [] });

      if (member) {
        await member
          .send({
            embeds: [
              successEmbed({
                title: 'заявку прийнято',
                description: `тебе прийняли на сервері **${interaction.guild.name}**`,
              }),
            ],
          })
          .catch(() => null);
      }
      return;
    }

    delete settings.pending[parsed.userId];
    saveStore(store);

    const embed = applicationEmbed(user || { id: parsed.userId, tag: parsed.userId }, answers, 'відхилена');
    embed.addFields({
      name: 'рішення',
      value: `відхилив ${interaction.user}`,
      inline: false,
    });

    await interaction.update({ embeds: [embed], components: [] });

    if (member) {
      await member
        .send({
          embeds: [
            errorEmbed({
              title: 'заявку відхилено',
              description: `заявку на **${interaction.guild.name}** відхилили`,
            }),
          ],
        })
        .catch(() => null);
    }
  }
}

module.exports = {
  panelRow,
  panelPayload,
  handleApplicationsInteraction,
  guildSettings,
  loadStore,
  saveStore,
};
