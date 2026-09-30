const { MessageFlags } = require('discord.js');
const { EmbedBuilder } = require('discord.js');

/** Кровавая палитра Blood — все оттенки красного */
const BRAND = {
  /** основной акцент */
  color: 0xb91c1c,
  /** приглушённый тёмно-красный */
  soft: 0x7f1d1d,
  /** яркий «свежий» кровь */
  glow: 0xff1f1f,
  /** успех / принято — тёмная кровь */
  success: 0x8b0000,
  /** предупреждение */
  warn: 0xdc2626,
  /** ошибка / отклонено — глубокий crimson */
  danger: 0x991b1b,
  /** почти чёрный с красным подтоном */
  muted: 0x140303,
  /** чистый blood для редких акцентов */
  blood: 0xc41e3a,
  footer: 'Blood App',
  name: 'Blood App',
};

function brandEmbed(options = {}) {
  const embed = new EmbedBuilder()
    .setColor(options.color ?? BRAND.color)
    .setTimestamp()
    .setFooter({ text: options.footer ?? BRAND.footer });

  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);
  if (options.url) embed.setURL(options.url);
  if (options.author) {
    const author = { name: String(options.author.name || BRAND.name).slice(0, 256) };
    if (options.author.iconURL) author.iconURL = options.author.iconURL;
    if (options.author.url) author.url = options.author.url;
    embed.setAuthor(author);
  }
  if (options.fields?.length) {
    embed.addFields(
      options.fields
        .filter((f) => f?.name && f?.value != null)
        .map((f) => ({
          name: String(f.name).slice(0, 256),
          value: String(f.value).slice(0, 1024),
          inline: Boolean(f.inline),
        })),
    );
  }

  return embed;
}

function successEmbed(options = {}) {
  return brandEmbed({ ...options, color: options.color ?? BRAND.success });
}

function warnEmbed(options = {}) {
  return brandEmbed({ ...options, color: options.color ?? BRAND.warn });
}

function errorEmbed(options = {}) {
  return brandEmbed({ ...options, color: options.color ?? BRAND.danger });
}

function infoEmbed(options = {}) {
  return brandEmbed({ ...options, color: options.color ?? BRAND.color });
}

/** Короткий ephemeral-ответ об ошибке */
function errorReply(description, extra = {}) {
  return {
    embeds: [
      errorEmbed({
        title: extra.title || 'ошибка',
        description: String(description || 'ошибка').slice(0, 2000),
      }),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

module.exports = {
  BRAND,
  brandEmbed,
  successEmbed,
  warnEmbed,
  errorEmbed,
  infoEmbed,
  errorReply,
};
