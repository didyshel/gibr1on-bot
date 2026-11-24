const { PermissionFlagsBits } = require('discord.js');

function canModerate(moderator, target) {
  if (!moderator || !target) return { ok: false, reason: 'Учасника не знайдено.' };
  if (moderator.id === target.id) {
    return { ok: false, reason: 'Не можна застосувати це до себе.' };
  }
  if (target.id === target.guild.ownerId) {
    return { ok: false, reason: 'Не можна модерувати власника сервера.' };
  }
  if (target.user?.bot) {
    return { ok: false, reason: 'Не можна модерувати ботів цією командою.' };
  }
  if (target.permissions?.has(PermissionFlagsBits.Administrator) &&
      moderator.id !== moderator.guild.ownerId) {
    return { ok: false, reason: 'Не можна модерувати адміністратора.' };
  }
  if (
    moderator.id !== moderator.guild.ownerId &&
    moderator.roles.highest.position <= target.roles.highest.position
  ) {
    return { ok: false, reason: 'У цього учасника роль не нижча за твою.' };
  }

  const me = target.guild.members.me;
  if (me && me.roles.highest.position <= target.roles.highest.position) {
    return { ok: false, reason: 'Моя роль занадто низько, щоб модерувати цього учасника.' };
  }

  return { ok: true };
}

const MOD_PERMS = PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers;

module.exports = { canModerate, MOD_PERMS };
