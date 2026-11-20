/**
 * 标准 RSS 播客与 Apple Podcasts 公开目录服务
 * 完全基于开放 RSS 协议与 Apple 官方公开检索接口，无需登录任何第三方账号
 */

const axios = require('axios');
const {
  parseRssFeed,
  normalizeFeedUrl,
  createPodcastId,
  createEpisodeId,
  parseDate,
} = require('./rss');
const {
  validatePublicHttpUrl,
  assertPublicHostResolution,
} = require('./security');

const USER_AGENT =
  'YesPlayMusic-RSS-Podcast/1.0 (+https://github.com/qier222/YesPlayMusic)';
const ALLOWED_COUNTRIES = new Set([
  'CN',
  'TW',
  'HK',
  'US',
  'JP',
  'GB',
  'SG',
  'CA',
  'AU',
]);
const CHART_CACHE_TTL_MS = 15 * 60 * 1000;
const FEED_CACHE_TTL_MS = 5 * 60 * 1000;

const http = axios.create({
  timeout: 15000,
  maxContentLength: 15 * 1024 * 1024,
  maxBodyLength: 15 * 1024 * 1024,
  headers: {
    'User-Agent': USER_AGENT,
    Accept:
      'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*',
  },
});

const chartCache = new Map();
const feedCache = new Map();

function sanitizeCountry(country) {
  const upper = String(country || 'CN')
    .trim()
    .toUpperCase();
  return ALLOWED_COUNTRIES.has(upper) ? upper : 'CN';
}

