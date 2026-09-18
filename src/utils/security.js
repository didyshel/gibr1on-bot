const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');

/** Права, которые нельзя выдавать через self-role */
const DANGEROUS_ROLE_PERMS =
  PermissionFlagsBits.Administrator |
  PermissionFlagsBits.ManageGuild |
  PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.BanMembers |
  PermissionFlagsBits.KickMembers |
  PermissionFlagsBits.ModerateMembers |
  PermissionFlagsBits.ManageWebhooks |
  PermissionFlagsBits.ManageMessages |
  PermissionFlagsBits.MentionEveryone |
  PermissionFlagsBits.ManageNicknames |
  PermissionFlagsBits.ManageGuildExpressions |
  PermissionFlagsBits.ManageEvents |
  PermissionFlagsBits.MuteMembers |
  PermissionFlagsBits.DeafenMembers |
  PermissionFlagsBits.MoveMembers |
  PermissionFlagsBits.ViewAuditLog;

const rateBuckets = new Map();

function envList(name) {
  const raw = process.env[name];
  if (!raw || /your_|_here|вставь/i.test(raw)) return [];
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{17,20}$/.test(s));
}

function allowedGuildIds() {
  const fromList = envList('ALLOWED_GUILD_IDS');
  if (fromList.length) return fromList;
  const single = envList('GUILD_ID');
  return single;
}

function ownerIds() {
  return envList('OWNER_IDS');
}

function leaveUnknownGuilds() {
  const value = process.env.LEAVE_UNKNOWN_GUILDS;
  if (value == null || value === '') return true;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function isAllowedGuild(guildId) {
  const allowed = allowedGuildIds();
  if (!allowed.length) return false;
  return allowed.includes(String(guildId));
}

function isOwner(userId) {
  return ownerIds().includes(String(userId));
}

function isSafeToken(token) {
  if (!token || typeof token !== 'string') return false;
  if (token.length < 50) return false;
  if (/your_|_here|вставь|example/i.test(token)) return false;
  return true;
}

function isDangerousRole(role) {
  if (!role) return true;
  if (role.managed) return true;
  if (role.id === role.guild?.id) return true;
  return role.permissions.any(DANGEROUS_ROLE_PERMS);
}

function checkRateLimit(userId, { limit = 8, windowMs = 10_000 } = {}) {
  const now = Date.now();
  const key = String(userId);
  const hits = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  rateBuckets.set(key, hits);
  if (hits.length > limit) {
    return { ok: false, reason: 'слишком быстро · подожди пару секунд' };
  }
  return { ok: true };
}

function requiredPermissions(command) {
  try {
    const json = command?.data?.toJSON?.() || {};
    const raw = json.default_member_permissions;
    if (raw == null || raw === '') return null;
    return new PermissionsBitField(BigInt(raw));
  } catch {
    return null;
  }
}

/**
 * Единая проверка доступа к команде / кнопке.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function assertInteractionAccess(interaction, command = null) {
  if (!interaction.guildId || !interaction.inGuild?.()) {
    return { ok: false, reason: 'только на сервере' };
  }

  if (!isAllowedGuild(interaction.guildId)) {
    return { ok: false, reason: 'сервер не разрешён' };
  }

  const rate = checkRateLimit(interaction.user.id);
  if (!rate.ok) return rate;

  if (isOwner(interaction.user.id)) return { ok: true };

  if (command) {
    const need = requiredPermissions(command);
    if (need && !interaction.memberPermissions?.has(need)) {
      return { ok: false, reason: 'недостаточно прав' };
    }
  }

  return { ok: true };
}

module.exports = {
  DANGEROUS_ROLE_PERMS,
  allowedGuildIds,
  ownerIds,
  leaveUnknownGuilds,
  isAllowedGuild,
  isOwner,
  isSafeToken,
  isDangerousRole,
  checkRateLimit,
  assertInteractionAccess,
  requiredPermissions,
};
