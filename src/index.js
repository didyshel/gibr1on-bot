require('dotenv').config({ override: false });
const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Partials,
  MessageFlags,
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const lockPath = path.join(__dirname, '..', '.bot.lock');
const enableLock = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.ENABLE_BOT_LOCK || '').toLowerCase(),
);
if (enableLock) {
  try {
    if (fs.existsSync(lockPath)) {
      const oldPid = Number(fs.readFileSync(lockPath, 'utf8').trim());
      if (oldPid && oldPid !== process.pid) {
        try {
          process.kill(oldPid, 0);
          console.error(`Бот уже запущен (PID ${oldPid}). Останавливаю старый процесс...`);
          process.kill(oldPid);
        } catch {
          // lock устарел
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
}

const { infoEmbed, errorReply, BRAND } = require('./utils/style');
const {
  isSafeToken,
  isAllowedGuild,
  leaveUnknownGuilds,
  assertInteractionAccess,
  isDangerousRole,
  allowedGuildIds,
  allowedRoleIds,
  ownerIds,
} = require('./utils/security');
const { isAllowedSelfRole } = require('./utils/selfroles');
const { markAction } = require('./utils/logger');

const token = process.env.DISCORD_TOKEN;

if (!isSafeToken(token)) {
  console.error('[boot] Некорректный или пустой DISCORD_TOKEN (проверь Environment Variables на хостинге).');
  process.exit(1);
}

const guilds = allowedGuildIds();
if (!guilds.length) {
  console.error('[boot] Нет GUILD_ID / ALLOWED_GUILD_IDS в env — бот не запущен.');
  process.exit(1);
}

console.log('[boot] env ok · guilds:', guilds.join(', '));

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
  rest: {
    timeout: 7_000,
    retries: 2,
  },
});
client.setMaxListeners(30);

// Heartbeat — видно, жив ли event loop на FadeHost после boot
client.once(Events.ClientReady, () => {
  setInterval(() => {
    try {
      console.log(
        `[alive] ws=${client.ws.status} ping=${Math.round(client.ws.ping || 0)}ms cmds=${client.commands.size}`,
      );
    } catch {
      /* ignore */
    }
  }, 30_000);
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`[boot] cmd /${command.data.name}`);
    } else {
      console.warn(`[boot] skip ${file} · нет data/execute`);
    }
  } catch (error) {
    console.error(`[boot] FAIL cmd ${file}:`, error.message);
  }
}
console.log(`[boot] команд загружено: ${client.commands.size}`);

function safeRegister(name, registerFn) {
  try {
    registerFn(client);
    console.log(`[boot] feature ${name}`);
  } catch (error) {
    console.error(`[boot] FAIL feature ${name}:`, error.message);
  }
}

safeRegister('auditLogs', () => require('./logging/registerAuditLogs').registerAuditLogs(client));
safeRegister('userInfo', () => require('./features/userInfoChannel').registerUserInfoChannel(client));
safeRegister('presence', () => require('./features/presence').registerPresence(client));
safeRegister('welcome', () => require('./features/welcome').registerWelcome(client));
safeRegister('easterEggs', () => require('./features/easterEggs').registerEasterEggs(client));

let handleTempVoiceInteraction = async () => {};
safeRegister('tempVoice', () => {
  const mod = require('./features/tempVoice');
  mod.registerTempVoice(client);
  handleTempVoiceInteraction = mod.handleTempVoiceInteraction;
});

safeRegister('reminders', () => require('./features/reminders').registerReminders(client));
safeRegister('birthdays', () => require('./features/birthdays').registerBirthdays(client));
safeRegister('activity', () => require('./features/activity').registerActivity(client));
safeRegister('stats', () => require('./features/stats').registerStats(client));
safeRegister('automod', () => require('./features/automod').registerAutomod(client));
safeRegister('levels', () => require('./features/levels').registerLevels(client));
safeRegister('afkDetect', () => require('./features/afkDetect').registerAfkDetect(client));
safeRegister('backup', () => require('./features/backup').registerBackup(client));

const helpCommand = require('./commands/help');

async function leaveIfUnauthorized(guild) {
  if (!leaveUnknownGuilds()) return;
  if (isAllowedGuild(guild.id)) return;
  console.warn(`[security] ухожу с чужого сервера: ${guild.name} (${guild.id})`);
  await guild.leave().catch((err) => {
    console.warn(`[security] не удалось выйти из ${guild.id}:`, err.message);
  });
}

async function safeRespond(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp(payload);
    }
    return await interaction.reply(payload);
  } catch (error) {
    console.error('[interaction] respond fail:', error.message);
    return null;
  }
}

