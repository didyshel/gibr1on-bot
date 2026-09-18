const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const lockPath = path.join(root, '.bot.lock');

function listBotPids() {
  const out = execSync(
    'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = \'node.exe\'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"',
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  const data = JSON.parse(out || '[]');
  const rows = Array.isArray(data) ? data : [data];
  return rows
    .filter((row) => {
      const cmd = row.CommandLine || '';
      return /src[\\/]index\.js/.test(cmd) || /npm-cli\.js"? start/.test(cmd);
    })
    .map((row) => Number(row.ProcessId));
}

for (const pid of listBotPids()) {
  try {
    process.kill(pid);
    console.log('killed', pid);
  } catch (e) {
    console.log('skip', pid, e.message);
  }
}

try {
  if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
} catch {
  /* ignore */
}

setTimeout(() => {
  const child = spawn('node', ['src/index.js'], {
    cwd: root,
    stdio: 'inherit',
    detached: true,
    env: process.env,
  });
  child.unref();
  console.log('started bot pid', child.pid);
}, 1000);
