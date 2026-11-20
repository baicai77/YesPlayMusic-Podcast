/**
 * Public Podcast data model adapter.
 * Maps RSS / Apple Podcasts / public page metadata to YesPlayMusic Track & Playlist models.
 */

export function hashId(input) {
  const str = String(input || '');
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function encodeFeedPid(feedUrl) {
  if (!feedUrl) return '';
  const bytes = new TextEncoder().encode(String(feedUrl).trim());
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `rss_${b64}`;
}

export function decodeFeedPid(pid) {
  if (!pid || !String(pid).startsWith('rss_')) return '';
  const b64 = String(pid)
    .slice(4)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

export function adaptEpisodeToTrack(episode, podcastInfo = null) {
  if (!episode) return null;
  const audioUrl =
    episode.audioUrl ||
    episode.episodeUrl ||
    episode.enclosure?.url ||
    episode.media?.source?.url ||
    episode.url ||
    '';
  const rawKey = episode.guid || episode.eid || episode.trackId || audioUrl;
  if (!rawKey) return null;

  const eid = episode.eid && /^[a-zA-Z0-9_-]{4,40}$/.test(episode.eid)
    ? episode.eid
    : hashId(rawKey);
  const pod = podcastInfo || episode.podcast || {};
  const feedUrl = episode.feedUrl || pod.feedUrl || '';
  const pid =
    pod.pid ||
    episode.pid ||
    (pod.collectionId ? `itunes_${pod.collectionId}` : '') ||
    (feedUrl ? encodeFeedPid(feedUrl) : 'rss_unknown');
  const podcastTitle = pod.title || pod.name || pod.collectionName || '播客';
  const coverUrl =
    episode.image ||
    episode.artworkUrl600 ||
    episode.artworkUrl160 ||
    pod.image ||
    pod.coverImgUrl ||
    pod.picUrl ||
    pod.artworkUrl600 ||
    '';
  const durationSec = Number.isFinite(episode.duration)
    ? episode.duration
    : Math.floor((Number(episode.trackTimeMillis) || 0) / 1000);

  return {
    id: `ep_${eid}`,
    rawId: rawKey,
    eid,
    pid,
    feedUrl,
    type: 'podcast',
    isPodcast: true,
    name: episode.title || episode.trackName || '无标题单集',
    title: episode.title || episode.trackName || '无标题单集',
    ar: [
      {
        id: pid,
        name: podcastTitle,
      },
    ],
    al: {
      id: pid,
      name: podcastTitle,
      picUrl: coverUrl,
    },
    dt: durationSec * 1000,
    duration: durationSec,
    url: audioUrl,
    showNotes: episode.shownotes || episode.description || '',
    pubDate: episode.pubDate || episode.releaseDate || '',
    playCount:
      Number.isFinite(episode.playCount) && episode.playCount >= 0
        ? episode.playCount
        : null,
    playbackProgress: Math.max(0, Number(episode.playbackProgress) || 0),
  };
}

export function adaptPodcastToPlaylist(podcast, episodes = []) {
  if (!podcast) return null;
  const feedUrl = podcast.feedUrl || '';
  const pid =
    podcast.pid ||
    (podcast.collectionId ? `itunes_${podcast.collectionId}` : '') ||
    (feedUrl ? encodeFeedPid(feedUrl) : '');
  if (!pid) return null;

  const coverUrl =
    podcast.image ||
    podcast.coverImgUrl ||
    podcast.picUrl ||
    podcast.artworkUrl600 ||
    podcast.artworkUrl100 ||
    '';

  const normalizedPod = {
    pid,
    feedUrl,
    title: podcast.title || podcast.name || podcast.collectionName || '未命名播客',
    image: coverUrl,
  };

  const adaptedTracks = (episodes || [])
    .map(ep => adaptEpisodeToTrack(ep, normalizedPod))
    .filter(Boolean);

  return {
    id: pid,
    pid,
    feedUrl,
    collectionId: podcast.collectionId || null,
    type: 'podcast',
    isPodcast: true,
    name: normalizedPod.title,
    title: normalizedPod.title,
    coverImgUrl: coverUrl,
    picUrl: coverUrl,
    description: podcast.description || podcast.brief || '',
    brief: podcast.brief || podcast.artistName || podcast.author || '',
    genres: podcast.genres || [],
    trackCount: podcast.episodeCount || podcast.trackCount || adaptedTracks.length,
    creator: {
      userId: podcast.author || podcast.artistName || '',
      nickname: podcast.author || podcast.artistName || '主播',
      avatarUrl: coverUrl,
    },
    tracks: adaptedTracks,
  };
}

export function formatPlayCount(count) {
  if (!Number.isFinite(count) || count < 0) return '';
  const value =
    count >= 100000000
      ? `${Number((count / 100000000).toFixed(1))}亿`
      : count >= 10000
      ? `${Number((count / 10000).toFixed(1))}万`
      : String(Math.floor(count));
  return `${value}次收听`;
}
