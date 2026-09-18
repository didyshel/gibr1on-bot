const { PermissionFlagsBits } = require('discord.js');

function canModerate(moderator, target) {
  if (!moderator || !target) return { ok: false, reason: 'Участник не найден.' };
  if (moderator.id === target.id) {
    return { ok: false, reason: 'Нельзя применить это к себе.' };
  }
  if (target.id === target.guild.ownerId) {
    return { ok: false, reason: 'Нельзя модерировать владельца сервера.' };
  }
  if (target.user?.bot) {
    return { ok: false, reason: 'Нельзя модерировать ботов этой командой.' };
  }
  if (target.permissions?.has(PermissionFlagsBits.Administrator) &&
      moderator.id !== moderator.guild.ownerId) {
    return { ok: false, reason: 'Нельзя модерировать администратора.' };
  }
  if (
    moderator.id !== moderator.guild.ownerId &&
    moderator.roles.highest.position <= target.roles.highest.position
  ) {
    return { ok: false, reason: 'У этого участника роль не ниже твоей.' };
  }

  const me = target.guild.members.me;
  if (me && me.roles.highest.position <= target.roles.highest.position) {
    return { ok: false, reason: 'Моя роль слишком низко, чтобы модерировать этого участника.' };
  }

  return { ok: true };
}

const MOD_PERMS = PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers;

module.exports = { canModerate, MOD_PERMS };
