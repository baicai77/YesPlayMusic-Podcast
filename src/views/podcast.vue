<template>
  <div class="podcast-detail-page" :aria-busy="loading">
    <div v-if="loading && !show" role="status">正在加载节目...</div>
    <div v-if="errorMessage" role="alert">
      {{ errorMessage }} <button @click="fetchData">重试</button>
    </div>
    <div v-if="show" class="podcast-info">
      <img :src="podcast.coverImgUrl" class="podcast-cover" loading="lazy" />
      <div class="info">
        <div class="title">{{ podcast.name }}</div>
        <div class="hosts">
          <span>播客 · {{ podcast.creator && podcast.creator.nickname }}</span>
        </div>
        <div class="date-and-count">
          <span
            >共 {{ podcast.trackCount || episodes.length }} 集 · 已加载
            {{ episodes.length }} 集</span
          >
          <span v-if="podcast.subscriptionCount">
            · {{ podcast.subscriptionCount }} 人订阅
          </span>
        </div>
        <div
          class="description"
          :class="{ expanded: isDescExpanded }"
          @click="isDescExpanded = !isDescExpanded"
        >
          {{ podcast.description }}
        </div>
        <div class="buttons">
          <ButtonTwoTone icon-class="play" @click.native="playAllEpisodes">
            播放全部
          </ButtonTwoTone>
          <ButtonTwoTone
            :icon-class="order === 'desc' ? 'arrow-down' : 'arrow-up'"
            color="grey"
            @click.native="toggleOrder"
          >
            {{ order === 'desc' ? '最新在前' : '最早在前' }}
          </ButtonTwoTone>
        </div>
      </div>
    </div>

    <!-- 单集列表 -->
    <div class="episodes-container">
      <div class="list-header">
        <div class="col-index">#</div>
        <div class="col-title">单集标题</div>
        <div class="col-date">发布日期</div>
        <div class="col-time">时长</div>
        <div class="col-action">操作</div>
      </div>

      <div
        v-for="(ep, index) in episodes"
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
          <div v-if="ep.playCount !== null" class="episode-listens">{{
            formatPlayCount(ep.playCount)
          }}</div>
          <button
            v-if="ep.showNotes"
            class="ep-snippet view-notes-btn"
            @click.stop="toggleShowNotes(ep)"
            >节目笔记</button
          >
        </div>
        <div class="col-date">{{ formatDate(ep.pubDate) }}</div>
        <div class="col-time">{{ formatDuration(ep.duration) }}</div>
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
    <button v-if="loadMoreKey" :disabled="loading" @click="fetchEpisodes(true)">
      {{ loading ? '加载中...' : '加载更多单集' }}
    </button>
    <p v-if="show && !loading && !episodes.length">暂无可播放单集</p>

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
          <span>时长：{{ formatDuration(activeEpisode.duration) }}</span>
          <span> · 发布：{{ formatDate(activeEpisode.pubDate) }}</span>
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
import { xyzService, xyzErrorMessage } from '@/xyz/client';
import {
  adaptEpisodeToTrack,
  adaptPodcastToPlaylist,
  formatPlayCount,
  xyzList,
  xyzCursor,
} from '@/xyz/adapter';
import { formatShowNotes } from '@/xyz/notes';

