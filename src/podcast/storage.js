/**
 * 本地播客持久化存储（纯本地 localStorage，无需任何云端账号）
 * 管理：RSS 订阅列表、Feed URL 索引、单集缓存、收听历史、断点续听进度
 */

const { createPodcastId, normalizeFeedUrl } = require('./rss');
const { adaptEpisodeToTrack } = require('./adapter');

const SUBSCRIPTIONS_KEY = 'rss_podcast_subscriptions_v1';
const FEED_MAP_KEY = 'rss_podcast_feed_map_v1';
const HISTORY_KEY = 'rss_podcast_history_v1';
const EPISODE_CACHE_KEY = 'rss_podcast_episode_cache_v1';
const LATEST_STREAM_KEY = 'rss_podcast_latest_stream_v1';
const PROGRESS_PREFIX = 'rss_progress_';
const PROGRESS_TIME_PREFIX = 'rss_progress_time_';

const MAX_HISTORY_ITEMS = 100;
const MAX_CACHED_EPISODES = 160;
const MAX_FEED_MAP_ENTRIES = 400;
const MAX_LATEST_STREAM_ITEMS = 60;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------------- Feed URL 映射索引（确保 /podcast/:pid 刷新后仍可加载） ---------------- */

export function registerFeedUrl(pid, feedUrl, meta = {}) {
  const normalized = normalizeFeedUrl(feedUrl);
  if (!normalized) return '';
  const resolvedPid = pid || createPodcastId(normalized);
  const map = readJson(FEED_MAP_KEY, {});
  map[resolvedPid] = {
    pid: resolvedPid,
    feedUrl: normalized,
    itunesId:
      meta.itunesId || (map[resolvedPid] && map[resolvedPid].itunesId) || '',
    title: meta.title || (map[resolvedPid] && map[resolvedPid].title) || '',
    coverImgUrl:
      meta.coverImgUrl ||
      (map[resolvedPid] && map[resolvedPid].coverImgUrl) ||
      '',
    updatedAt: Date.now(),
  };

  // 限制映射表大小，按更新时间淘汰最旧记录
  const entries = Object.values(map);
  if (entries.length > MAX_FEED_MAP_ENTRIES) {
    entries
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(MAX_FEED_MAP_ENTRIES)
      .forEach(item => delete map[item.pid]);
  }
  writeJson(FEED_MAP_KEY, map);
  return resolvedPid;
}

export function getFeedInfoByPid(pid) {
  if (!pid) return null;
  const subs = getSubscriptions();
  const sub = subs.find(item => item.pid === pid);
  if (sub && sub.feedUrl) return sub;
  const map = readJson(FEED_MAP_KEY, {});
  return map[pid] || null;
}

export function getFeedUrlByPid(pid) {
  const info = getFeedInfoByPid(pid);
  return (info && info.feedUrl) || '';
}

/* ---------------- 本地订阅管理 ---------------- */

