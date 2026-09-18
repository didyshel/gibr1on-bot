function env(name) {
  const value = process.env[name];
  if (!value || /your_|_here|вставь/i.test(value)) return null;
  return value.trim();
}

function envFlag(name, defaultValue = false) {
  const value = process.env[name];
  if (value == null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function envList(name) {
  const raw = process.env[name];
  if (!raw || /your_|_here|вставь/i.test(raw)) return [];
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{17,20}$/.test(s));
}

function memberLogChannelId() {
  return env('MEMBER_LOG_CHANNEL_ID') || env('LOG_CHANNEL_ID');
}

function roleLogChannelId() {
  return env('ROLE_LOG_CHANNEL_ID') || env('LOG_CHANNEL_ID');
}

function serverLogChannelId() {
  return env('SERVER_LOG_CHANNEL_ID') || env('LOG_CHANNEL_ID');
}

function messageLogChannelId() {
  return env('MESSAGE_LOG_CHANNEL_ID') || env('LOG_CHANNEL_ID');
}

function allLogChannelIds() {
  return [
    ...new Set(
      [memberLogChannelId(), roleLogChannelId(), serverLogChannelId(), messageLogChannelId()].filter(
        Boolean,
      ),
    ),
  ];
}

function isLogChannelId(channelId) {
  return Boolean(channelId && allLogChannelIds().includes(channelId));
}

module.exports = {
  welcomeChannelId: () => env('WELCOME_CHANNEL_ID'),
  autoRoleId: () => env('AUTO_ROLE_ID'),
  /** @deprecated use member/role/server/message log channel helpers */
  logChannelId: () => env('LOG_CHANNEL_ID'),
  memberLogChannelId,
  roleLogChannelId,
  serverLogChannelId,
  messageLogChannelId,
  allLogChannelIds,
  isLogChannelId,
  infoUserChannelId: () => env('INFO_USER_CHANNEL_ID'),
  tempVoiceHubId: () => env('TEMP_VOICE_HUB_ID'),
  tempVoiceCategoryId: () => env('TEMP_VOICE_CATEGORY_ID'),
  statsMembersChannelId: () => env('STATS_MEMBERS_CHANNEL_ID'),
  statsOnlineChannelId: () => env('STATS_ONLINE_CHANNEL_ID'),
  birthdayChannelId: () => env('BIRTHDAY_CHANNEL_ID') || env('WELCOME_CHANNEL_ID'),
  automodInvites: () => envFlag('AUTOMOD_INVITES', true),
  automodSpam: () => envFlag('AUTOMOD_SPAM', true),
  guildId: () => env('GUILD_ID'),
  ownerIds: () => envList('OWNER_IDS'),
  allowedGuildIds: () => {
    const list = envList('ALLOWED_GUILD_IDS');
    if (list.length) return list;
    const one = env('GUILD_ID');
    return one ? [one] : [];
  },
};