function sanitizeLimit(limit, fallback = 25, max = 50) {
  const n = parseInt(limit, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function sanitizeGenre(genre) {
  const str = String(genre || '').trim();
  if (!str || str === 'all') return '';
  return /^\d{2,6}$/.test(str) ? str : '';
}

/**
 * 抓取并解析标准 RSS / Atom 播客源（手动跟随重定向以校验每一跳 URL 安全性）
 */
async function fetchFeed(rawUrl, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  let currentUrl = await assertPublicHostResolution(rawUrl);

  if (!forceRefresh) {
    const cached = feedCache.get(currentUrl);
    if (cached && Date.now() - cached.ts < FEED_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  let response = null;
  let redirects = 0;
  const maxRedirects = 5;

  while (redirects <= maxRedirects) {
    response = await http.get(currentUrl, {
      responseType: 'text',
      transformResponse: [data => data],
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400,
    });

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers &&
      response.headers.location
    ) {
      const nextUrl = new URL(response.headers.location, currentUrl).href;
      currentUrl = await assertPublicHostResolution(nextUrl);
      redirects += 1;
      continue;
    }
    break;
  }

  if (!response || response.status >= 300) {
    const err = new Error('RSS 源重定向次数过多，无法获取内容');
    err.status = 502;
    throw err;
  }

  const xmlText =
    typeof response.data === 'string'
      ? response.data
      : String(response.data || '');

  const parsed = parseRssFeed(xmlText, currentUrl);
  const result = {
    podcast: parsed.podcast,
    episodes: parsed.episodes,
    fetchedAt: new Date().toISOString(),
  };

  feedCache.set(currentUrl, { ts: Date.now(), data: result });
  if (normalizeFeedUrl(rawUrl) && normalizeFeedUrl(rawUrl) !== currentUrl) {
    feedCache.set(normalizeFeedUrl(rawUrl), { ts: Date.now(), data: result });
  }
  return result;
}

function mapItunesPodcast(item) {
  if (!item) return null;
  const feedUrl = normalizeFeedUrl(item.feedUrl);
  if (!feedUrl) return null;
  const pid = createPodcastId(feedUrl);
  const coverImgUrl =
    item.artworkUrl600 || item.artworkUrl100 || item.artworkUrl60 || '';
  return {
    pid,
    feedUrl,
    itunesId: item.collectionId ? String(item.collectionId) : '',
    title: item.collectionName || item.trackName || '未命名播客',
    author: item.artistName || '',
    coverImgUrl,
    description: item.primaryGenreName || '',
    brief: item.artistName || item.primaryGenreName || '',
    categories: Array.isArray(item.genres)
      ? item.genres.filter(g => g && g !== 'Podcasts' && g !== '播客')
      : [],
    episodeCount: Number(item.trackCount) || 0,
    link: item.collectionViewUrl || '',
  };
}

function mapItunesEpisode(item) {
  if (!item || !item.episodeUrl) return null;
  const feedUrl = normalizeFeedUrl(item.feedUrl);
  const pid = feedUrl
    ? createPodcastId(feedUrl)
    : `itunes_${item.collectionId || 'unknown'}`;
  const audioUrl = normalizeFeedUrl(item.episodeUrl);
  if (!audioUrl) return null;
  const guid = item.episodeGuid || String(item.trackId || audioUrl);
  const eid = createEpisodeId(feedUrl || pid, guid);
  return {
    eid,
    pid,
    feedUrl,
    itunesId: item.collectionId ? String(item.collectionId) : '',
    title: item.trackName || '无标题单集',
    podcastTitle: item.collectionName || '播客',
    author: item.artistName || item.collectionName || '',
    coverImgUrl:
      item.artworkUrl600 || item.artworkUrl160 || item.artworkUrl60 || '',
    audioUrl,
    duration: item.trackTimeMillis
      ? Math.floor(Number(item.trackTimeMillis) / 1000)
      : 0,
    pubDate: parseDate(item.releaseDate),
    showNotes: item.description || item.shortDescription || '',
    description: item.shortDescription || item.description || '',
    link: item.trackViewUrl || '',
  };
}

/**
 * 使用 Apple iTunes 公开 API 搜索播客节目或单集
 */
async function searchPodcasts({
  term = '',
  country = 'CN',
  limit = 25,
  entity = 'podcast',
} = {}) {
  const query = String(term || '').trim();
  if (!query) {
    const err = new Error('请输入搜索关键词');
    err.status = 400;
    throw err;
  }

  const safeCountry = sanitizeCountry(country);
  const safeLimit = sanitizeLimit(limit, 25, 50);
  const safeEntity = entity === 'podcastEpisode' ? 'podcastEpisode' : 'podcast';

  const response = await http.get('https://itunes.apple.com/search', {
    params: {
      media: 'podcast',
      entity: safeEntity,
      country: safeCountry,
      limit: safeLimit,
      term: query,
    },
  });

  const results = Array.isArray(response.data && response.data.results)
    ? response.data.results
    : [];

  if (safeEntity === 'podcastEpisode') {
    return {
      entity: safeEntity,
      items: results.map(mapItunesEpisode).filter(Boolean),
    };
  }

  return {
    entity: safeEntity,
    items: results.map(mapItunesPodcast).filter(Boolean),
  };
}

/**
 * 通过 Apple Podcasts collectionId 批量查询官方 RSS 地址与高清封面
 */
async function lookupByIds(ids = [], country = 'CN') {
  const cleanIds = (Array.isArray(ids) ? ids : [ids])
    .map(id => String(id || '').trim())
    .filter(id => /^\d+$/.test(id));
  if (!cleanIds.length) return [];

  const safeCountry = sanitizeCountry(country);
  const response = await http.get('https://itunes.apple.com/lookup', {
    params: {
      id: cleanIds.slice(0, 50).join(','),
      entity: 'podcast',
      country: safeCountry,
    },
  });

  const results = Array.isArray(response.data && response.data.results)
    ? response.data.results
    : [];
  return results.map(mapItunesPodcast).filter(Boolean);
}

/**
 * 获取 Apple Podcasts 公开热门榜单并附带 RSS 源地址
 */
async function getTopCharts({
  country = 'CN',
  genre = '',
  limit = 30,
  forceRefresh = false,
} = {}) {
  const safeCountry = sanitizeCountry(country).toLowerCase();
  const safeGenre = sanitizeGenre(genre);
  const safeLimit = sanitizeLimit(limit, 30, 50);
  const cacheKey = `${safeCountry}:${safeGenre}:${safeLimit}`;

  if (!forceRefresh) {
    const cached = chartCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CHART_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const genreSegment = safeGenre ? `/genre=${safeGenre}` : '';
  const chartUrl = `https://itunes.apple.com/${safeCountry}/rss/toppodcasts/limit=${safeLimit}${genreSegment}/json`;

  const response = await http.get(chartUrl);
  const feed = (response.data && response.data.feed) || {};
  const rawEntries = Array.isArray(feed.entry)
    ? feed.entry
    : feed.entry
    ? [feed.entry]
    : [];

  const ids = rawEntries
    .map(
      entry =>
        entry && entry.id && entry.id.attributes && entry.id.attributes['im:id']
    )
    .filter(id => id && /^\d+$/.test(String(id)));

  const lookupMap = new Map();
  if (ids.length > 0) {
    try {
      const resolved = await lookupByIds(ids, safeCountry.toUpperCase());
      resolved.forEach(item => {
        if (item.itunesId) lookupMap.set(item.itunesId, item);
      });
    } catch (e) {
      // 批量解析失败时降级保留榜单基本信息，用户点击时再按需 lookup
    }
  }

  const items = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const entry = rawEntries[i];
    const itunesId = String(
      (entry &&
        entry.id &&
        entry.id.attributes &&
        entry.id.attributes['im:id']) ||
        ''
    );
    const resolved = lookupMap.get(itunesId);
    const images = Array.isArray(entry['im:image']) ? entry['im:image'] : [];
    const fallbackCover =
      images.length > 0 ? images[images.length - 1].label || '' : '';
    const title =
      (resolved && resolved.title) ||
      (entry['im:name'] && entry['im:name'].label) ||
      '未命名播客';
    const author =
      (resolved && resolved.author) ||
      (entry['im:artist'] && entry['im:artist'].label) ||
      '';
    const summary = (entry.summary && entry.summary.label) || '';
    const categoryLabel =
      (entry.category &&
        entry.category.attributes &&
        entry.category.attributes.label) ||
      '';

    items.push({
      rank: i + 1,
      itunesId,
      pid: resolved ? resolved.pid : `itunes_${itunesId}`,
      feedUrl: resolved ? resolved.feedUrl : '',
      title,
      author,
      coverImgUrl: (resolved && resolved.coverImgUrl) || fallbackCover,
      description: summary || (resolved && resolved.description) || '',
      brief: (summary || author || categoryLabel).slice(0, 120),
      categories:
        resolved && resolved.categories.length
          ? resolved.categories
          : categoryLabel
          ? [categoryLabel]
          : [],
      episodeCount: (resolved && resolved.episodeCount) || 0,
      link: (resolved && resolved.link) || '',
    });
  }

  const data = {
    title: (feed.title && feed.title.label) || '热门播客榜',
    updated: (feed.updated && feed.updated.label) || new Date().toISOString(),
    country: safeCountry.toUpperCase(),
    genre: safeGenre,
    items,
  };

  chartCache.set(cacheKey, { ts: Date.now(), data });
  return data;
}

module.exports = {
  fetchFeed,
  searchPodcasts,
  getTopCharts,
  lookupByIds,
  validatePublicHttpUrl,
  _clearCaches: () => {
    chartCache.clear();
    feedCache.clear();
  },
};