export function getSubscriptions() {
  const list = readJson(SUBSCRIPTIONS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function isSubscribed(pidOrFeedUrl) {
  if (!pidOrFeedUrl) return false;
  const normalized = normalizeFeedUrl(pidOrFeedUrl);
  const subs = getSubscriptions();
  return subs.some(
    item =>
      item.pid === pidOrFeedUrl ||
      (normalized &&
        normalizeFeedUrl(item.feedUrl).toLowerCase() ===
          normalized.toLowerCase())
  );
}

export function subscribePodcast(podcast) {
  if (!podcast) throw new Error('无效的播客信息');
  const feedUrl = normalizeFeedUrl(podcast.feedUrl);
  if (!feedUrl) throw new Error('该播客缺少有效的 RSS 地址，无法订阅');
  const pid = podcast.pid || createPodcastId(feedUrl);
  const subs = getSubscriptions();
  const now = new Date().toISOString();

  const existingIndex = subs.findIndex(
    item =>
      item.pid === pid ||
      normalizeFeedUrl(item.feedUrl).toLowerCase() === feedUrl.toLowerCase()
  );

  const entry = {
    pid,
    feedUrl,
    itunesId:
      podcast.itunesId ||
      (existingIndex >= 0 ? subs[existingIndex].itunesId : '') ||
      '',
    title: podcast.title || podcast.name || feedUrl,
    author:
      podcast.author ||
      (podcast.creator && podcast.creator.nickname) ||
      (existingIndex >= 0 ? subs[existingIndex].author : '') ||
      '',
    coverImgUrl:
      podcast.coverImgUrl ||
      podcast.picUrl ||
      (existingIndex >= 0 ? subs[existingIndex].coverImgUrl : '') ||
      '',
    description:
      podcast.description ||
      podcast.brief ||
      (existingIndex >= 0 ? subs[existingIndex].description : '') ||
      '',
    brief:
      podcast.brief ||
      podcast.author ||
      (existingIndex >= 0 ? subs[existingIndex].brief : '') ||
      '',
    categories: Array.isArray(podcast.categories)
      ? podcast.categories
      : existingIndex >= 0
      ? subs[existingIndex].categories || []
      : [],
    link:
      podcast.link ||
      (existingIndex >= 0 ? subs[existingIndex].link : '') ||
      '',
    episodeCount:
      Number(podcast.episodeCount || podcast.trackCount) ||
      (existingIndex >= 0 ? subs[existingIndex].episodeCount : 0) ||
      0,
    latestPubDate:
      podcast.latestPubDate ||
      (existingIndex >= 0 ? subs[existingIndex].latestPubDate : '') ||
      '',
    subscribedAt:
      existingIndex >= 0 ? subs[existingIndex].subscribedAt || now : now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    subs.splice(existingIndex, 1, entry);
  } else {
    subs.unshift(entry);
  }

  writeJson(SUBSCRIPTIONS_KEY, subs);
  registerFeedUrl(pid, feedUrl, entry);
  return entry;
}

export function unsubscribePodcast(pidOrFeedUrl) {
  const normalized = normalizeFeedUrl(pidOrFeedUrl);
  const subs = getSubscriptions();
  const next = subs.filter(
    item =>
      item.pid !== pidOrFeedUrl &&
      (!normalized ||
        normalizeFeedUrl(item.feedUrl).toLowerCase() !==
          normalized.toLowerCase())
  );
  writeJson(SUBSCRIPTIONS_KEY, next);

  // 同步清理订阅最新流中的该节目单集
  const stream = getLatestSubscribedEpisodes().filter(
    ep =>
      ep.pid !== pidOrFeedUrl &&
      (!normalized ||
        normalizeFeedUrl(ep.feedUrl).toLowerCase() !== normalized.toLowerCase())
  );
  writeJson(LATEST_STREAM_KEY, stream);
  return next;
}

export function importSubscriptionsBatch(feeds = []) {
  let added = 0;
  let skipped = 0;
  (feeds || []).forEach(feed => {
    const feedUrl = normalizeFeedUrl(feed && feed.feedUrl);
    if (!feedUrl) {
      skipped += 1;
      return;
    }
    if (isSubscribed(feedUrl)) {
      skipped += 1;
      return;
    }
    subscribePodcast({
      pid: feed.pid || createPodcastId(feedUrl),
      feedUrl,
      title: feed.title || feedUrl,
      description: feed.description || '',
      link: feed.link || '',
      categories: feed.categories || [],
    });
    added += 1;
  });
  return { added, skipped, total: getSubscriptions().length };
}

/* ---------------- 订阅节目的最新单集汇总流 ---------------- */

export function mergeLatestEpisodes(podcast, episodes = []) {
  if (!podcast || !podcast.pid || !Array.isArray(episodes)) return [];
  const existing = getLatestSubscribedEpisodes().filter(
    item => item.pid !== podcast.pid
  );
  const topFromFeed = episodes.slice(0, 5).map(ep => {
    const track = ep.isPodcast ? ep : adaptEpisodeToTrack(ep, podcast);
    return {
      id: track.id,
      eid: track.eid,
      pid: track.pid,
      feedUrl: track.feedUrl,
      title: track.name,
      podcastTitle: track.ar && track.ar[0] ? track.ar[0].name : podcast.title,
      coverImgUrl: track.al ? track.al.picUrl : podcast.coverImgUrl,
      audioUrl: track.url,
      duration: track.duration,
      pubDate: track.pubDate,
      description: (track.description || '').slice(0, 160),
    };
  });

  const merged = existing
    .concat(topFromFeed)
    .sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0))
    .slice(0, MAX_LATEST_STREAM_ITEMS);

  writeJson(LATEST_STREAM_KEY, merged);
  return merged;
}

