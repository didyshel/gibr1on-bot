const { Events, ActivityType } = require('discord.js');

function registerPresence(client) {
  const statuses = [
    () => ({ name: 'gibr1on', type: ActivityType.Watching }),
    () => ({ name: '/help', type: ActivityType.Listening }),
    () => {
      const guild = client.guilds.cache.first();
      const count = guild?.memberCount ?? 0;
      return { name: `${count} online`, type: ActivityType.Watching };
    },
    () => ({ name: 'neon · quiet', type: ActivityType.Playing }),
  ];

  let index = 0;
  const tick = () => {
    const status = statuses[index % statuses.length]();
    index += 1;
    client.user?.setPresence({
      activities: [status],
      status: 'online',
    });
  };

  client.once(Events.ClientReady, () => {
    tick();
    setInterval(tick, 45_000);
  });
}

module.exports = { registerPresence };