export default {
  name: 'PodcastDetail',
  components: {
    ButtonTwoTone,
    Modal,
  },
  data() {
    return {
      show: false,
      pid: '',
      podcast: {},
      episodes: [],
      order: 'desc',
      isDescExpanded: false,
      showNotesModal: false,
      activeEpisode: null,
      loading: false,
      errorMessage: '',
      loadMoreKey: null,
      requestId: 0,
    };
  },
  watch: {
    '$route.params.id': {
      immediate: true,
      handler(id) {
        this.pid = id;
        this.show = false;
        this.episodes = [];
        this.loadMoreKey = null;
        this.fetchData();
      },
    },
  },
  methods: {
    formatShowNotes,
    formatPlayCount,
    async fetchData() {
      const request = ++this.requestId;
      this.loading = true;
      this.errorMessage = '';
      try {
        const podRes = await xyzService.getPodcastDetail(this.pid);
        if (request !== this.requestId) return;
        const podData = podRes?.data || podRes;
        this.podcast = adaptPodcastToPlaylist(podData?.podcast || podData);
        this.show = true;
        await this.fetchEpisodes();
      } catch (err) {
        if (request === this.requestId)
          this.errorMessage = xyzErrorMessage(err);
      } finally {
        if (request === this.requestId) this.loading = false;
      }
    },
    async fetchEpisodes(append = false) {
      const request = ++this.requestId;
      this.loading = true;
      this.errorMessage = '';
      try {
        const response = await xyzService.getEpisodeList({
          pid: this.pid,
          order: this.order,
          limit: 20,
          ...(append ? { loadMoreKey: this.loadMoreKey } : {}),
        });
        if (request !== this.requestId) return;
        const tracks = xyzList(response)
          .map(item => adaptEpisodeToTrack(item.episode || item, this.podcast))
          .filter(Boolean);
        this.episodes = append
          ? [
              ...this.episodes,
              ...tracks.filter(
                track => !this.episodes.some(ep => ep.id === track.id)
              ),
            ]
          : tracks;
        this.loadMoreKey = xyzCursor(response);
      } catch (err) {
        if (request === this.requestId)
          this.errorMessage = xyzErrorMessage(err);
      } finally {
        if (request === this.requestId) this.loading = false;
      }
    },
    async toggleOrder() {
      this.order = this.order === 'desc' ? 'asc' : 'desc';
      this.loadMoreKey = null;
      await this.fetchEpisodes();
    },
    async playEpisode(ep) {
      try {
        const player = this.$store.state.player;
        if (player.currentTrack.id === ep.id && player._howler) {
          player.playOrPause();
          return;
        }
        await player.playPodcastEpisode(ep, this.episodes);
      } catch (error) {
        this.errorMessage = xyzErrorMessage(error);
      }
    },
    playAllEpisodes() {
      if (this.episodes.length > 0) {
        this.playEpisode(this.episodes[0]);
      }
    },
    isPlayingCurrent(ep) {
      const player = this.$store.state.player;
      return player?.currentTrack?.id === ep.id;
    },
    toggleShowNotes(ep) {
      this.activeEpisode = ep;
      this.showNotesModal = true;
    },
    formatDuration(seconds) {
      if (!seconds) return '00:00';
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      if (m >= 60) {
        const h = Math.floor(m / 60);
        const remM = m % 60;
        return `${h}:${remM.toString().padStart(2, '0')}:${s
          .toString()
          .padStart(2, '0')}`;
      }
      return `${m.toString().padStart(2, '0')}:${s
        .toString()
        .padStart(2, '0')}`;
    },
    formatDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return `${d.getFullYear()}-${(d.getMonth() + 1)
        .toString()
        .padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    },
  },
};
</script>

<style lang="scss" scoped>
.podcast-detail-page {
  padding: 0 10vw 96px;
  color: var(--color-text);

  .podcast-info {
    display: flex;
    gap: 36px;
    margin-top: 36px;
    margin-bottom: 48px;

    .podcast-cover {
      width: 260px;
      height: 260px;
      border-radius: 20px;
      object-fit: cover;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
      flex-shrink: 0;
    }

    .info {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;

      .title {
        font-size: 36px;
        font-weight: 700;
        line-height: 1.25;
        letter-spacing: -0.5px;
      }

      .hosts {
        font-size: 16px;
        font-weight: 600;
        opacity: 0.88;
        margin-top: 12px;
      }

      .date-and-count {
        font-size: 13px;
        opacity: 0.6;
        margin-top: 8px;
      }

      .description {
        font-size: 14px;
        opacity: 0.72;
        margin-top: 14px;
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
        gap: 14px;
        margin-top: 24px;
      }
    }
  }

  .episodes-container {
    .list-header {
      display: flex;
      padding: 10px 16px;
      font-size: 13px;
      opacity: 0.55;
      border-bottom: 1px solid var(--color-secondary-bg);
      margin-bottom: 6px;
    }

    .col-index {
      width: 44px;
      flex-shrink: 0;
      text-align: center;
    }

    .col-title {
      flex: 1;
      min-width: 0;
      padding: 0 12px;
    }

    .col-date {
      width: 120px;
      flex-shrink: 0;
      opacity: 0.65;
      font-size: 13px;
    }

    .col-time {
      width: 80px;
      flex-shrink: 0;
      opacity: 0.65;
      font-size: 13px;
    }

    .col-action {
      width: 60px;
      flex-shrink: 0;
      text-align: right;
    }

    .episode-item {
      display: flex;
      align-items: center;
      padding: 14px 16px;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: var(--color-secondary-bg);

        .mini-btn {
          opacity: 1;
        }
      }

      &.active {
        background: var(--color-primary-bg);
        color: var(--color-primary);

        .ep-main-title {
          font-weight: 600;
        }
      }

      .ep-main-title {
        font-size: 15px;
        line-height: 1.4;
      }

      .ep-snippet {
        margin-top: 4px;
        font-size: 12px;

        .view-notes-btn {
          color: var(--color-primary);
          cursor: pointer;

          &:hover {
            text-decoration: underline;
          }
        }
      }

      .mini-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: none;
        background: var(--color-primary);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition: all 0.2s ease;
      }
    }
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
    }

    .modal-play-btn {
      margin-top: 24px;
      width: 100%;
      height: 44px;
      border-radius: 10px;
      border: none;
      background: var(--color-primary);
      color: white;
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        filter: brightness(1.1);
      }
    }
  }
}
.podcast-detail-page {
  box-sizing: border-box;
  width: calc(100% - 96px);
  max-width: 1240px;
  margin: 0 auto;
  padding: 20px 0 112px;
  .podcast-info {
    gap: 28px;
    margin: 20px 0 32px;
  }
  .podcast-info .podcast-cover {
    width: 200px;
    height: 200px;
    border-radius: 14px;
    box-shadow: none;
  }
  .podcast-info .info {
    min-width: 0;
  }
  .podcast-info .info .title {
    font-size: 30px;
  }
  .podcast-info .info .buttons {
    margin-top: 18px;
    flex-wrap: wrap;
    gap: 10px;
  }
  .episodes-container .col-index {
    width: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .playing-icon {
    display: block;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }
  .episodes-container .episode-item {
    min-height: 80px;
    box-sizing: border-box;
    padding: 14px 12px;
    border-radius: 9px;
  }
  .episodes-container .episode-item .ep-main-title {
    line-height: 1.55;
  }
  .episodes-container .episode-item.active {
    box-shadow: inset 3px 0 var(--color-primary);
  }
  .episodes-container .episode-item .mini-btn {
    width: 40px;
    height: 40px;
    opacity: 1;
    background: var(--color-primary-bg);
    color: var(--color-primary);
    margin-left: auto;
  }
  .mini-btn svg,
  .modal-play-btn svg {
    display: block;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }
  .episodes-container .episode-item .ep-snippet {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 2px 0;
    background: transparent;
    border: 0;
    color: var(--color-primary);
    cursor: pointer;
  }
  .episode-listens {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.6;
  }
  .col-time {
    font-variant-numeric: tabular-nums;
  }
  button:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }
  > button {
    display: block;
    margin: 24px auto;
    padding: 12px 24px;
    min-height: 44px;
    border: 0;
    border-radius: 9px;
    background: var(--color-secondary-bg);
    color: var(--color-text);
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  [role='alert'] {
    padding: 16px;
    margin-bottom: 20px;
    border-radius: 9px;
    background: var(--color-secondary-bg);
    line-height: 1.6;
  }
  .notes-body ::v-deep img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }
  .notes-body ::v-deep a {
    color: var(--color-primary);
    text-decoration: underline;
  }
  @media (max-width: 1050px) {
    width: calc(100% - 48px);
  }
  @media (max-width: 680px) {
    width: calc(100% - 32px);
    .podcast-info {
      flex-direction: column;
      gap: 20px;
    }
    .podcast-info .podcast-cover {
      width: 140px;
      height: 140px;
    }
    .podcast-info .info .title {
      font-size: 26px;
    }
    .episodes-container .col-date {
      display: none;
    }
    .episodes-container .col-time {
      width: 48px;
      font-size: 12px;
    }
    .episodes-container .col-action {
      width: 44px;
    }
    .episodes-container .col-title {
      padding: 0 8px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
    }
  }
}
</style>
