const { execSync } = require('child_process');

const out = execSync(
  "powershell -NoProfile -Command \"Get-CimInstance Win32_Process -Filter \\\"Name = 'node.exe'\\\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress\"",
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
);
const data = JSON.parse(out || '[]');
const rows = Array.isArray(data) ? data : [data];
const bots = rows.filter((row) => /src[\\/]index\.js/.test(row.CommandLine || ''));

if (!bots.length) {
  console.log('no local bot');
  process.exit(0);
}

for (const bot of bots) {
  try {
    process.kill(bot.ProcessId);
    console.log('killed', bot.ProcessId);
  } catch (error) {
    console.log('skip', bot.ProcessId, error.message);
  }
}
