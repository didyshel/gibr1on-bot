const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { brandEmbed, errorReply, successEmbed, BRAND } = require('../utils/style');
const { isDangerousRole } = require('../utils/security');
const { allowRoles } = require('../utils/selfroles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Панель ролей по кнопкам')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Отправить панель выбора ролей')
        .addRoleOption((opt) =>
          opt.setName('role1').setDescription('Роль 1').setRequired(true),
        )
        .addRoleOption((opt) =>
          opt.setName('role2').setDescription('Роль 2').setRequired(false),
        )
        .addRoleOption((opt) =>
          opt.setName('role3').setDescription('Роль 3').setRequired(false),
        )
        .addRoleOption((opt) =>
          opt.setName('role4').setDescription('Роль 4').setRequired(false),
        )
        .addRoleOption((opt) =>
          opt.setName('role5').setDescription('Роль 5').setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName('title')
            .setDescription('Заголовок панели')
            .setRequired(false),
        ),
    ),

  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'setup') return;

    const roles = ['role1', 'role2', 'role3', 'role4', 'role5']
      .map((name) => interaction.options.getRole(name))
      .filter(Boolean);

    const unique = [];
    const seen = new Set();
    for (const role of roles) {
      if (seen.has(role.id)) continue;
      seen.add(role.id);
      unique.push(role);
    }

    const me = interaction.guild.members.me;
    for (const role of unique) {
      if (role.managed) {
        return interaction.reply(
          errorReply(`роль ${role} управляется интеграцией`),
        );
      }
      if (isDangerousRole(role)) {
        return interaction.reply(
          errorReply(`роль ${role} слишком мощная для self-role`),
        );
      }
      if (me && role.position >= me.roles.highest.position) {
        return interaction.reply(
          errorReply(`роль ${role} выше или равна роли бота`),
        );
      }
    }

    allowRoles(
      interaction.guildId,
      unique.map((r) => r.id),
    );

    const title =
      interaction.options.getString('title') || 'роли';
    const embed = brandEmbed({
      title,
      description: [
        unique.map((role) => `· ${role}`).join('\n'),
        '',
        'нажми кнопку — получить или снять',
      ].join('\n'),
      color: BRAND.color,
    });

    const row = new ActionRowBuilder().addComponents(
      unique.map((role) =>
        new ButtonBuilder()
          .setCustomId(`selfrole:${role.id}`)
          .setLabel(role.name.slice(0, 80))
          .setStyle(ButtonStyle.Secondary),
      ),
    );

    await interaction.reply({
      embeds: [
        successEmbed({
          title: 'roles',
          description: 'панель отправлена',
        }),
      ],
      ephemeral: true,
    });
    await interaction.channel.send({ embeds: [embed], components: [row] });
  },
};
