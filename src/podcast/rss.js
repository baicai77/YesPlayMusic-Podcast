/**
 * 标准播客 RSS 2.0 / iTunes / Atom 解析器
 */

const { parseXml, findChild, findChildren, getChildText } = require('./xml');

function normalizeFeedUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    parsed.hash = '';
    return parsed.href;
  } catch (e) {
    return '';
  }
}

/**
 * 纯 JS 确定性双 32 位哈希，在 Node.js 与浏览器端输出完全一致的 URL 安全短 ID
 */
function stableHash(input) {
  const text = String(input || '');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const p1 = (h1 >>> 0).toString(36).padStart(7, '0');
  const p2 = (h2 >>> 0).toString(36).padStart(7, '0');
  return `${p1}${p2}`;
}

function createPodcastId(feedUrl) {
  const normalized = normalizeFeedUrl(feedUrl) || String(feedUrl || '').trim();
  return `rss_${stableHash(normalized.toLowerCase())}`;
}

function createEpisodeId(feedUrl, guidOrAudioUrl) {
  const base = `${normalizeFeedUrl(feedUrl) || feedUrl}::${
    guidOrAudioUrl || ''
  }`;
  return `ep_${stableHash(base)}`;
}

function parseDuration(raw) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  }
  const str = String(raw).trim();
  if (!str) return 0;
  if (/^\d+(\.\d+)?$/.test(str)) {
    return Math.floor(parseFloat(str));
  }
  const parts = str.split(':').map(part => parseFloat(part.trim()));
  if (parts.some(n => !Number.isFinite(n) || n < 0)) return 0;
  if (parts.length === 3) {
    return Math.floor(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  if (parts.length === 2) {
    return Math.floor(parts[0] * 60 + parts[1]);
  }
  return 0;
}

function parseDate(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const ts = Date.parse(raw.trim());
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toISOString();
}

function safeHttpUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.href
      : '';
  } catch (e) {
    return '';
  }
}

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractImageUrl(node) {
  if (!node) return '';
  const itunesImg = findChild(node, 'itunes:image');
  if (itunesImg && itunesImg.attrs && itunesImg.attrs.href) {
    const href = safeHttpUrl(itunesImg.attrs.href);
    if (href) return href;
  }
  const mediaThumb = findChild(node, ['media:thumbnail', 'media:image']);
  if (mediaThumb && mediaThumb.attrs && mediaThumb.attrs.url) {
    const url = safeHttpUrl(mediaThumb.attrs.url);
    if (url) return url;
  }
  const imageNode = findChild(node, 'image');
  if (imageNode) {
    const urlText = getChildText(imageNode, 'url') || imageNode.text.trim();
    const url = safeHttpUrl(urlText);
    if (url) return url;
    if (imageNode.attrs && imageNode.attrs.href) {
      const href = safeHttpUrl(imageNode.attrs.href);
      if (href) return href;
    }
  }
  const logoOrIcon = getChildText(node, ['logo', 'icon']);
  if (logoOrIcon) {
    const url = safeHttpUrl(logoOrIcon);
    if (url) return url;
  }
  return '';
}

function extractAudioFromItem(item) {
  const enclosures = findChildren(item, 'enclosure');
  for (let i = 0; i < enclosures.length; i++) {
    const enc = enclosures[i];
    const url = safeHttpUrl(enc.attrs && enc.attrs.url);
    const type = (enc.attrs && enc.attrs.type) || '';
    if (
      url &&
      (!type || /^audio\/|mpeg|mp3|m4a|aac|ogg|wav|octet-stream/i.test(type))
    ) {
      return { url, type };
    }
  }
  if (enclosures.length > 0) {
    const fallbackUrl = safeHttpUrl(
      enclosures[0].attrs && enclosures[0].attrs.url
    );
    if (fallbackUrl) {
      return {
        url: fallbackUrl,
        type: (enclosures[0].attrs && enclosures[0].attrs.type) || '',
      };
    }
  }

  const mediaContents = findChildren(item, 'media:content');
  for (let i = 0; i < mediaContents.length; i++) {
    const mc = mediaContents[i];
    const url = safeHttpUrl(mc.attrs && mc.attrs.url);
    const type = (mc.attrs && mc.attrs.type) || '';
    const medium = (mc.attrs && mc.attrs.medium) || '';
    if (
      url &&
      (medium === 'audio' ||
        /^audio\//i.test(type) ||
        /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(url))
    ) {
      return { url, type, duration: mc.attrs && mc.attrs.duration };
    }
  }

  // Atom <link rel="enclosure" href="..." />
  const links = findChildren(item, 'link');
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (link.attrs && link.attrs.rel === 'enclosure' && link.attrs.href) {
      const url = safeHttpUrl(link.attrs.href);
      if (url) {
        return { url, type: link.attrs.type || '' };
      }
    }
  }

  return { url: '', type: '' };
}

