const {
  warnTimeoutAt,
  warnTimeoutMinutes,
  warnKickAt,
} = require('./config');
const { canModerate } = require('./moderation');
const { createCase, formatCaseId } = require('./cases');
const { sendModLog } = require('./logger');
const { BRAND } = require('./style');

/**
 * После нового варна: timeout и/или kick по порогам из env.
 * @returns {Promise<{ actions: string[], cases: object[] }>}
 */
async function applyWarnEscalation({
  guild,
  targetUser,
  targetMember,
  moderator,
  warnCount,
}) {
  const timeoutAt = warnTimeoutAt();
  const kickAt = warnKickAt();
  const minutes = warnTimeoutMinutes();
  const actions = [];
  const cases = [];

  if (!targetMember) {
    return { actions, cases };
  }

  const check = canModerate(moderator, targetMember);
  if (!check.ok) {
    return { actions, cases };
  }

  const doKick = kickAt > 0 && warnCount === kickAt;
  const doTimeout = timeoutAt > 0 && warnCount === timeoutAt && !doKick;

  if (doTimeout) {
    const reason = `авто-эскалация: ${warnCount} варн(ов) → timeout ${minutes} мин`;
    const caseEntry = createCase(guild.id, {
      type: 'warn_timeout',
      userId: targetUser.id,
      moderatorId: moderator.id,
      reason,
      meta: { warnCount, minutes },
    });
    const caseLabel = formatCaseId(caseEntry.id);
    await targetMember
      .timeout(minutes * 60 * 1000, `${caseLabel} · ${reason}`)
      .catch(() => null);

    actions.push(`timeout ${minutes} мин`);
    cases.push(caseEntry);

    await sendModLog(guild, {
      title: `warn escalate · timeout · ${caseLabel}`,
      color: BRAND.warn,
      fields: [
        { name: 'участник', value: `${targetUser}` },
        { name: 'варнов', value: String(warnCount), inline: true },
        { name: 'timeout', value: `${minutes} мин`, inline: true },
        { name: 'case', value: caseLabel, inline: true },
      ],
      footer: `id · ${targetUser.id}`,
    });
  }

  if (doKick) {
    const reason = `авто-эскалация: ${warnCount} варн(ов) → kick`;
    const caseEntry = createCase(guild.id, {
      type: 'warn_kick',
      userId: targetUser.id,
      moderatorId: moderator.id,
      reason,
      meta: { warnCount },
    });
    const caseLabel = formatCaseId(caseEntry.id);
    await targetMember.kick(`${caseLabel} · ${reason}`).catch(() => null);

    actions.push('kick');
    cases.push(caseEntry);

    await sendModLog(guild, {
      title: `warn escalate · kick · ${caseLabel}`,
      color: BRAND.danger,
      fields: [
        { name: 'участник', value: `${targetUser}` },
        { name: 'варнов', value: String(warnCount), inline: true },
        { name: 'case', value: caseLabel, inline: true },
      ],
      footer: `id · ${targetUser.id}`,
    });
  }

  return { actions, cases };
}

module.exports = { applyWarnEscalation };
