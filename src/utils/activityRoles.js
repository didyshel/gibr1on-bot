/** Роли активности — кровавая линейка от тёмной к яркой крови */
const ACTIVITY_ROLES = [
  { level: 1, name: 'Новичок', color: 0x3b0a0a, hoist: false },
  { level: 5, name: 'Заглянул', color: 0x5c1010, hoist: false },
  { level: 10, name: 'Свой', color: 0x7f1d1d, hoist: false },
  { level: 15, name: 'Постоянный', color: 0x991b1b, hoist: true },
  { level: 25, name: 'Завсегдатай', color: 0xb91c1c, hoist: true },
  { level: 40, name: 'Опора сервера', color: 0xdc2626, hoist: true },
  { level: 60, name: 'Легенда', color: 0xff1f1f, hoist: true },
];

module.exports = { ACTIVITY_ROLES };