export function getLatestSubscribedEpisodes() {
  const list = readJson(LATEST_STREAM_KEY, []);
  return Array.isArray(list) ? list : [];
}

/* ---------------- 单集元数据缓存（支持刷新页面后恢复播放器当前播客） ---------------- */

export function cacheTrackMetadata(track) {
  if (!track || !track.id || !track.url) return;
  const cache = readJson(EPISODE_CACHE_KEY, {});
  cache[track.id] = {
    id: track.id,
    rawId: track.rawId || track.eid,
    eid: track.eid,
    pid: track.pid,
    feedUrl: track.feedUrl || '',
    type: 'podcast',
    isPodcast: true,
    name: track.name || track.title || '无标题单集',
    title: track.title || track.name || '无标题单集',
    ar: track.ar || [{ id: track.pid, name: '播客' }],
    al: track.al || { id: track.pid, name: '播客', picUrl: '' },
    dt: track.dt || (track.duration || 0) * 1000,
    duration: track.duration || 0,
    url: track.url,
    // 限制单条 showNotes 长度防止超出 localStorage 配额
    showNotes: String(track.showNotes || '').slice(0, 12000),
    pubDate: track.pubDate || '',
    link: track.link || '',
    cachedAt: Date.now(),
  };

  const entries = Object.values(cache);
  if (entries.length > MAX_CACHED_EPISODES) {
    entries
      .sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0))
      .slice(MAX_CACHED_EPISODES)
      .forEach(item => delete cache[item.id]);
  }
  writeJson(EPISODE_CACHE_KEY, cache);
}

export function getCachedTrackById(trackId) {
  if (!trackId) return null;
  const cache = readJson(EPISODE_CACHE_KEY, {});
  if (cache[trackId]) return cache[trackId];
  const history = getListeningHistory();
  const found = history.find(item => item.id === trackId);
  return found ? adaptEpisodeToTrack(found) : null;
}

/* ---------------- 本地播放进度与收听历史 ---------------- */

export function getEpisodeProgress(eid) {
  if (!eid) return 0;
  const raw = localStorage.getItem(`${PROGRESS_PREFIX}${eid}`);
  const val = Number(raw);
  return Number.isFinite(val) && val > 0 ? val : 0;
}

export function saveEpisodeProgress(eid, progressSeconds) {
  if (!eid) return;
  const val = Number(progressSeconds);
  if (!Number.isFinite(val) || val < 0) return;
  localStorage.setItem(`${PROGRESS_PREFIX}${eid}`, String(Math.floor(val)));
  localStorage.setItem(`${PROGRESS_TIME_PREFIX}${eid}`, String(Date.now()));
}

export function getListeningHistory() {
  const list = readJson(HISTORY_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function recordListeningHistory(track, progressSeconds = 0) {
  if (!track || !track.eid) return;
  const history = getListeningHistory().filter(item => item.eid !== track.eid);
  const duration = Math.max(0, Number(track.duration) || 0);
  const progress = Math.max(0, Math.floor(Number(progressSeconds) || 0));
  const completed = duration > 60 && progress >= duration - 15;

  const record = {
    id: track.id || `rss_${track.eid}`,
    eid: track.eid,
    pid: track.pid || '',
    feedUrl: track.feedUrl || '',
    title: track.name || track.title || '无标题单集',
    podcastTitle:
      (track.ar && track.ar[0] && track.ar[0].name) ||
      (track.al && track.al.name) ||
      '播客',
    coverImgUrl: (track.al && track.al.picUrl) || '',
    audioUrl: track.url || '',
    duration,
    pubDate: track.pubDate || '',
    link: track.link || '',
    showNotes: String(track.showNotes || '').slice(0, 8000),
    playbackProgress: progress,
    completed,
    playedAt: new Date().toISOString(),
  };

  history.unshift(record);
  if (history.length > MAX_HISTORY_ITEMS) {
    history.length = MAX_HISTORY_ITEMS;
  }
  writeJson(HISTORY_KEY, history);
  cacheTrackMetadata(track);
}

export function removeHistoryItem(eid) {
  const next = getListeningHistory().filter(item => item.eid !== eid);
  writeJson(HISTORY_KEY, next);
  return next;
}

export function clearListeningHistory() {
  writeJson(HISTORY_KEY, []);
}
