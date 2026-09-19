/** Роли активности (русская линейка) + цвета */
const ACTIVITY_ROLES = [
  { level: 1, name: 'Новичок', color: 0x9ca3af, hoist: false },
  { level: 5, name: 'Заглянул', color: 0x67e8f9, hoist: false },
  { level: 10, name: 'Свой', color: 0x38bdf8, hoist: false },
  { level: 15, name: 'Постоянный', color: 0xa78bfa, hoist: true },
  { level: 25, name: 'Завсегдатай', color: 0xc084fc, hoist: true },
  { level: 40, name: 'Опора сервера', color: 0xe879f9, hoist: true },
  { level: 60, name: 'Легенда', color: 0xb026ff, hoist: true },
];

module.exports = { ACTIVITY_ROLES };
