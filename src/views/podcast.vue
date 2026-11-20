<template>
  <div class="podcast-detail-page" :aria-busy="loading">
    <div v-if="loading && !show" class="status-box" role="status">
      正在解析 RSS 播客源...
    </div>
    <div v-if="errorMessage" role="alert">
      {{ errorMessage }}
      <button class="retry-btn" @click="fetchData(true)">重试</button>
    </div>

    <div v-if="show" class="podcast-info">
      <img
        :src="podcast.coverImgUrl || fallbackCover"
        class="podcast-cover"
        loading="lazy"
      />
      <div class="info">
        <div class="title">{{ podcast.name }}</div>
        <div class="hosts">
          <span>RSS 播客 · {{ podcast.author || '播客主播' }}</span>
          <span
            v-if="podcast.categories && podcast.categories.length"
            class="cat-badge"
          >
            {{ podcast.categories[0] }}
          </span>
        </div>
        <div class="date-and-count">
          <span>共 {{ episodes.length }} 集</span>
          <span v-if="feedUrl"> · {{ feedHost }}</span>
        </div>
        <div
          class="description"
          :class="{ expanded: isDescExpanded }"
          @click="isDescExpanded = !isDescExpanded"
        >
          {{ podcast.description || '暂无节目简介' }}
        </div>
        <div class="buttons">
          <ButtonTwoTone icon-class="play" @click.native="playAllEpisodes">
            播放全部
          </ButtonTwoTone>
          <ButtonTwoTone
            :icon-class="subscribed ? 'heart-solid' : 'heart'"
            :color="subscribed ? 'blue' : 'grey'"
            @click.native="toggleSubscribe"
          >
            {{ subscribed ? '已订阅' : '订阅节目' }}
          </ButtonTwoTone>
          <ButtonTwoTone
            :icon-class="order === 'desc' ? 'arrow-down' : 'arrow-up'"
            color="grey"
            @click.native="toggleOrder"
          >
            {{ order === 'desc' ? '最新在前' : '最早在前' }}
          </ButtonTwoTone>
          <button
            type="button"
            class="util-btn"
            :disabled="loading"
            @click="fetchData(true)"
          >
            {{ loading ? '刷新中...' : '刷新 RSS' }}
          </button>
          <button
            v-if="feedUrl"
            type="button"
            class="util-btn"
            @click="copyFeedUrl"
          >
            复制 RSS
          </button>
        </div>
      </div>
    </div>

    <!-- 单集搜索筛选 -->
    <div v-if="show && episodes.length > 0" class="episode-toolbar">
      <input
        v-model="filterQuery"
        type="search"
        class="episode-filter-input"
        placeholder="在当前节目单集中按标题筛选..."
      />
      <span class="filter-count">
        显示 {{ visibleEpisodes.length }} / {{ filteredEpisodes.length }} 集
      </span>
    </div>

    <!-- 单集列表 -->
    <div v-if="show" class="episodes-container">
      <div class="list-header">
        <div class="col-index">#</div>
        <div class="col-title">单集标题</div>
        <div class="col-date">发布日期</div>
        <div class="col-time">时长</div>
        <div class="col-action">操作</div>
      </div>

      <div
        v-for="(ep, index) in visibleEpisodes"
        :key="ep.id"
        class="episode-item"
        :class="{ active: isPlayingCurrent(ep) }"
        @click="playEpisode(ep)"
      >
        <div class="col-index">
          <span v-if="!isPlayingCurrent(ep)">{{ index + 1 }}</span>
          <svg-icon
            v-else
            :icon-class="$store.state.player.playing ? 'volume' : 'pause'"
            class="playing-icon"
          />
        </div>
        <div class="col-title">
          <div class="ep-main-title">{{ ep.name }}</div>
          <div class="ep-sub-row">
            <span v-if="getLocalProgress(ep.eid) > 0" class="ep-progress">
              已听 {{ Math.floor(getLocalProgress(ep.eid) / 60) }} 分钟
            </span>
            <button
              v-if="ep.showNotes"
              class="ep-snippet view-notes-btn"
              @click.stop="toggleShowNotes(ep)"
            >
              节目笔记
            </button>
          </div>
        </div>
        <div class="col-date">{{ formatDateFull(ep.pubDate) }}</div>
        <div class="col-time">{{ formatDurationText(ep.duration) }}</div>
        <div class="col-action">
          <button
            class="mini-btn"
            :title="
              isPlayingCurrent(ep) && $store.state.player.playing
                ? '暂停'
                : '播放'
            "
            :aria-label="
              (isPlayingCurrent(ep) && $store.state.player.playing
                ? '暂停：'
                : '播放：') + ep.name
            "
            @click.stop="playEpisode(ep)"
          >
            <svg-icon
              :icon-class="
                isPlayingCurrent(ep) && $store.state.player.playing
                  ? 'pause'
                  : 'play'
              "
            />
          </button>
        </div>
      </div>
    </div>

    <button
      v-if="visibleEpisodes.length < filteredEpisodes.length"
      class="load-more-btn"
      @click="displayCount += 50"
    >
      加载更多单集（剩余
      {{ filteredEpisodes.length - visibleEpisodes.length }} 集）
    </button>

    <p v-if="show && !loading && !filteredEpisodes.length" class="empty-tip">
      {{ filterQuery ? '没有匹配筛选条件的单集' : '该 RSS 源暂无可播放单集' }}
    </p>

    <!-- Show Notes 弹窗 -->
    <Modal
      :show="showNotesModal"
      :close="() => (showNotesModal = false)"
      :title="activeEpisode ? activeEpisode.name : 'Show Notes'"
      width="45vw"
      :show-footer="false"
    >
      <div v-if="activeEpisode" class="notes-modal-content">
        <div class="notes-meta">
          <span>时长：{{ formatDurationText(activeEpisode.duration) }}</span>
          <span v-if="activeEpisode.pubDate">
            · 发布：{{ formatDateFull(activeEpisode.pubDate) }}
          </span>
        </div>
        <div
          class="notes-body"
          v-html="formatShowNotes(activeEpisode.showNotes)"
        ></div>
        <button class="modal-play-btn" @click="playEpisode(activeEpisode)">
          <svg-icon icon-class="play" />
          <span>立即播放本集</span>
        </button>
      </div>
    </Modal>
  </div>
