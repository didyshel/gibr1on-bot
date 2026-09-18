const fs = require('fs');
const p = '.env';
let t = fs.readFileSync(p, 'utf8');
if (!t.includes('TEMP_VOICE_HUB_ID')) {
  t =
    t.trimEnd() +
    [
      '',
      'BIRTHDAY_CHANNEL_ID=',
      'TEMP_VOICE_HUB_ID=',
      'TEMP_VOICE_CATEGORY_ID=',
      'TICKET_CATEGORY_ID=',
      'TICKET_STAFF_ROLE_ID=',
      'STATS_MEMBERS_CHANNEL_ID=',
      'STATS_ONLINE_CHANNEL_ID=',
      'AUTOMOD_INVITES=true',
      'AUTOMOD_SPAM=true',
      '',
    ].join('\n');
  fs.writeFileSync(p, t);
  console.log('env keys added');
} else {
  console.log('env already has keys');
}
