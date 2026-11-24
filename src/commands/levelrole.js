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
    .setDescription('Ролі за рівні / активність')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Створити українські ролі активності та прив\'язати до рівнів'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Прив\'язати роль до рівня')
        .addIntegerOption((opt) =>
          opt
            .setName('level')
            .setDescription('Рівень')
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
        .setDescription('Прибрати роль за рівень')
        .addIntegerOption((opt) =>
          opt.setName('level').setDescription('Рівень').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Список ролей за рівні'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const me = interaction.guild.members.me;
      if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply(errorReply('мені потрібне право Manage Roles'));
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
              reason: 'levelrole setup · активність',
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
              reason: 'levelrole setup · оновити колір',
            })
            .catch(() => null);
        }

        if (!role) {
          lines.push(`lvl **${def.level}** · \`${def.name}\` — помилка створення`);
          continue;
        }

        if (role.position >= me.roles.highest.position) {
          lines.push(`lvl **${def.level}** · ${role} — роль вища за бота, прив'язку пропущено`);
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
              'ролі активності готові',
              '',
              ...lines,
              '',
              'xp: повідомлення + войс (не соло, не AFK)',
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
              description: 'ролей немає · `/levelrole setup`',
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
        embeds: [successEmbed({ title: 'levelrole', description: `lvl ${level} знято` })],
        ephemeral: true,
      });
    }

    const level = interaction.options.getInteger('level', true);
    const role = interaction.options.getRole('role', true);
    if (isDangerousRole(role)) {
      return interaction.reply(errorReply('роль надто потужна'));
    }
    const me = interaction.guild.members.me;
    if (me && role.position >= me.roles.highest.position) {
      return interaction.reply(errorReply('роль бота нижча за цю роль'));
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