function extractCategories(channel) {
  const cats = new Set();
  const nodes = findChildren(channel, ['itunes:category', 'category']);
  nodes.forEach(node => {
    const text =
      (node.attrs && (node.attrs.text || node.attrs.term)) || node.text.trim();
    if (text) cats.add(text);
    const subCats = findChildren(node, 'itunes:category');
    subCats.forEach(sub => {
      const subText = sub.attrs && sub.attrs.text;
      if (subText) cats.add(subText);
    });
  });
  return Array.from(cats);
}

function extractLink(node) {
  const links = findChildren(node, 'link');
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (link.attrs && link.attrs.href && link.attrs.rel !== 'enclosure') {
      const href = safeHttpUrl(link.attrs.href);
      if (href) return href;
    }
    const textUrl = safeHttpUrl(link.text.trim());
    if (textUrl) return textUrl;
  }
  return '';
}

function parseRssFeed(xmlText, feedUrl = '') {
  const doc = parseXml(xmlText);
  const rssNode = findChild(doc, ['rss', 'rdf:rdf']);
  const atomFeed = findChild(doc, 'feed');
  const channel = rssNode ? findChild(rssNode, 'channel') || rssNode : atomFeed;

  if (!channel) {
    throw new Error('未能识别有效的 RSS 或 Atom 播客源格式');
  }

  const isAtom = !rssNode && Boolean(atomFeed);
  let resolvedFeedUrl = normalizeFeedUrl(feedUrl);
  if (!resolvedFeedUrl) {
    const atomLinks = findChildren(channel, ['atom:link', 'link']);
    for (let i = 0; i < atomLinks.length; i++) {
      if (
        atomLinks[i].attrs &&
        atomLinks[i].attrs.rel === 'self' &&
        atomLinks[i].attrs.href
      ) {
        resolvedFeedUrl = normalizeFeedUrl(atomLinks[i].attrs.href);
        if (resolvedFeedUrl) break;
      }
    }
  }

  const pid = createPodcastId(
    resolvedFeedUrl || getChildText(channel, 'title')
  );
  const title = getChildText(channel, 'title') || '未命名播客';

  const ownerNode = findChild(channel, 'itunes:owner');
  const authorNode = findChild(channel, 'author');
  const author =
    getChildText(channel, 'itunes:author') ||
    (ownerNode ? getChildText(ownerNode, 'itunes:name') : '') ||
    (authorNode
      ? getChildText(authorNode, 'name') || authorNode.text.trim()
      : '') ||
    getChildText(channel, ['dc:creator', 'managingeditor']) ||
    '';

  const rawDesc =
    getChildText(channel, 'description') ||
    getChildText(channel, 'itunes:summary') ||
    getChildText(channel, 'subtitle') ||
    '';
  const description = stripHtml(rawDesc);
  const coverImgUrl = extractImageUrl(channel);
  const language = getChildText(channel, 'language');
  const link = extractLink(channel);
  const categories = extractCategories(channel);

  const rawItems = isAtom
    ? findChildren(channel, 'entry')
    : findChildren(channel, 'item');

  const episodes = [];
  const seenEids = new Set();

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    const audio = extractAudioFromItem(item);
    if (!audio.url) continue;

    const epTitle = getChildText(item, 'title') || `单集 ${i + 1}`;
    const guid = getChildText(item, ['guid', 'id']) || audio.url;
    const eid = createEpisodeId(resolvedFeedUrl || pid, guid);
    if (seenEids.has(eid)) continue;
    seenEids.add(eid);

    const contentEncoded = getChildText(item, 'content:encoded');
    const itemDesc = getChildText(item, 'description');
    const itunesSummary = getChildText(item, 'itunes:summary');
    const atomContent = getChildText(item, ['content', 'summary']);
    const showNotes =
      contentEncoded || itemDesc || atomContent || itunesSummary || '';

    const durationRaw =
      getChildText(item, 'itunes:duration') || audio.duration || '';
    const duration = parseDuration(durationRaw);
    const pubDate = parseDate(
      getChildText(item, ['pubdate', 'published', 'updated', 'dc:date'])
    );
    const epCover = extractImageUrl(item) || coverImgUrl;
    const epLink = extractLink(item);

    episodes.push({
      eid,
      pid,
      feedUrl: resolvedFeedUrl,
      title: epTitle,
      description: stripHtml(itunesSummary || itemDesc || showNotes).slice(
        0,
        240
      ),
      showNotes,
      audioUrl: audio.url,
      audioType: audio.type,
      duration,
      pubDate,
      coverImgUrl: epCover,
      link: epLink,
      guid,
    });
  }

  return {
    podcast: {
      pid,
      feedUrl: resolvedFeedUrl,
      title,
      author,
      description,
      brief: description.slice(0, 140),
      coverImgUrl,
      language,
      link,
      categories,
      episodeCount: episodes.length,
    },
    episodes,
  };
}

module.exports = {
  normalizeFeedUrl,
  stableHash,
  createPodcastId,
  createEpisodeId,
  parseDuration,
  parseDate,
  parseRssFeed,
};
