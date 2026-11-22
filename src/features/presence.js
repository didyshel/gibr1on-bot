const { Events, ActivityType } = require('discord.js');

function registerPresence(client) {
  const statuses = [
    () => ({ name: 'Nemiroff App', type: ActivityType.Watching }),
    () => ({ name: 'семью Nemiroff', type: ActivityType.Watching }),
    () => ({ name: '/help · Nemiroff', type: ActivityType.Listening }),
    () => {
      const guild = client.guilds.cache.first();
      const count = guild?.memberCount ?? 0;
      return { name: `${count} в Nemiroff`, type: ActivityType.Watching };
    },
  ];

  let index = 0;
  const tick = () => {
    const status = statuses[index % statuses.length]();
    index += 1;
    client.user?.setPresence({
      activities: [status],
      status: 'dnd',
    });
  };

  client.once(Events.ClientReady, () => {
    tick();
    setInterval(tick, 45_000);
  });
}

module.exports = { registerPresence };
