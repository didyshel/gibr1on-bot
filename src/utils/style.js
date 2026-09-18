const { EmbedBuilder } = require('discord.js');

/** Фиолетовый неон · минимализм */
const BRAND = {
  color: 0xb026ff,
  soft: 0x7c3aed,
  glow: 0xe879f9,
  success: 0x2dd4bf,
  warn: 0xf0abfc,
  danger: 0xfb7185,
  muted: 0x4c1d95,
  footer: 'gibr1on',
  name: 'gibr1on',
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
    embed.setAuthor({
      name: options.author.name,
      iconURL: options.author.iconURL,
      url: options.author.url,
    });
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
        description,
      }),
    ],
    ephemeral: true,
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
