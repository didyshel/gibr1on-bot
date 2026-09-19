const fs = require('node:fs');
const path = require('node:path');
const { Events } = require('discord.js');
const { backupEnabled, backupKeepDays } = require('../utils/config');

const dataDir = path.join(__dirname, '..', 'data');
const backupsRoot = path.join(dataDir, 'backups');

function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function runBackup() {
  if (!backupEnabled()) return;
  if (!fs.existsSync(dataDir)) return;

  const stamp = todayStamp();
  const dest = path.join(backupsRoot, stamp);
  fs.mkdirSync(dest, { recursive: true });

  const files = fs.readdirSync(dataDir).filter((name) => name.endsWith('.json'));
  for (const name of files) {
    const src = path.join(dataDir, name);
    try {
      if (!fs.statSync(src).isFile()) continue;
      fs.copyFileSync(src, path.join(dest, name));
    } catch (err) {
      console.warn(`[backup] ${name}:`, err.message);
    }
  }

  pruneOld();
  console.log(`[backup] snapshot ${stamp} · ${files.length} files`);
}

function pruneOld() {
  const keep = backupKeepDays();
  if (!fs.existsSync(backupsRoot)) return;
  const dirs = fs
    .readdirSync(backupsRoot)
    .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .sort();
  while (dirs.length > keep) {
    const old = dirs.shift();
    const full = path.join(backupsRoot, old);
    try {
      fs.rmSync(full, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[backup] prune ${old}:`, err.message);
    }
  }
}

function registerBackup(client) {
  client.once(Events.ClientReady, () => {
    runBackup();
    setInterval(runBackup, 60 * 60 * 1000);
  });
}

module.exports = { registerBackup, runBackup };