</template>

<script>
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import Modal from '@/components/Modal.vue';
import { podcastApi, podcastErrorMessage } from '@/podcast/client';
import {
  adaptEpisodeToTrack,
  adaptPodcastToPlaylist,
  formatDurationText,
  formatDateFull,
  FALLBACK_COVER,
} from '@/podcast/adapter';
import { formatShowNotes } from '@/podcast/notes';
import {
  getFeedUrlByPid,
  registerFeedUrl,
  isSubscribed,
  subscribePodcast,
  unsubscribePodcast,
  getEpisodeProgress,
  mergeLatestEpisodes,
} from '@/podcast/storage';

export default {
  name: 'PodcastDetail',
  components: {
    ButtonTwoTone,
    Modal,
  },
  data() {
    return {
      fallbackCover: FALLBACK_COVER,
      show: false,
      pid: '',
      feedUrl: '',
      podcast: {},
      episodes: [],
      order: 'desc',
      filterQuery: '',
      displayCount: 50,
      isDescExpanded: false,
      showNotesModal: false,
      activeEpisode: null,
      loading: false,
      errorMessage: '',
      subscribed: false,
      requestId: 0,
    };
  },
  computed: {
    feedHost() {
      try {
        return new URL(this.feedUrl).host;
      } catch (e) {
        return '';
      }
    },
    sortedEpisodes() {
      const list = this.episodes.slice();
      list.sort((a, b) => {
        const ta = Date.parse(a.pubDate) || 0;
        const tb = Date.parse(b.pubDate) || 0;
        return this.order === 'desc' ? tb - ta : ta - tb;
      });
      return list;
    },
    filteredEpisodes() {
      const q = this.filterQuery.trim().toLowerCase();
      if (!q) return this.sortedEpisodes;
      return this.sortedEpisodes.filter(ep =>
        String(ep.name || '')
          .toLowerCase()
          .includes(q)
      );
    },
    visibleEpisodes() {
      return this.filteredEpisodes.slice(0, this.displayCount);
    },
  },
  watch: {
    '$route.params.id': {
      immediate: true,
      handler(id) {
        this.pid = id || '';
        this.show = false;
        this.episodes = [];
        this.filterQuery = '';
        this.displayCount = 50;
        this.fetchData(false);
      },
    },
  },
  methods: {
    formatShowNotes,
    formatDurationText,
    formatDateFull,
    getLocalProgress(eid) {
      return getEpisodeProgress(eid);
    },
    async resolveFeedUrl() {
      const fromQuery = this.$route.query && this.$route.query.feed;
      if (fromQuery) {
        registerFeedUrl(this.pid, fromQuery);
        return fromQuery;
      }
      const fromStore = getFeedUrlByPid(this.pid);
      if (fromStore) return fromStore;

      if (String(this.pid).startsWith('itunes_')) {
        const itunesId = String(this.pid).replace(/^itunes_/, '');
        const resolved = await podcastApi.lookupByIds([itunesId]);
        if (resolved && resolved.length > 0 && resolved[0].feedUrl) {
          registerFeedUrl(resolved[0].pid, resolved[0].feedUrl, resolved[0]);
          return resolved[0].feedUrl;
        }
      }
      throw new Error(
        '未找到该节目的 RSS 地址，请从播客页重新打开或添加 RSS 源'
      );
    },
    async fetchData(forceRefresh = false) {
      const request = ++this.requestId;
      this.loading = true;
      this.errorMessage = '';
      try {
        const url = await this.resolveFeedUrl();
        if (request !== this.requestId) return;
        this.feedUrl = url;

        const res = await podcastApi.fetchFeed(url, forceRefresh);
        if (request !== this.requestId) return;

        const adapted = adaptPodcastToPlaylist(res.podcast, res.episodes);
        this.podcast = adapted;
        this.episodes = (res.episodes || [])
          .map(ep => adaptEpisodeToTrack(ep, res.podcast))
          .filter(Boolean);
        registerFeedUrl(adapted.pid, adapted.feedUrl, adapted);
        this.subscribed = isSubscribed(adapted.feedUrl || adapted.pid);
        if (this.subscribed) {
          const updated = subscribePodcast({
            ...adapted,
            episodeCount: this.episodes.length,
            latestPubDate: this.episodes[0]
              ? this.episodes[0].pubDate || ''
              : '',
          });
          mergeLatestEpisodes(updated, res.episodes || []);
        }
        this.show = true;
      } catch (err) {
        if (request === this.requestId) {
          this.errorMessage = podcastErrorMessage(err);
        }
      } finally {
        if (request === this.requestId) this.loading = false;
      }
    },
    toggleSubscribe() {
      if (!this.podcast || !this.podcast.feedUrl) return;
      if (this.subscribed) {
        unsubscribePodcast(this.podcast.feedUrl);
        this.subscribed = false;
        this.$store.dispatch('showToast', `已取消订阅「${this.podcast.name}」`);
      } else {
        const entry = subscribePodcast({
          ...this.podcast,
          episodeCount: this.episodes.length,
          latestPubDate: this.episodes[0] ? this.episodes[0].pubDate || '' : '',
        });
        mergeLatestEpisodes(entry, this.episodes);
        this.subscribed = true;
        this.$store.dispatch('showToast', `已订阅「${this.podcast.name}」`);
      }
    },
    toggleOrder() {
      this.order = this.order === 'desc' ? 'asc' : 'desc';
    },
    copyFeedUrl() {
      if (!this.feedUrl) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(this.feedUrl)
          .then(() => {
            this.$store.dispatch('showToast', '已复制 RSS 订阅链接');
          })
          .catch(() => {
            this.$store.dispatch('showToast', this.feedUrl);
          });
      } else {
        this.$store.dispatch('showToast', this.feedUrl);
      }
    },
    async playEpisode(ep) {
      try {
        const player = this.$store.state.player;
        if (player.currentTrack.id === ep.id && player._howler) {
          player.playOrPause();
          return;
        }
        await player.playPodcastEpisode(ep, this.sortedEpisodes);
      } catch (error) {
        this.errorMessage = podcastErrorMessage(error);
      }
    },
    playAllEpisodes() {
      if (this.filteredEpisodes.length > 0) {
        this.playEpisode(this.filteredEpisodes[0]);
      }
    },
    isPlayingCurrent(ep) {
      const player = this.$store.state.player;
      return player && player.currentTrack && player.currentTrack.id === ep.id;
    },
    toggleShowNotes(ep) {
      this.activeEpisode = ep;
      this.showNotesModal = true;
    },
  },
};
</script>

