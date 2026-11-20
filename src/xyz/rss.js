import { adaptEpisodeToTrack } from './adapter';
import sha256 from 'crypto-js/sha256';

export const maxFeedSize = 2 * 1024 * 1024;
const storageKey = 'public_podcast_feeds';

export function publicFeedUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function durationSeconds(value) {
  if (!/^\d+(?::[0-5]?\d){0,2}$/.test(value)) return 0;
  const duration = value
    .split(':')
    .reduce((sum, part) => sum * 60 + Number(part), 0);
  return Number.isSafeInteger(duration) ? duration : 0;
}

export function parseFeed(xml, key, base = undefined) {
  if (!xml || xml.length > maxFeedSize || /<!DOCTYPE/i.test(xml)) {
    throw new Error('RSS 文件为空、超过 2 MB 或包含不支持的声明');
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const channel =
    doc.documentElement?.localName === 'rss' && doc.querySelector('channel');
  if (!channel || doc.querySelector('parsererror'))
    throw new Error('不是有效的 RSS 播客源');
  if (!key) {
    const self = Array.from(channel.children).find(
      item =>
        item.localName === 'link' &&
        item.namespaceURI === 'http://www.w3.org/2005/Atom' &&
        item.getAttribute('rel') === 'self'
    );
    key = publicFeedUrl(self?.getAttribute('href')) || `file:${sha256(xml)}`;
  }
  const text = (node, name) => {
    const child = Array.from(node.children).find(
      item => item.localName === name
    );
    return child?.textContent.trim() || '';
  };
  const title = text(channel, 'title').slice(0, 200) || '公开播客';
  const seen = new Set();
  const episodes = [];
  for (const item of Array.from(channel.children)) {
    if (item.localName !== 'item') continue;
    const enclosure = item.querySelector('enclosure');
    const mime = enclosure?.getAttribute('type') || '';
    const url = publicFeedUrl(enclosure?.getAttribute('url') || '', base);
    if (
      !enclosure?.getAttribute('url') ||
      !url ||
      (mime && !/^audio\//i.test(mime) && mime !== 'application/octet-stream')
    )
      continue;
    const guid = text(item, 'guid') || url;
    if (seen.has(guid)) continue;
    seen.add(guid);
    const eid = `rss:${encodeURIComponent(key)}:${encodeURIComponent(guid)}`;
    episodes.push({
      eid,
      title: text(item, 'title').slice(0, 300) || '无标题单集',
      pubDate: text(item, 'pubDate'),
      duration: durationSeconds(text(item, 'duration')),
      enclosure: { url },
    });
    if (episodes.length === 100) break;
  }
  if (!episodes.length) throw new Error('这个 RSS 没有可播放的 HTTPS 音频');
  return { key, title, url: base || '', episodes };
}

export async function fetchPublicFeed(value) {
  const url = publicFeedUrl(value);
  if (!url) throw new Error('请输入发布者提供的 HTTPS RSS 地址');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`RSS 服务返回 ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let xml = '';
    let size = 0;
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > maxFeedSize) {
        controller.abort();
        throw new Error('RSS 超过 2 MB');
      }
      xml += decoder.decode(chunk, { stream: true });
    }
    return parseFeed(xml + decoder.decode(), url, url);
  } catch (error) {
    if (error instanceof TypeError || error.name === 'AbortError') {
      throw new Error('无法读取 RSS；请检查直链和跨域权限，或导入 RSS 文件');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function readPublicFeeds() {
  try {
    const feeds = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(feeds) ? feeds : [];
  } catch {
    return [];
  }
}

export function savePublicFeeds(feeds) {
  localStorage.setItem(storageKey, JSON.stringify(feeds));
}

export function publicEpisodeTrack(feed, episode) {
  return {
    ...adaptEpisodeToTrack(episode, { pid: feed.key, title: feed.title }),
    id: episode.eid,
    localPodcast: true,
  };
}

export function findPublicEpisode(id) {
  for (const feed of readPublicFeeds()) {
    const episode = feed.episodes.find(item => item.eid === id);
    if (episode) return publicEpisodeTrack(feed, episode);
  }
  return null;
}
