const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  getLevelRoles,
  setLevelRole,
  setLevelRolesBulk,
  removeLevelRole,
} = require('../features/levels');
const { ACTIVITY_ROLES } = require('../utils/activityRoles');
const { successEmbed, infoEmbed, errorReply } = require('../utils/style');
const { isDangerousRole } = require('../utils/security');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('levelrole')
    .setDescription('Роли за уровни / активность')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Создать русские роли активности и привязать к уровням'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Привязать роль к уровню')
        .addIntegerOption((opt) =>
          opt
            .setName('level')
            .setDescription('Уровень')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(500),
        )
        .addRoleOption((opt) =>
          opt.setName('role').setDescription('Роль').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Убрать роль за уровень')
        .addIntegerOption((opt) =>
          opt.setName('level').setDescription('Уровень').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Список ролей за уровни'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const me = interaction.guild.members.me;
      if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply(errorReply('мне нужно право Manage Roles'));
      }

      await interaction.deferReply({ ephemeral: true });

      const bound = {};
      const lines = [];

      for (const def of ACTIVITY_ROLES) {
        let role = interaction.guild.roles.cache.find(
          (r) => r.name === def.name && !r.managed,
        );

        if (!role) {
          role = await interaction.guild.roles
            .create({
              name: def.name,
              color: def.color,
              hoist: def.hoist,
              mentionable: false,
              reason: 'levelrole setup · активность',
            })
            .catch((err) => {
              console.error('levelrole create:', err);
              return null;
            });
        } else {
          await role
            .edit({
              color: def.color,
              hoist: def.hoist,
              reason: 'levelrole setup · обновить цвет',
            })
            .catch(() => null);
        }

        if (!role) {
          lines.push(`lvl **${def.level}** · \`${def.name}\` — ошибка создания`);
          continue;
        }

        if (role.position >= me.roles.highest.position) {
          lines.push(`lvl **${def.level}** · ${role} — роль выше бота, привязка пропущена`);
          continue;
        }

        bound[String(def.level)] = role.id;
        lines.push(`lvl **${def.level}** · ${role}`);
      }

      if (Object.keys(bound).length) {
        setLevelRolesBulk(interaction.guildId, bound);
      }

      return interaction.editReply({
        embeds: [
          successEmbed({
            title: 'levelrole · setup',
            description: [
              'роли активности готовы',
              '',
              ...lines,
              '',
              'xp: сообщения + войс (не соло, не AFK)',
              '`/level` · `/leaderboard`',
            ].join('\n'),
          }),
        ],
      });
    }

    if (sub === 'list') {
      const roles = getLevelRoles(interaction.guildId);
      const entries = Object.entries(roles).sort((a, b) => Number(a[0]) - Number(b[0]));
      if (!entries.length) {
        return interaction.reply({
          embeds: [
            infoEmbed({
              title: 'levelrole',
              description: 'ролей нет · `/levelrole setup`',
            }),
          ],
          ephemeral: true,
        });
      }
      return interaction.reply({
        embeds: [
          infoEmbed({
            title: 'levelrole',
            description: entries.map(([lvl, id]) => `lvl **${lvl}** · <@&${id}>`).join('\n'),
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'remove') {
      const level = interaction.options.getInteger('level', true);
      removeLevelRole(interaction.guildId, level);
      return interaction.reply({
        embeds: [successEmbed({ title: 'levelrole', description: `lvl ${level} снят` })],
        ephemeral: true,
      });
    }

    const level = interaction.options.getInteger('level', true);
    const role = interaction.options.getRole('role', true);
    if (isDangerousRole(role)) {
      return interaction.reply(errorReply('роль слишком мощная'));
    }
    const me = interaction.guild.members.me;
    if (me && role.position >= me.roles.highest.position) {
      return interaction.reply(errorReply('роль бота ниже этой роли'));
    }

    setLevelRole(interaction.guildId, level, role.id);
    return interaction.reply({
      embeds: [
        successEmbed({
          title: 'levelrole',
          description: `lvl **${level}** · ${role}`,
        }),
      ],
      ephemeral: true,
    });
  },
};
