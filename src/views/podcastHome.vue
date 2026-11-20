<template>
  <div class="podcast-page">
    <div class="header-section">
      <div class="title-area">
        <h1>播客</h1>
        <div class="subtitle">
          基于开放 RSS / OPML 标准，无需登录第三方账号，本地订阅与断点续听。
        </div>
      </div>

      <div class="header-actions">
        <button class="action-btn primary-action" @click="openRssModal('rss')">
          <svg-icon icon-class="plus" />
          <span>添加 RSS</span>
        </button>
        <button
          class="action-btn secondary-action"
          @click="openRssModal('opml')"
        >
          <span>OPML 导入/导出</span>
        </button>
      </div>
    </div>

    <!-- 标签栏 -->
    <div class="tab-buttons">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: currentTab === tab.id }"
        @click="switchTab(tab.id)"
      >
        {{ tab.name }}
        <span
          v-if="tab.id === 'subscriptions' && subscriptions.length > 0"
          class="tab-count"
          >{{ subscriptions.length }}</span
        >
      </button>
    </div>

    <div v-if="errorMessage" class="empty-state" role="alert">
      {{ errorMessage }}
      <button class="action-btn" :disabled="loading" @click="retryCurrentTab">
        重试
      </button>
    </div>

    <!-- 我的订阅 -->
    <div v-if="currentTab === 'subscriptions'" class="tab-content">
      <div v-if="subscriptions.length === 0" class="empty-state">
        <div class="empty-text">
          还没有本地 RSS 播客订阅。你可以直接粘贴 RSS 链接、导入 OPML
          文件，或在「热门榜单」「搜索播客」中一键订阅。
        </div>
        <div class="empty-actions">
          <button
            class="action-btn primary-action"
            @click="openRssModal('rss')"
          >
            添加 RSS 链接
          </button>
          <button
            class="action-btn secondary-action"
            @click="openRssModal('opml')"
          >
            导入 OPML
          </button>
          <button
            class="action-btn secondary-action"
            @click="switchTab('charts')"
          >
            浏览热门榜单
          </button>
        </div>
      </div>

      <div v-else>
        <div class="section">
          <div class="section-header">
            <h2>已订阅节目 ({{ subscriptions.length }})</h2>
            <button
              class="action-btn secondary-action"
              :disabled="refreshingSubs"
              @click="refreshAllSubscriptions"
            >
              {{ refreshingSubs ? refreshProgressText : '刷新全部 RSS' }}
            </button>
          </div>
          <div class="podcast-grid">
            <div
              v-for="pod in subscriptions"
              :key="pod.pid"
              class="podcast-card"
              @click="openPodcast(pod)"
            >
              <div class="cover-wrapper">
                <img
                  :src="pod.coverImgUrl || fallbackCover"
                  class="pod-cover"
                  loading="lazy"
                />
                <button
                  class="pod-play-btn"
                  title="播放最新单集"
                  @click.stop="playPodcastLatest(pod)"
                >
                  <svg-icon icon-class="play" />
                </button>
              </div>
              <div class="pod-title" :title="pod.title">{{ pod.title }}</div>
              <div class="pod-brief" :title="pod.author || pod.feedUrl">
                {{
                  pod.episodeCount
                    ? `${pod.episodeCount} 集${
                        pod.author ? ` · ${pod.author}` : ''
                      }`
                    : pod.author || '标准 RSS 订阅'
                }}
              </div>
            </div>
          </div>
        </div>

        <div v-if="latestSubscribedEpisodes.length > 0" class="section">
          <h2>订阅最新更新</h2>
          <div class="episodes-grid">
            <div
              v-for="ep in latestSubscribedEpisodes"
              :key="ep.id"
              class="episode-card"
              @click="playEpisodeItem(ep)"
            >
              <img
                :src="ep.coverImgUrl || fallbackCover"
                class="ep-cover"
                loading="lazy"
              />
              <div class="ep-info">
                <div class="ep-title" :title="ep.title">{{ ep.title }}</div>
                <div class="ep-podcast">{{ ep.podcastTitle }}</div>
                <div class="ep-meta">
                  <span>{{ formatShortDuration(ep.duration) }}</span>
                  <span v-if="ep.pubDate">
                    · {{ formatDateShort(ep.pubDate) }}</span
                  >
                </div>
              </div>
              <button
                class="play-circle-btn"
                title="播放"
                @click.stop="playEpisodeItem(ep)"
              >
                <svg-icon icon-class="play" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 热门榜单（Apple Podcasts 公开 RSS 榜） -->
    <div v-else-if="currentTab === 'charts'" class="tab-content">
      <div class="ranking-heading">
        <div>
          <h2>{{ chartTitle || '热门播客榜' }}</h2>
          <p>
            来自 Apple Podcasts 公开播客目录，自动关联标准 RSS
            源，无需登录即可直接订阅与收听。
          </p>
          <span v-if="chartUpdated" class="ranking-date">
            {{ formatDateShort(chartUpdated) }} 更新 ·
            {{ chartItems.length }} 档节目
          </span>
        </div>

        <div class="ranking-controls">
          <select
            v-model="chartCountry"
            class="region-select"
            aria-label="榜单地区"
            @change="loadCharts()"
          >
            <option v-for="c in countries" :key="c.code" :value="c.code">
              {{ c.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="genre-pills" role="tablist" aria-label="播客分类">
        <button
          v-for="g in genres"
          :key="g.id"
          class="rank-pill"
          :class="{ active: chartGenre === g.id }"
          @click="changeChartGenre(g.id)"
        >
          {{ g.name }}
        </button>
      </div>

      <div v-if="loading" class="loading-state" role="status">
        正在加载公开播客榜单...
      </div>
      <div v-else-if="!chartItems.length && !errorMessage" class="empty-state">
        暂时没有获取到榜单内容，请切换地区或稍后重试。
      </div>
      <div v-else class="ranking-list">
        <div
          v-for="(pod, index) in chartItems"
          :key="pod.pid || pod.itunesId"
          class="ranking-row"
          :class="{ 'top-three': index < 3 }"
          @click="openPodcast(pod)"
        >
          <span class="ranking-number">{{
            String(index + 1).padStart(2, '0')
          }}</span>
          <img
            :src="pod.coverImgUrl || fallbackCover"
            alt=""
            class="ranking-cover"
            loading="lazy"
          />
          <span class="ranking-copy">
            <span class="ranking-title" :title="pod.title">{{
              pod.title
            }}</span>
            <span class="ranking-podcast">{{ pod.author || '播客主播' }}</span>
            <span class="ranking-duration">
              <template v-if="pod.categories && pod.categories.length">{{
                pod.categories[0]
              }}</template>
              <template v-if="pod.episodeCount">
                · {{ pod.episodeCount }} 集</template
              >
            </span>
          </span>
          <button
            class="sub-pill-btn"
            :class="{ subscribed: isPodSubscribed(pod) }"
            :disabled="!pod.feedUrl && !pod.itunesId"
            @click.stop="toggleSubscribeFromList(pod)"
          >
            {{ isPodSubscribed(pod) ? '已订阅' : '+ 订阅' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 搜索播客 -->
    <div v-else-if="currentTab === 'search'" class="tab-content">
      <form class="search-form" @submit.prevent="performSearch">
        <input
          id="podcast-search"
          v-model="keyword"
          required
          maxlength="300"
          placeholder="输入播客/单集关键词，或直接粘贴 RSS 链接"
        />
        <select v-model="searchCountry" aria-label="搜索地区">
          <option v-for="c in countries" :key="c.code" :value="c.code">
            {{ c.name }}
          </option>
        </select>
        <select
          v-model="searchEntity"
          aria-label="搜索类型"
          @change="
            searchResults = [];
            searched = false;
          "
        >
          <option value="podcast">节目</option>
          <option value="podcastEpisode">单集</option>
        </select>
        <button
          class="action-btn primary-action"
          :disabled="loading || !keyword.trim()"
        >
          搜索
        </button>
      </form>

      <div v-if="loading" class="loading-state" role="status">搜索中...</div>
      <div v-else-if="searched && !searchResults.length" class="empty-state">
        没有找到匹配的公开播客，试试更换关键词或地区，或点击右上角「添加
        RSS」直接输入订阅源。
      </div>
      <div v-else-if="searchEntity === 'podcast'" class="search-results">
        <div
          v-for="item in searchResults"
          :key="item.pid"
          class="search-result"
          @click="openPodcast(item)"
        >
          <img
            :src="item.coverImgUrl || fallbackCover"
            :alt="item.title"
            loading="lazy"
          />
          <div class="search-copy">
            <div class="search-title">{{ item.title }}</div>
            <div class="search-sub">
              {{ item.author || '播客' }}
              <template v-if="item.episodeCount">
                · {{ item.episodeCount }} 集</template
              >
              <template v-if="item.categories && item.categories.length">
                · {{ item.categories[0] }}</template
              >
            </div>
          </div>
          <button
            class="sub-pill-btn"
            :class="{ subscribed: isPodSubscribed(item) }"
            @click.stop="toggleSubscribeFromList(item)"
          >
            {{ isPodSubscribed(item) ? '已订阅' : '+ 订阅' }}
          </button>
        </div>
      </div>
      <div v-else class="episodes-grid">
        <div
          v-for="ep in searchResults"
          :key="ep.eid"
          class="episode-card"
          @click="playEpisodeItem(ep)"
        >
          <img
            :src="ep.coverImgUrl || fallbackCover"
            class="ep-cover"
            loading="lazy"
          />
          <div class="ep-info">
            <div class="ep-title" :title="ep.title">{{ ep.title }}</div>
            <div class="ep-podcast">{{ ep.podcastTitle }}</div>
            <div class="ep-meta">
              <span>{{ formatShortDuration(ep.duration) }}</span>
              <span v-if="ep.pubDate">
                · {{ formatDateShort(ep.pubDate) }}</span
              >
            </div>
          </div>
          <button
            class="play-circle-btn"
            title="播放"
            @click.stop="playEpisodeItem(ep)"
          >
            <svg-icon icon-class="play" />
          </button>
        </div>
      </div>
    </div>

    <!-- 本地收听历史 -->
    <div v-else-if="currentTab === 'history'" class="tab-content">
      <div v-if="historyEpisodes.length === 0" class="empty-state">
        暂无本地收听历史，开始播放任意播客单集后将自动记录断点进度。
      </div>
      <div v-else>
        <div class="section-header">
          <h2>最近收听 ({{ historyEpisodes.length }})</h2>
          <button
            class="action-btn secondary-action"
            @click="handleClearHistory"
          >
            清空历史
          </button>
        </div>
        <div class="episodes-grid">
          <div
            v-for="ep in historyEpisodes"
            :key="ep.eid"
            class="episode-card"
            @click="playEpisodeItem(ep)"
          >
            <img
              :src="ep.coverImgUrl || fallbackCover"
              class="ep-cover"
              loading="lazy"
            />
            <div class="ep-info">
              <div class="ep-title" :title="ep.title">{{ ep.title }}</div>
              <div class="ep-podcast">{{ ep.podcastTitle }}</div>
              <div class="ep-meta">
                <span>{{ formatShortDuration(ep.duration) }}</span>
                <span v-if="ep.completed"> · 已播完</span>
                <span v-else-if="ep.playbackProgress > 0">
                  · 已听 {{ Math.floor(ep.playbackProgress / 60) }} 分钟
                </span>
              </div>
            </div>
            <button
              class="remove-history-btn"
              title="从历史移除"
              @click.stop="handleRemoveHistory(ep.eid)"
            >
              <svg-icon icon-class="x" />
            </button>
            <button
              class="play-circle-btn"
              title="继续播放"
              @click.stop="playEpisodeItem(ep)"
            >
              <svg-icon icon-class="play" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <ModalAddRss
      :show.sync="showRssModal"
      :initial-mode="rssModalMode"
      :initial-url="rssModalInitialUrl"
      @subscribed="handleRssSubscribed"
      @imported="handleOpmlImported"
    />
  </div>
</template>

<script>
import ModalAddRss from '@/components/ModalAddRss.vue';
import { podcastApi, podcastErrorMessage } from '@/podcast/client';
import {
  adaptEpisodeToTrack,
  formatShortDuration,
  formatDateShort,
  FALLBACK_COVER,
} from '@/podcast/adapter';
import {
  getSubscriptions,
  isSubscribed,
  subscribePodcast,
  unsubscribePodcast,
  registerFeedUrl,
  getListeningHistory,
  removeHistoryItem,
  clearListeningHistory,
  mergeLatestEpisodes,
  getLatestSubscribedEpisodes,
} from '@/podcast/storage';

const COUNTRIES = [
  { code: 'CN', name: '中国大陆' },
  { code: 'TW', name: '中国台湾' },
  { code: 'HK', name: '中国香港' },
  { code: 'US', name: '美国' },
  { code: 'JP', name: '日本' },
];

const GENRES = [
  { id: '', name: '总榜' },
  { id: '1324', name: '社会与文化' },
  { id: '1321', name: '商业' },
  { id: '1318', name: '科技' },
  { id: '1301', name: '艺术' },
  { id: '1303', name: '喜剧' },
  { id: '1487', name: '历史' },
  { id: '1489', name: '新闻' },
  { id: '1304', name: '教育' },
];

export default {
  name: 'PodcastHome',
  components: {
    ModalAddRss,
  },
  data() {
    return {
      fallbackCover: FALLBACK_COVER,
      countries: COUNTRIES,
      genres: GENRES,
      currentTab: 'charts',
      tabs: [
        { id: 'subscriptions', name: '我的订阅' },
        { id: 'charts', name: '热门榜单' },
        { id: 'search', name: '搜索播客' },
        { id: 'history', name: '收听历史' },
      ],
      showRssModal: false,
      rssModalMode: 'rss',
      rssModalInitialUrl: '',
      loading: false,
      errorMessage: '',
      requestId: 0,
      subscriptions: [],
      latestSubscribedEpisodes: [],
      refreshingSubs: false,
      refreshProgressText: '刷新中...',
      chartCountry: 'CN',
      chartGenre: '',
      chartTitle: '',
      chartUpdated: '',
      chartItems: [],
      keyword: '',
      searchCountry: 'CN',
      searchEntity: 'podcast',
      searched: false,
      searchResults: [],
      historyEpisodes: [],
    };
  },
  created() {
    this.reloadLocalState();
    this.currentTab =
      this.subscriptions.length > 0 ? 'subscriptions' : 'charts';
    if (this.currentTab === 'charts') {
      this.loadCharts();
    }
  },
  activated() {
    this.reloadLocalState();
  },
  methods: {
    formatShortDuration,
    formatDateShort,
    reloadLocalState() {
      this.subscriptions = getSubscriptions();
      this.latestSubscribedEpisodes = getLatestSubscribedEpisodes();
      this.historyEpisodes = getListeningHistory();
    },
    openRssModal(mode = 'rss', initialUrl = '') {
      this.rssModalMode = mode;
      this.rssModalInitialUrl = initialUrl;
      this.showRssModal = true;
    },
    switchTab(tabId) {
      this.currentTab = tabId;
      this.errorMessage = '';
      if (tabId === 'subscriptions' || tabId === 'history') {
        this.reloadLocalState();
      } else if (tabId === 'charts' && this.chartItems.length === 0) {
        this.loadCharts();
      }
    },
    retryCurrentTab() {
      if (this.currentTab === 'charts') this.loadCharts(true);
      else if (this.currentTab === 'search') this.performSearch();
      else if (this.currentTab === 'subscriptions')
        this.refreshAllSubscriptions();
    },
    changeChartGenre(genreId) {
      this.chartGenre = genreId;
      this.loadCharts();
    },
    async loadCharts(forceRefresh = false) {
      const request = ++this.requestId;
      this.loading = true;
      this.errorMessage = '';
      try {
        const res = await podcastApi.getTopCharts({
          country: this.chartCountry,
          genre: this.chartGenre,
          limit: 30,
          forceRefresh,
        });
        if (request !== this.requestId) return;
        this.chartTitle = res.title || '热门播客榜';
        this.chartUpdated = res.updated || '';
        this.chartItems = Array.isArray(res.items) ? res.items : [];
      } catch (err) {
        if (request === this.requestId) {
          this.errorMessage = podcastErrorMessage(err);
        }
      } finally {
        if (request === this.requestId) this.loading = false;
      }
    },
    async performSearch() {
      const term = this.keyword.trim();
      if (!term) return;

      // 如果用户直接输入了 RSS URL，打开预览弹窗一键订阅
      if (/^https?:\/\//i.test(term)) {
        this.openRssModal('rss', term);
        return;
      }

      const request = ++this.requestId;
      this.loading = true;
      this.errorMessage = '';
      try {
        const res = await podcastApi.search({
          term,
          country: this.searchCountry,
          limit: 25,
          entity: this.searchEntity,
        });
        if (request !== this.requestId) return;
        this.searchResults = Array.isArray(res.items) ? res.items : [];
        this.searched = true;
      } catch (err) {
        if (request === this.requestId) {
          this.errorMessage = podcastErrorMessage(err);
        }
      } finally {
        if (request === this.requestId) this.loading = false;
      }
    },
    isPodSubscribed(pod) {
      if (!pod) return false;
      return isSubscribed(pod.feedUrl || pod.pid);
    },
    async resolvePodcastFeedUrl(pod) {
      if (pod.feedUrl) return pod;
      if (!pod.itunesId) {
        throw new Error('该节目暂未提供公开的 RSS 订阅源');
      }
      const list = await podcastApi.lookupByIds(
        [pod.itunesId],
        this.chartCountry
      );
      if (!list || !list.length || !list[0].feedUrl) {
        throw new Error('未能查询到该节目的公开 RSS 源地址');
      }
      return { ...pod, ...list[0] };
    },
    async toggleSubscribeFromList(pod) {
      try {
        if (this.isPodSubscribed(pod)) {
          unsubscribePodcast(pod.feedUrl || pod.pid);
          this.$store.dispatch('showToast', `已取消订阅「${pod.title}」`);
        } else {
          const resolved = await this.resolvePodcastFeedUrl(pod);
          subscribePodcast(resolved);
          this.$store.dispatch('showToast', `已订阅「${resolved.title}」`);
        }
        this.reloadLocalState();
      } catch (err) {
        this.errorMessage = podcastErrorMessage(err);
      }
    },
    async openPodcast(pod) {
      try {
        const resolved = await this.resolvePodcastFeedUrl(pod);
        const pid = registerFeedUrl(resolved.pid, resolved.feedUrl, resolved);
        this.$router.push({
          name: 'podcast',
          params: { id: pid },
          query: { feed: resolved.feedUrl },
        });
      } catch (err) {
        this.errorMessage = podcastErrorMessage(err);
      }
    },
    async playPodcastLatest(pod) {
      try {
        const resolved = await this.resolvePodcastFeedUrl(pod);
        const res = await podcastApi.fetchFeed(resolved.feedUrl);
        if (!res.episodes || !res.episodes.length) {
          this.$store.dispatch('showToast', '该节目暂无可播放单集');
          return;
        }
        const tracks = res.episodes
          .map(ep => adaptEpisodeToTrack(ep, res.podcast))
          .filter(Boolean);
        if (tracks.length > 0) {
          await this.$store.state.player.playPodcastEpisode(tracks[0], tracks);
          this.reloadLocalState();
        }
      } catch (err) {
        this.errorMessage = podcastErrorMessage(err);
      }
    },
    async playEpisodeItem(ep) {
      try {
        const track = ep.isPodcast ? ep : adaptEpisodeToTrack(ep);
        if (!track || !track.url) {
          this.$store.dispatch('showToast', '该单集缺少音频地址');
          return;
        }
        const player = this.$store.state.player;
        if (player.currentTrack.id === track.id && player._howler) {
          player.playOrPause();
          return;
        }
        await player.playPodcastEpisode(track);
        this.reloadLocalState();
      } catch (err) {
        this.errorMessage = podcastErrorMessage(err);
      }
    },
    async refreshAllSubscriptions() {
      if (this.refreshingSubs || !this.subscriptions.length) return;
      this.refreshingSubs = true;
      this.errorMessage = '';
      const subs = this.subscriptions.slice();
      let completed = 0;
      let failed = 0;
      const concurrency = 3;
      let cursor = 0;

      const worker = async () => {
        while (cursor < subs.length) {
          const sub = subs[cursor++];
          try {
            const res = await podcastApi.fetchFeed(sub.feedUrl, true);
            const episodes = res.episodes || [];
            const updated = subscribePodcast({
              ...sub,
              ...res.podcast,
              episodeCount: episodes.length,
              latestPubDate: episodes[0] ? episodes[0].pubDate || '' : '',
            });
            mergeLatestEpisodes(updated, episodes);
          } catch (e) {
            failed += 1;
          } finally {
            completed += 1;
            this.refreshProgressText = `刷新中 (${completed}/${subs.length})`;
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(concurrency, subs.length) }, worker)
      );
      this.reloadLocalState();
      this.refreshingSubs = false;
      this.refreshProgressText = '刷新中...';
      this.$store.dispatch(
        'showToast',
        failed > 0
          ? `刷新完成，${subs.length - failed} 个成功，${failed} 个源暂不可达`
          : `已刷新全部 ${subs.length} 个 RSS 订阅`
      );
    },
    handleRssSubscribed(entry) {
      this.reloadLocalState();
      this.$store.dispatch('showToast', `已订阅「${entry.title}」`);
      this.$router.push({
        name: 'podcast',
        params: { id: entry.pid },
        query: { feed: entry.feedUrl },
      });
    },
    handleOpmlImported(summary) {
      this.reloadLocalState();
      this.currentTab = 'subscriptions';
      this.$store.dispatch(
        'showToast',
        `OPML 导入完成：新增 ${summary.added} 个订阅`
      );
    },
    handleRemoveHistory(eid) {
      removeHistoryItem(eid);
      this.reloadLocalState();
    },
    handleClearHistory() {
      clearListeningHistory();
      this.reloadLocalState();
    },
  },
};
</script>

<style lang="scss" scoped>
.podcast-page {
  box-sizing: border-box;
  max-width: 1240px;
  width: calc(100% - 96px);
  margin: 0 auto;
  padding: 16px 0 112px;
  color: var(--color-text);

  .header-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 16px 0 24px;
    gap: 24px;

    h1 {
      font-size: 32px;
      font-weight: 700;
      margin: 0;
      line-height: 1.3;
      letter-spacing: -1px;
    }

    .subtitle {
      font-size: 14px;
      opacity: 0.72;
      margin-top: 8px;
    }

    .header-actions {
      display: flex;
      gap: 10px;
      flex-shrink: 0;
    }
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 40px;
    padding: 8px 18px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    white-space: nowrap;
    transition: all 0.2s ease;

    svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    &.primary-action {
      background: var(--color-primary-bg);
      color: var(--color-primary);

      &:hover {
        filter: brightness(1.08);
      }
    }

    &.secondary-action {
      background: var(--color-secondary-bg);
      color: var(--color-text);

      &:hover {
        opacity: 0.85;
      }
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .tab-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 28px;
    margin: 0 0 28px;
    border-bottom: 1px solid var(--color-secondary-bg);

    .tab-btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 12px 0 16px;
      min-height: 44px;
      border: none;
      border-radius: 0;
      background: transparent;
      color: var(--color-text);
      opacity: 0.65;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        opacity: 1;
      }

      &.active {
        color: var(--color-primary);
        opacity: 1;
      }

      &.active::after {
        content: '';
        position: absolute;
        height: 3px;
        bottom: -1px;
        left: 0;
        right: 0;
        border-radius: 3px;
        background: var(--color-primary);
      }

      .tab-count {
        font-size: 12px;
        padding: 1px 7px;
        border-radius: 10px;
        background: var(--color-secondary-bg);
        color: var(--color-text);
      }
    }
  }

  .section {
    margin-bottom: 36px;

    h2 {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 16px;
    }
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;

    h2 {
      margin: 0;
    }
  }

  .podcast-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 24px;

    .podcast-card {
      cursor: pointer;

      .cover-wrapper {
        position: relative;
        width: 100%;
        padding-top: 100%;
        border-radius: 12px;
        overflow: hidden;
        margin-bottom: 10px;
        background: var(--color-secondary-bg);

        .pod-cover {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s ease;
        }

        .pod-play-btn {
          position: absolute;
          right: 10px;
          bottom: 10px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--color-primary);
          color: #fff;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;

          svg {
            width: 16px;
            height: 16px;
          }
        }

        &:hover .pod-cover {
          transform: scale(1.04);
        }
      }

      .pod-title {
        font-size: 15px;
        font-weight: 600;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-height: 42px;
      }

      .pod-brief {
        font-size: 12px;
        opacity: 0.65;
        margin-top: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }

  .episodes-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    .episode-card {
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 88px;
      padding: 14px 16px;
      border-radius: 14px;
      background: var(--color-secondary-bg);
      cursor: pointer;
      transition: background 0.15s ease;

      &:hover {
        background: var(--color-secondary-bg-for-transparent);
      }

      .ep-cover {
        width: 64px;
        height: 64px;
        border-radius: 10px;
        object-fit: cover;
        flex-shrink: 0;
      }

      .ep-info {
        flex: 1;
        min-width: 0;

        .ep-title {
          font-size: 15px;
          font-weight: 600;
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .ep-podcast {
          font-size: 13px;
          opacity: 0.72;
          margin-top: 3px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ep-meta {
          font-size: 12px;
          opacity: 0.55;
          margin-top: 4px;
        }
      }

      .remove-history-btn {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: none;
        background: transparent;
        color: var(--color-text);
        opacity: 0.45;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;

        &:hover {
          opacity: 1;
          color: #e53e3e;
        }

        svg {
          width: 14px;
          height: 14px;
        }
      }

      .play-circle-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--color-primary);
        color: #fff;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;

        svg {
          width: 16px;
          height: 16px;
        }
      }
    }
  }

  .ranking-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 16px;

    h2 {
      font-size: 26px;
      margin: 0 0 8px;
    }

    p {
      max-width: 640px;
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 1.6;
      opacity: 0.65;
    }

    .ranking-date {
      font-size: 12px;
      opacity: 0.5;
    }
  }

  .region-select {
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid var(--color-secondary-bg);
    background: var(--color-secondary-bg);
    color: var(--color-text);
    font-size: 14px;
    font-weight: 600;
  }

  .genre-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 24px;

    .rank-pill {
      min-height: 34px;
      padding: 6px 14px;
      border-radius: 18px;
      font-size: 13px;
      font-weight: 600;
      background: var(--color-secondary-bg);
      border: none;
      color: var(--color-text);
      cursor: pointer;
      opacity: 0.75;
      transition: all 0.2s ease;

      &:hover {
        opacity: 1;
      }

      &.active {
        opacity: 1;
        background: var(--color-primary-bg);
        color: var(--color-primary);
      }
    }
  }

  .ranking-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 28px;
  }

  .ranking-row {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
    min-height: 112px;
    padding: 16px 8px;
    border-bottom: 1px solid var(--color-secondary-bg);
    cursor: pointer;
    transition: background 150ms ease;

    &:hover {
      background: var(--color-secondary-bg);
    }
  }

  .ranking-number {
    width: 26px;
    flex-shrink: 0;
    font-size: 18px;
    font-weight: 700;
    opacity: 0.35;
    font-variant-numeric: tabular-nums;
  }

  .top-three .ranking-number {
    color: var(--color-primary);
    opacity: 1;
  }

  .ranking-cover {
    width: 72px;
    height: 72px;
    border-radius: 10px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .ranking-copy {
    flex: 1;
    min-width: 0;
  }

  .ranking-title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 15px;
    line-height: 1.45;
    font-weight: 600;
  }

  .ranking-podcast {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    opacity: 0.65;
    margin-top: 4px;
  }

  .ranking-duration {
    display: block;
    font-size: 12px;
    opacity: 0.45;
    margin-top: 4px;
  }

  .sub-pill-btn {
    padding: 6px 14px;
    border-radius: 16px;
    border: none;
    background: var(--color-primary-bg);
    color: var(--color-primary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;

    &.subscribed {
      background: var(--color-secondary-bg);
      color: var(--color-text);
      opacity: 0.78;
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  .search-form {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-bottom: 24px;

    input,
    select {
      height: 42px;
      padding: 0 12px;
      background: var(--color-secondary-bg);
      color: var(--color-text);
      border-radius: 10px;
      border: 1px solid var(--color-secondary-bg);
      font-size: 14px;
    }

    input {
      flex: 1;
      min-width: 220px;
    }
  }

  .search-result {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 14px;
    margin-bottom: 10px;
    border-radius: 12px;
    background: var(--color-secondary-bg);
    cursor: pointer;
    transition: background 0.15s ease;

    &:hover {
      background: var(--color-secondary-bg-for-transparent);
    }

    img {
      width: 64px;
      height: 64px;
      border-radius: 10px;
      object-fit: cover;
      flex-shrink: 0;
    }

    .search-copy {
      flex: 1;
      min-width: 0;

      .search-title {
        font-size: 15px;
        font-weight: 600;
        line-height: 1.4;
      }

      .search-sub {
        font-size: 13px;
        opacity: 0.65;
        margin-top: 4px;
      }
    }
  }

  .empty-state,
  .loading-state {
    text-align: center;
    padding: 56px 16px;
    opacity: 0.78;
    font-size: 15px;

    .empty-text {
      max-width: 520px;
      margin: 0 auto 20px;
      line-height: 1.7;
    }

    .empty-actions {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 12px;
    }
  }

  .empty-state[role='alert'] {
    padding: 16px 20px;
    background: var(--color-secondary-bg);
    border-radius: 10px;
    text-align: left;
    line-height: 1.6;
    margin-bottom: 20px;

    .action-btn {
      margin-left: 12px;
      color: var(--color-primary);
    }
  }

  @media (max-width: 1050px) {
    width: calc(100% - 48px);

    .ranking-list {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 680px) {
    width: calc(100% - 32px);

    .header-section {
      flex-direction: column;
      align-items: flex-start;
    }

    .episodes-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
