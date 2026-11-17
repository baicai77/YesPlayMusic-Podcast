/**
 * 小宇宙 FM 数据模型适配器
 * 将小宇宙的 Podcast / Episode 数据转换兼容 YesPlayMusic 的 Track / Album / Playlist 规范
 */

/**
 * 适配单集为播放器 Track 对象
 */
export function adaptEpisodeToTrack(episode, podcastInfo = null) {
  if (!episode?.eid) return null;

  const pod = podcastInfo || episode.podcast || {};
  const podcastId = pod.pid || episode.pid || '';
  const podcastTitle = pod.title || pod.name || '播客';
  const coverUrl =
    episode.image?.largePicUrl ||
    episode.image?.picUrl ||
    episode.image?.thumbnailUrl ||
    pod.image?.largePicUrl ||
    pod.image?.picUrl ||
    pod.coverImgUrl ||
    pod.picUrl ||
    '';

  // 音频直链 (小宇宙在 media.source.url 或 enclosure.url 提供音频地址)
  const audioUrl =
    episode.media?.source?.url ||
    episode.media?.url ||
    episode.enclosure?.url ||
    '';

  return {
    id: `xyz_${episode.eid}`,
    rawId: episode.eid,
    eid: episode.eid,
    pid: podcastId,
    type: 'podcast',
    isPodcast: true,
    name: episode.title || '无标题单集',
    title: episode.title || '无标题单集',
    ar: [
      {
        id: `xyz_pod_${podcastId}`,
        name: podcastTitle,
      },
    ],
    al: {
      id: `xyz_pod_${podcastId}`,
      name: podcastTitle,
      picUrl: coverUrl,
    },
    // 时长：YesPlayMusic 期望毫秒 (dt)
    dt: (episode.duration || 0) * 1000,
    duration: episode.duration || 0,
    url: audioUrl,
    // 播客独有字段
    showNotes: episode.shownotes || episode.description || '',
    pubDate: episode.pubDate,
    playCount:
      Number.isFinite(episode.playCount) && episode.playCount >= 0
        ? episode.playCount
        : null,
    clapCount: episode.clapCount || 0,
    commentsCount: episode.commentsCount || 0,
    playbackProgress: Math.max(
      0,
      Number(episode.playbackProgress?.progress ?? episode.playbackProgress) ||
        0
    ),
  };
}

/**
 * 适配播客节目为 YesPlayMusic 专辑/歌单对象
 */
export function adaptPodcastToPlaylist(podcast, episodes = []) {
  if (!podcast?.pid) return null;

  const coverUrl =
    podcast.image?.largePicUrl ||
    podcast.image?.picUrl ||
    podcast.image?.thumbnailUrl ||
    '';

  const adaptedTracks = (episodes || []).map(ep =>
    adaptEpisodeToTrack(ep, podcast)
  );

  return {
    id: `xyz_pod_${podcast.pid}`,
    pid: podcast.pid,
    type: 'podcast',
    isPodcast: true,
    name: podcast.title,
    title: podcast.title,
    coverImgUrl: coverUrl,
    picUrl: coverUrl,
    description: podcast.description || podcast.brief || '',
    brief: podcast.brief || '',
    trackCount: podcast.episodeCount || adaptedTracks.length,
    subscribed: podcast.subscribed || false,
    subscriptionCount: podcast.subscriptionCount || 0,
    creator: {
      userId: podcast.author || '',
      nickname:
        podcast.author ||
        (podcast.hosts && podcast.hosts[0]?.nickname) ||
        '主播',
      avatarUrl: coverUrl,
    },
    tracks: adaptedTracks,
  };
}

// API list responses may carry pagination beside data, or nest the list in data.
export function xyzList(response) {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== 'object') return [];
  for (const key of ['data', 'items', 'list']) {
    if (Array.isArray(response[key])) return response[key];
  }
  return response.data ? xyzList(response.data) : [];
}

export function adaptDiscovery(response) {
  const episodes = new Map();
  const podcasts = new Map();
  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const episode = value.episode || (value.eid ? value : null);
    if (episode?.eid) {
      const track = adaptEpisodeToTrack(
        episode,
        value.podcast || episode.podcast
      );
      episodes.set(track.id, track);
      const podcast = value.podcast || episode.podcast;
      if (podcast?.pid)
        podcasts.set(podcast.pid, adaptPodcastToPlaylist(podcast));
      return;
    }
    const podcast = value.podcast || (value.pid ? value : null);
    if (podcast?.pid) {
      podcasts.set(podcast.pid, adaptPodcastToPlaylist(podcast));
      return;
    }
    // Walk only API content containers, not banners, author profiles or comments.
    for (const key of ['data', 'items', 'list', 'target', 'picks']) {
      if (value[key]) visit(value[key]);
    }
  }
  visit(response);
  return { episodes: [...episodes.values()], podcasts: [...podcasts.values()] };
}

export function adaptRanking(response) {
  return xyzList(response)
    .map(entry => {
      const item = entry.item || entry.episode || entry.podcast || entry;
      return item.eid
        ? adaptEpisodeToTrack(item)
        : adaptPodcastToPlaylist(item);
    })
    .filter(Boolean);
}

export function xyzCursor(response) {
  return response?.loadMoreKey || response?.data?.loadMoreKey || null;
}

export function formatPlayCount(count) {
  if (!Number.isFinite(count) || count < 0) return '';
  const value =
    count >= 100000000
      ? `${Number((count / 100000000).toFixed(1))}亿`
      : count >= 10000
      ? `${Number((count / 10000).toFixed(1))}万`
      : Math.floor(count).toLocaleString('zh-CN');
  return `${value}次收听`;
}
