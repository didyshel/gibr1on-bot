require('dotenv').config();
const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Partials,
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const lockPath = path.join(__dirname, '..', '.bot.lock');
try {
  if (fs.existsSync(lockPath)) {
    const oldPid = Number(fs.readFileSync(lockPath, 'utf8').trim());
    if (oldPid && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 0);
        console.error(`Бот уже запущен (PID ${oldPid}). Останавливаю старый процесс...`);
        process.kill(oldPid);
      } catch {
        // процесса нет — lock устарел
      }
    }
  }
  fs.writeFileSync(lockPath, String(process.pid));
  const clearLock = () => {
    try {
      if (fs.existsSync(lockPath) && fs.readFileSync(lockPath, 'utf8').trim() === String(process.pid)) {
        fs.unlinkSync(lockPath);
      }
    } catch {
      /* ignore */
    }
  };
  process.on('exit', clearLock);
  process.on('SIGINT', () => {
    clearLock();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    clearLock();
    process.exit(0);
  });
} catch (error) {
  console.warn('Не удалось создать lock-файл:', error.message);
}

const { registerAuditLogs } = require('./logging/registerAuditLogs');
const { registerUserInfoChannel } = require('./features/userInfoChannel');
const { registerPresence } = require('./features/presence');
const { registerWelcome } = require('./features/welcome');
const { registerEasterEggs } = require('./features/easterEggs');
const { registerTempVoice } = require('./features/tempVoice');
const { registerReminders } = require('./features/reminders');
const { registerBirthdays } = require('./features/birthdays');
const { registerActivity } = require('./features/activity');
const { registerStats } = require('./features/stats');
const { registerAutomod } = require('./features/automod');
const helpCommand = require('./commands/help');
const { infoEmbed, errorReply, BRAND } = require('./utils/style');
const {
  isSafeToken,
  isAllowedGuild,
  leaveUnknownGuilds,
  assertInteractionAccess,
  isDangerousRole,
  allowedGuildIds,
} = require('./utils/security');
const { isAllowedSelfRole } = require('./utils/selfroles');

const token = process.env.DISCORD_TOKEN;

if (!isSafeToken(token)) {
  console.error('Некорректный DISCORD_TOKEN в .env — бот не запущен.');
  process.exit(1);
}

if (!allowedGuildIds().length) {
  console.error('Укажи GUILD_ID (или ALLOWED_GUILD_IDS) в .env — иначе бот нигде не работает.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.Channel],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[WARN] Команда ${file} без data/execute`);
  }
}

registerAuditLogs(client);
registerUserInfoChannel(client);
registerPresence(client);
registerWelcome(client);
registerEasterEggs(client);
registerTempVoice(client);
registerReminders(client);
registerBirthdays(client);
registerActivity(client);
registerStats(client);
registerAutomod(client);

async function leaveIfUnauthorized(guild) {
  if (!leaveUnknownGuilds()) return;
  if (isAllowedGuild(guild.id)) return;
  console.warn(`[security] ухожу с чужого сервера: ${guild.name} (${guild.id})`);
  await guild.leave().catch((err) => {
    console.warn(`[security] не удалось выйти из ${guild.id}:`, err.message);
  });
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Бот онлайн как ${readyClient.user.tag}`);
  console.log(`[security] разрешённые серверы: ${allowedGuildIds().join(', ')}`);
  for (const guild of readyClient.guilds.cache.values()) {
    await leaveIfUnauthorized(guild);
  }
});

client.on(Events.GuildCreate, async (guild) => {
  await leaveIfUnauthorized(guild);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      const access = assertInteractionAccess(interaction, command);
      if (!access.ok) {
        return interaction.reply(errorReply(access.reason));
      }

      await command.execute(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('help:')) {
      const access = assertInteractionAccess(interaction);
      if (!access.ok) {
        return interaction.reply(errorReply(access.reason));
      }

      const key = interaction.customId.slice('help:'.length);
      if (!['home', 'mod', 'util', 'server'].includes(key)) {
        return interaction.reply(errorReply('неизвестная страница'));
      }

      await interaction.update({
        embeds: [helpCommand.pageEmbed(key)],
        components: [helpCommand.pageRow()],
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('selfrole:')) {
      const access = assertInteractionAccess(interaction);
      if (!access.ok) {
        return interaction.reply(errorReply(access.reason));
      }

      const roleId = interaction.customId.slice('selfrole:'.length);
      if (!/^\d{17,20}$/.test(roleId)) {
        return interaction.reply(errorReply('некорректная роль'));
      }

      if (!isAllowedSelfRole(interaction.guildId, roleId)) {
        return interaction.reply(errorReply('эта роль не из панели бота'));
      }

      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) {
        return interaction.reply(errorReply('роль больше не существует'));
      }

      if (isDangerousRole(role)) {
        return interaction.reply(errorReply('роль слишком мощная для self-role'));
      }

      const me = interaction.guild.members.me;
      if (me && role.position >= me.roles.highest.position) {
        return interaction.reply(errorReply('роль бота ниже этой роли'));
      }

      const member = interaction.member;
      if (!member?.roles) {
        return interaction.reply(errorReply('не удалось получить роли'));
      }

      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
        return interaction.reply({
          embeds: [
            infoEmbed({
              title: 'roles',
              color: BRAND.soft,
              description: `${role} · снята`,
            }),
          ],
          ephemeral: true,
        });
      }

      await member.roles.add(roleId);
      return interaction.reply({
        embeds: [
          infoEmbed({
            title: 'roles',
            description: `${role} · выдана`,
          }),
        ],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('[interaction]', error?.message || error);
    const reply = errorReply('ошибка при выполнении');
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => null);
    } else if (interaction.isRepliable()) {
      await interaction.reply(reply).catch(() => null);
    }
  }
});

client.login(token).catch((err) => {
  console.error('Не удалось войти в Discord:', err.message);
  process.exit(1);
});