/** После defer: команды с reply()/deferReply() продолжают работать через editReply */
function patchDeferredInteraction(interaction) {
  const edit = interaction.editReply.bind(interaction);
  const followUp = interaction.followUp.bind(interaction);

  interaction.reply = async (options = {}) => {
    const { ephemeral, fetchReply, flags, ...rest } = options;
    const result = await edit(rest);
    if (fetchReply) {
      return interaction.fetchReply();
    }
    return result;
  };

  interaction.deferReply = async () => interaction;

  interaction.followUp = followUp;
  return interaction;
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[boot] онлайн как ${readyClient.user.tag}`);
  console.log(`[boot] ws status: ${readyClient.ws.status}`);
  console.log(`[security] разрешённые серверы: ${allowedGuildIds().join(', ')}`);
  const owners = ownerIds();
  console.log(
    owners.length
      ? `[security] владельцы бота (топовые команды): ${owners.join(', ')}`
      : '[security] ВНИМАНИЕ: OWNER_IDS пуст — ban/warn/automod и т.п. недоступны никому',
  );
  const roles = allowedRoleIds();
  console.log(
    roles.length
      ? `[security] доступ по ролям: ${roles.join(', ')}`
      : '[security] доступ по ролям: без ограничений',
  );

  const allowed = allowedGuildIds();
  const present = [...readyClient.guilds.cache.keys()].filter((id) => allowed.includes(id));
  console.log(
    present.length
      ? `[boot] на разрешённых серверах: ${present.join(', ')}`
      : '[boot] ВНИМАНИЕ: бот НЕ на разрешённом сервере — проверь GUILD_ID на FadeHost',
  );

  for (const guild of readyClient.guilds.cache.values()) {
    await leaveIfUnauthorized(guild);
  }
});

client.on(Events.Error, (error) => {
  console.error('[discord]', error?.message || error);
});

client.on(Events.ShardDisconnect, (event) => {
  console.warn('[discord] disconnect', event?.code, event?.reason || '');
});

client.on(Events.ShardReconnecting, () => {
  console.warn('[discord] reconnecting…');
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason?.message || reason);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error?.message || error);
});

client.on(Events.GuildCreate, async (guild) => {
  await leaveIfUnauthorized(guild);
});

client.on(Events.InteractionCreate, async (interaction) => {
  const name = interaction.commandName || interaction.customId || String(interaction.type);
  // Синхронно ДО любого await — иначе на FadeHost не видно, что event дошёл
  console.log(`[interaction] hit · ${name}`);

  try {
    if (interaction.isChatInputCommand()) {
      const t0 = Date.now();
      try {
        await interaction.deferReply();
        console.log(`[interaction] deferred · /${interaction.commandName} · ${Date.now() - t0}ms`);
      } catch (error) {
        console.error(
          `[interaction] defer fail · /${interaction.commandName} · ${Date.now() - t0}ms ·`,
          error.message,
        );
        return;
      }

      patchDeferredInteraction(interaction);

      const command = client.commands.get(interaction.commandName);
      if (!command) {
        console.warn(`[interaction] нет хендлера: /${interaction.commandName}`);
        await interaction.editReply({
          embeds: errorReply(
            `команда \`/${interaction.commandName}\` не загружена · Redeploy на FadeHost`,
          ).embeds,
        });
        return;
      }

      const access = assertInteractionAccess(interaction, command);
      if (!access.ok) {
        await interaction.editReply({ embeds: errorReply(access.reason).embeds });
        return;
      }

      await command.execute(interaction);
      console.log(`[interaction] ok · /${interaction.commandName}`);
      return;
    }

    const label = interaction.customId || interaction.type;
    console.log(`[interaction] in · ${label}`);

    const tvId = interaction.customId || '';
    if (
      tvId.startsWith('tv:') ||
      tvId.startsWith('tvmodal:') ||
      tvId.startsWith('tvselect:')
    ) {
      const access = assertInteractionAccess(interaction);
      if (!access.ok) {
        await safeRespond(interaction, errorReply(access.reason));
        return;
      }
      await handleTempVoiceInteraction(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('help:')) {
      const access = assertInteractionAccess(interaction);
      if (!access.ok) {
        await safeRespond(interaction, errorReply(access.reason));
        return;
      }

      const key = interaction.customId.slice('help:'.length);
      if (!['home', 'mod', 'util', 'server'].includes(key)) {
        await safeRespond(interaction, errorReply('неизвестная страница'));
        return;
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
        await safeRespond(interaction, errorReply(access.reason));
        return;
      }

      const roleId = interaction.customId.slice('selfrole:'.length);
      if (!/^\d{17,20}$/.test(roleId)) {
        await safeRespond(interaction, errorReply('некорректная роль'));
        return;
      }

      if (!isAllowedSelfRole(interaction.guildId, roleId)) {
        await safeRespond(interaction, errorReply('эта роль не из панели бота'));
        return;
      }

      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) {
        await safeRespond(interaction, errorReply('роль больше не существует'));
        return;
      }

      if (isDangerousRole(role)) {
        await safeRespond(interaction, errorReply('роль слишком мощная для self-role'));
        return;
      }

      const me = interaction.guild.members.me;
      if (me && role.position >= me.roles.highest.position) {
        await safeRespond(interaction, errorReply('роль бота ниже этой роли'));
        return;
      }

      const member = interaction.member;
      if (!member?.roles) {
        await safeRespond(interaction, errorReply('не удалось получить роли'));
        return;
      }

      if (member.roles.cache.has(roleId)) {
        markAction(`roles:${interaction.guildId}:${member.id}`);
        await member.roles.remove(roleId);
        await safeRespond(interaction, {
          embeds: [
            infoEmbed({
              title: 'roles',
              color: BRAND.soft,
              description: `${role} · снята`,
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      markAction(`roles:${interaction.guildId}:${member.id}`);
      await member.roles.add(roleId);
      await safeRespond(interaction, {
        embeds: [
          infoEmbed({
            title: 'roles',
            description: `${role} · выдана`,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    console.error('[interaction] error:', error);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: errorReply('ошибка при выполнении').embeds }).catch(() => null);
      } else {
        await safeRespond(interaction, errorReply('ошибка при выполнении'));
      }
    } catch {
      /* ignore */
    }
  }
});

client.login(token).catch((err) => {
  console.error('[boot] login fail:', err.message);
  process.exit(1);
});
