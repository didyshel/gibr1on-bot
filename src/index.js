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
          console.error(`Бот уже запущено (PID ${oldPid}). Зупиняю старий процес...`);
          process.kill(oldPid);
        } catch {
          // lock застарів
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
    console.warn('Не вдалося створити lock-файл:', error.message);
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
  console.error('[boot] Некоректний або порожній DISCORD_TOKEN (перевір Environment Variables на хостингу).');
  process.exit(1);
}

const guilds = allowedGuildIds();
if (!guilds.length) {
  console.error('[boot] Немає GUILD_ID / ALLOWED_GUILD_IDS в env — бот не запущено.');
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

// Heartbeat — видно, чи живий event loop на FadeHost після boot
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
      console.warn(`[boot] skip ${file} · немає data/execute`);
    }
  } catch (error) {
    console.error(`[boot] FAIL cmd ${file}:`, error.message);
  }
}
console.log(`[boot] команд завантажено: ${client.commands.size}`);

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

let handleApplicationsInteraction = async (interaction) => {
  await safeRespond(
    interaction,
    errorReply('заявки не завантажено · Pull + Restart на FadeHost'),
  );
};
safeRegister('applications', () => {
  const apps = require('./features/applications');
  handleApplicationsInteraction = apps.handleApplicationsInteraction;
  apps.registerApplications(client);
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
  console.warn(`[security] залишаю чужий сервер: ${guild.name} (${guild.id})`);
  await guild.leave().catch((err) => {
    console.warn(`[security] не вдалося вийти з ${guild.id}:`, err.message);
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

/** Після defer: команди з reply()/deferReply() продовжують працювати через editReply */
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
  console.log(`[boot] онлайн як ${readyClient.user.tag}`);
  console.log(`[boot] ws status: ${readyClient.ws.status}`);
  console.log(`[security] дозволені сервери: ${allowedGuildIds().join(', ')}`);
  const owners = ownerIds();
  console.log(
    owners.length
      ? `[security] власники бота (топові команди): ${owners.join(', ')}`
      : '[security] УВАГА: OWNER_IDS порожній — ban/warn/automod тощо недоступні нікому',
  );
  const roles = allowedRoleIds();
  console.log(
    roles.length
      ? `[security] доступ за ролями: ${roles.join(', ')}`
      : '[security] доступ за ролями: без обмежень',
  );

  const allowed = allowedGuildIds();
  const present = [...readyClient.guilds.cache.keys()].filter((id) => allowed.includes(id));
  console.log(
    present.length
      ? `[boot] на дозволених серверах: ${present.join(', ')}`
      : '[boot] УВАГА: бот НЕ на дозволеному сервері — перевір GUILD_ID на FadeHost',
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
  // Синхронно ДО будь-якого await — інакше на FadeHost не видно, що event дійшов
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
        console.warn(`[interaction] немає хендлера: /${interaction.commandName}`);
        await interaction.editReply({
          embeds: errorReply(
            `команда \`/${interaction.commandName}\` не завантажена · Redeploy на FadeHost`,
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

    if (tvId === 'apply:open' || tvId === 'apply:modal' || tvId.startsWith('apply:accept:') || tvId.startsWith('apply:reject:')) {
      const access = assertInteractionAccess(interaction);
      if (!access.ok) {
        await safeRespond(interaction, errorReply(access.reason));
        return;
      }
      await handleApplicationsInteraction(interaction);
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
        await safeRespond(interaction, errorReply('невідома сторінка'));
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
        await safeRespond(interaction, errorReply('некоректна роль'));
        return;
      }

      if (!isAllowedSelfRole(interaction.guildId, roleId)) {
        await safeRespond(interaction, errorReply('ця роль не з панелі бота'));
        return;
      }

      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) {
        await safeRespond(interaction, errorReply('роль більше не існує'));
        return;
      }

      if (isDangerousRole(role)) {
        await safeRespond(interaction, errorReply('роль надто потужна для self-role'));
        return;
      }

      const me = interaction.guild.members.me;
      if (me && role.position >= me.roles.highest.position) {
        await safeRespond(interaction, errorReply('роль бота нижча за цю роль'));
        return;
      }

      const member = interaction.member;
      if (!member?.roles) {
        await safeRespond(interaction, errorReply('не вдалося отримати ролі'));
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
              description: `${role} · знято`,
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
            description: `${role} · видано`,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    console.error('[interaction] error:', error);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: errorReply('помилка під час виконання').embeds }).catch(() => null);
      } else {
        await safeRespond(interaction, errorReply('помилка під час виконання'));
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
