require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { isSafeToken } = require('./utils/security');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!isSafeToken(token) || !clientId || !guildId) {
  console.error('Заполни корректные DISCORD_TOKEN, CLIENT_ID и GUILD_ID в файле .env');
  process.exit(1);
}

if (!/^\d{17,20}$/.test(String(guildId).trim())) {
  console.error('GUILD_ID должен быть snowflake (числовой id сервера)');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  const json = command.data.toJSON();
  json.dm_permission = false;
  commands.push(json);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`Регистрирую ${commands.length} slash-команд только на сервере ${guildId}…`);

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });

    // На всякий случай чистим глобальные команды — чтобы не светились в ЛС / чужих серверах
    await rest.put(Routes.applicationCommands(clientId), { body: [] });

    console.log('Команды зарегистрированы (guild-only, DM выключены).');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