<style lang="scss" scoped>
.podcast-detail-page {
  box-sizing: border-box;
  width: calc(100% - 96px);
  max-width: 1240px;
  margin: 0 auto;
  padding: 20px 0 112px;
  color: var(--color-text);

  .status-box {
    padding: 48px 0;
    text-align: center;
    opacity: 0.7;
  }

  [role='alert'] {
    padding: 16px;
    margin-bottom: 20px;
    border-radius: 9px;
    background: var(--color-secondary-bg);
    line-height: 1.6;

    .retry-btn {
      margin-left: 12px;
      padding: 6px 14px;
      border-radius: 8px;
      border: none;
      background: var(--color-primary-bg);
      color: var(--color-primary);
      font-weight: 600;
      cursor: pointer;
    }
  }

  .podcast-info {
    display: flex;
    gap: 28px;
    margin: 20px 0 32px;

    .podcast-cover {
      width: 200px;
      height: 200px;
      border-radius: 14px;
      object-fit: cover;
      flex-shrink: 0;
      background: var(--color-secondary-bg);
    }

    .info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;

      .title {
        font-size: 30px;
        font-weight: 700;
        line-height: 1.25;
        letter-spacing: -0.5px;
      }

      .hosts {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        font-size: 15px;
        font-weight: 600;
        opacity: 0.88;
        margin-top: 10px;

        .cat-badge {
          font-size: 12px;
          padding: 2px 10px;
          border-radius: 12px;
          background: var(--color-primary-bg);
          color: var(--color-primary);
        }
      }

      .date-and-count {
        font-size: 13px;
        opacity: 0.6;
        margin-top: 8px;
      }

      .description {
        font-size: 14px;
        opacity: 0.72;
        margin-top: 12px;
        line-height: 1.6;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        cursor: pointer;

        &.expanded {
          display: block;
        }
      }

      .buttons {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }

      .util-btn {
        height: 40px;
        padding: 0 14px;
        border-radius: 8px;
        border: none;
        background: var(--color-secondary-bg);
        color: var(--color-text);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;

        &:hover {
          opacity: 0.85;
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    }
  }

  .episode-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;

    .episode-filter-input {
      flex: 1;
      max-width: 360px;
      height: 38px;
      padding: 0 12px;
      border-radius: 9px;
      border: 1px solid var(--color-secondary-bg);
      background: var(--color-secondary-bg);
      color: var(--color-text);
      font-size: 14px;
    }

    .filter-count {
      font-size: 13px;
      opacity: 0.6;
    }
  }

  .episodes-container {
    .list-header {
      display: flex;
      padding: 10px 12px;
      font-size: 13px;
      opacity: 0.55;
      border-bottom: 1px solid var(--color-secondary-bg);
      margin-bottom: 6px;
    }

    .col-index {
      width: 36px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .col-title {
      flex: 1;
      min-width: 0;
      padding: 0 12px;
    }

    .col-date {
      width: 112px;
      flex-shrink: 0;
      opacity: 0.65;
      font-size: 13px;
    }

    .col-time {
      width: 78px;
      flex-shrink: 0;
      opacity: 0.65;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }

    .col-action {
      width: 56px;
      flex-shrink: 0;
      text-align: right;
    }

    .playing-icon {
      display: block;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .episode-item {
      display: flex;
      align-items: center;
      min-height: 76px;
      box-sizing: border-box;
      padding: 14px 12px;
      border-radius: 9px;
      cursor: pointer;
      transition: background 0.15s ease;

      &:hover {
        background: var(--color-secondary-bg);
      }

      &.active {
        background: var(--color-primary-bg);
        color: var(--color-primary);
        box-shadow: inset 3px 0 var(--color-primary);

        .ep-main-title {
          font-weight: 600;
        }
      }

      .ep-main-title {
        font-size: 15px;
        line-height: 1.5;
      }

      .ep-sub-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 4px;
      }

      .ep-progress {
        font-size: 12px;
        opacity: 0.65;
      }

      .ep-snippet {
        display: inline-flex;
        align-items: center;
        padding: 2px 0;
        background: transparent;
        border: 0;
        font-size: 12px;
        color: var(--color-primary);
        cursor: pointer;

        &:hover {
          text-decoration: underline;
        }
      }

      .mini-btn {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        border: none;
        background: var(--color-primary-bg);
        color: var(--color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: auto;
        cursor: pointer;

        svg {
          display: block;
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }
      }
    }
  }

  .load-more-btn {
    display: block;
    margin: 24px auto;
    padding: 12px 24px;
    min-height: 44px;
    border: 0;
    border-radius: 9px;
    background: var(--color-secondary-bg);
    color: var(--color-text);
    font-weight: 600;
    cursor: pointer;
  }

  .empty-tip {
    text-align: center;
    padding: 40px 0;
    opacity: 0.65;
  }

  .notes-modal-content {
    padding: 8px 4px 16px;
    color: var(--color-text);

    .notes-meta {
      font-size: 13px;
      opacity: 0.65;
      margin-bottom: 16px;
    }

    .notes-body {
      font-size: 14px;
      line-height: 1.7;
      max-height: 60vh;
      overflow-y: auto;
      padding-right: 8px;
      opacity: 0.88;

      ::v-deep img {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
      }

      ::v-deep a {
        color: var(--color-primary);
        text-decoration: underline;
      }
    }

    .modal-play-btn {
      margin-top: 24px;
      width: 100%;
      height: 44px;
      border-radius: 10px;
      border: none;
      background: var(--color-primary);
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;

      svg {
        width: 18px;
        height: 18px;
      }
    }
  }

  @media (max-width: 1050px) {
    width: calc(100% - 48px);
  }

  @media (max-width: 680px) {
    width: calc(100% - 32px);

    .podcast-info {
      flex-direction: column;
      gap: 20px;

      .podcast-cover {
        width: 140px;
        height: 140px;
      }

      .info .title {
        font-size: 24px;
      }
    }

    .episodes-container .col-date {
      display: none;
    }
  }
}
</style>
