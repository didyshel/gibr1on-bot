const { execSync } = require('child_process');
const out = execSync(
  'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = \'node.exe\'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"',
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
);
console.log(out);
