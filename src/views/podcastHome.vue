<template>
  <div class="podcast-page">
    <div class="header-section">
      <div class="title-area">
        <h1>小宇宙播客</h1>
        <div class="subtitle">发现好节目，接着上次听。</div>
      </div>

      <div class="account-badge">
        <div v-if="user" class="logged-in">
          <img
            v-if="user.avatar && user.avatar.picture"
            :src="user.avatar.picture.smallPicUrl || user.avatar.picture.picUrl"
            class="user-avatar"
          />
          <div class="user-name">{{ user.nickname || '小宇宙用户' }}</div>
          <button class="action-btn logout-btn" @click.stop="handleLogout">
            退出
          </button>
        </div>
        <button
          v-else
          class="action-btn login-btn"
          @click="showLoginModal = true"
        >
          <svg-icon icon-class="login" />
          <span>登录小宇宙</span>
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
      </button>
    </div>

    <PublicPodcastFeeds v-if="currentTab === 'rss'" />

    <div v-if="errorMessage" class="empty-state" role="alert">
      {{ errorMessage }}
      <button class="action-btn" :disabled="loading" @click="loadTabData()"
        >重试</button
      >
    </div>
    <!-- 精选推荐 -->
    <div v-if="currentTab === 'discovery'" class="tab-content">
      <div v-if="loading" class="loading-state">加载中...</div>
      <div v-else>
        <!-- 编辑精选单集 -->
        <div v-if="discoveryEpisodes.length > 0" class="section">
          <h2>今日精选单集</h2>
          <div class="episodes-grid">
            <div
              v-for="ep in discoveryEpisodes"
              :key="ep.id"
              class="episode-card"
              @click="playEpisode(ep)"
            >
              <img :src="ep.al.picUrl" class="ep-cover" loading="lazy" />
              <div class="ep-info">
                <div class="ep-title" :title="ep.name">{{ ep.name }}</div>
                <div class="ep-podcast">{{ ep.ar[0].name }}</div>
                <div class="ep-meta">
                  <span>{{ formatDuration(ep.duration) }}</span>
                  <span v-if="ep.playCount !== null">
                    · {{ formatPlayCount(ep.playCount) }}</span
                  >
                  <span v-if="ep.pubDate"> · {{ formatDate(ep.pubDate) }}</span>
                </div>
              </div>
              <button class="play-circle-btn" @click.stop="playEpisode(ep)">
                <svg-icon icon-class="play" />
              </button>
            </div>
          </div>
        </div>

        <!-- 推荐播客节目 -->
        <div v-if="discoveryPodcasts.length > 0" class="section">
          <h2>热门推荐节目</h2>
          <div class="podcast-grid">
            <div
              v-for="pod in discoveryPodcasts"
              :key="pod.pid"
              class="podcast-card"
              @click="goToPodcast(pod.pid)"
            >
              <div class="cover-wrapper">
                <img :src="pod.picUrl" class="pod-cover" loading="lazy" />
                <button
                  class="pod-play-btn"
                  @click.stop="playPodcastFirstEpisode(pod.pid)"
                >
                  <svg-icon icon-class="play" />
                </button>
              </div>
              <div class="pod-title" :title="pod.name">{{ pod.name }}</div>
              <div class="pod-brief" :title="pod.brief">{{ pod.brief }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 我的订阅 -->
    <div v-else-if="currentTab === 'subscriptions'" class="tab-content">
      <div v-if="!user" class="empty-state">
        <div class="empty-text">登录小宇宙后即可查看你订阅的所有播客节目</div>
        <button class="action-btn login-btn" @click="showLoginModal = true">
          立即登录
        </button>
      </div>
      <div v-else>
        <div v-if="loading" class="loading-state">正在加载订阅...</div>
        <div v-else-if="subscriptions.length === 0" class="empty-state">
          暂无订阅节目，快去「精选推荐」或搜索发现好节目吧！
        </div>
        <div v-else class="podcast-grid">
          <div
            v-for="pod in subscriptions"
            :key="pod.pid"
            class="podcast-card"
            @click="goToPodcast(pod.pid)"
          >
            <div class="cover-wrapper">
              <img :src="pod.picUrl" class="pod-cover" loading="lazy" />
              <button
                class="pod-play-btn"
                @click.stop="playPodcastFirstEpisode(pod.pid)"
              >
                <svg-icon icon-class="play" />
              </button>
            </div>
            <div class="pod-title" :title="pod.name">{{ pod.name }}</div>
            <div class="pod-brief">
              {{ pod.trackCount ? `${pod.trackCount} 集` : pod.brief }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 热门榜单 -->
    <div v-else-if="currentTab === 'rankings'" class="tab-content">
      <div class="ranking-heading">
        <div>
          <h2>{{ rankingTitle || '热门榜单' }}</h2>
          <p>{{ rankingInformation || '按热度发现值得收听的单集' }}</p>
          <span v-if="rankingDate" class="ranking-date"
            >{{ formatDate(rankingDate) }} 更新 ·
            {{ rankingPodcasts.length }} 个单集</span
          >
        </div>
        <div class="ranking-selector" aria-label="榜单类型">
          <button
            v-for="r in rankingTypes"
            :key="r.id"
            class="rank-pill"
            :class="{ active: currentRankType === r.id }"
            :aria-pressed="currentRankType === r.id"
            @click="changeRankingType(r.id)"
            >{{ r.name }}</button
          >
        </div>
      </div>
      <div v-if="loading" class="loading-state" role="status"
        >正在加载榜单...</div
      >
      <div
        v-else-if="!rankingPodcasts.length && !errorMessage"
        class="empty-state"
        >榜单暂时没有内容，请稍后重试。</div
      >
      <div v-else class="ranking-list">
        <button
          v-for="(pod, index) in rankingPodcasts"
          :key="pod.id"
          class="ranking-row"
          :class="{
            'top-three': index < 3,
            'is-current': $store.state.player.currentTrack.id === pod.id,
          }"
          @click="pod.eid ? playEpisode(pod) : goToPodcast(pod.pid)"
        >
          <span class="ranking-number">{{
            String(index + 1).padStart(2, '0')
          }}</span>
          <img
            :src="pod.eid ? pod.al.picUrl : pod.picUrl"
            alt=""
            class="ranking-cover"
            loading="lazy"
          />
          <span class="ranking-copy">
            <span class="ranking-title" :title="pod.name">{{ pod.name }}</span>
            <span class="ranking-podcast">{{
              pod.eid ? pod.ar[0].name : pod.brief
            }}</span>
            <span v-if="pod.eid" class="ranking-duration"
              >{{ formatDuration(pod.duration)
              }}<template v-if="pod.playCount !== null">
                · {{ formatPlayCount(pod.playCount) }}</template
              ></span
            >
          </span>
          <span
            class="ranking-play"
            :aria-label="pod.eid ? '播放单集' : '查看节目'"
            ><svg-icon icon-class="play"
          /></span>
        </button>
      </div>
    </div>

    <!-- 收听历史 -->
    <div v-else-if="currentTab === 'history'" class="tab-content">
      <div v-if="!user" class="empty-state">
        <div class="empty-text">登录后可同步你在手机端的播客收听记录与进度</div>
        <button class="action-btn login-btn" @click="showLoginModal = true">
          立即登录
        </button>
      </div>
      <div v-else>
        <div v-if="loading" class="loading-state">加载收听历史...</div>
        <div v-else-if="historyEpisodes.length === 0" class="empty-state">
          暂无收听历史
        </div>
        <div v-else class="episodes-grid">
          <div
            v-for="ep in historyEpisodes"
            :key="ep.id"
            class="episode-card"
            @click="playEpisode(ep)"
          >
            <img :src="ep.al.picUrl" class="ep-cover" loading="lazy" />
            <div class="ep-info">
              <div class="ep-title" :title="ep.name">{{ ep.name }}</div>
              <div class="ep-podcast">{{ ep.ar[0].name }}</div>
              <div class="ep-meta">
                <span>{{ formatDuration(ep.duration) }}</span>
                <span v-if="ep.playCount !== null">
                  · {{ formatPlayCount(ep.playCount) }}</span
                >
                <span v-if="ep.playbackProgress">
                  · 已听 {{ Math.floor(ep.playbackProgress / 60) }} 分钟</span
                >
              </div>
            </div>
            <button class="play-circle-btn" @click.stop="playEpisode(ep)">
              <svg-icon icon-class="play" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="currentTab === 'search'" class="tab-content">
      <form class="search-form" @submit.prevent="loadTabData()">
        <label for="podcast-search">搜索节目或单集</label>
        <input
          id="podcast-search"
          v-model="keyword"
          required
          maxlength="100"
          placeholder="输入播客或单集关键词"
        />
        <select
          v-model="searchType"
          aria-label="搜索类型"
          @change="
            searchResults = [];
            searched = false;
          "
        >
          <option value="PODCAST">节目</option>
          <option value="EPISODE">单集</option>
        </select>
        <button
          class="action-btn login-btn"
          :disabled="loading || !keyword.trim()"
          >搜索</button
        >
      </form>
      <div v-if="loading" class="loading-state" role="status">搜索中...</div>
      <div v-else-if="searched && !searchResults.length" class="empty-state"
        >没有找到结果，试试其他关键词</div
      >
      <div v-else class="search-results">
        <button
          v-for="item in searchResults"
          :key="item.id"
          class="search-result"
          @click="
            item.isPodcast && item.eid
              ? playEpisode(item)
              : goToPodcast(item.pid)
          "
        >
          <img
            :src="item.coverImgUrl || item.al.picUrl"
            :alt="item.name"
            loading="lazy"
          />
          <span>{{ item.name }}</span>
          <span>{{ item.eid ? '播放单集' : '查看节目' }}</span>
        </button>
      </div>
    </div>
    <button
      v-if="loadMoreKey"
      class="action-btn"
      :disabled="loading"
      @click="loadTabData(true)"
      >{{ loading ? '加载中...' : '加载更多' }}</button
    >
    <p
      v-if="
        currentTab === 'discovery' &&
        !loading &&
        !errorMessage &&
        !discoveryEpisodes.length &&
        !discoveryPodcasts.length
      "
      class="empty-state"
      >暂无推荐内容，可尝试登录或搜索节目</p
    >
    <!-- 小宇宙登录弹窗 -->
    <ModalLoginXyz
      :show.sync="showLoginModal"
      @login-success="handleLoginSuccess"
    />
  </div>
</template>

<script>
import ModalLoginXyz from '@/components/ModalLoginXyz.vue';
import PublicPodcastFeeds from '@/components/PublicPodcastFeeds.vue';
import {
  xyzService,
  getXyzUser,
  logoutXyz,
  isXyzLoggedIn,
  xyzErrorMessage,
} from '@/xyz/client';
import {
  adaptEpisodeToTrack,
  adaptPodcastToPlaylist,
  adaptDiscovery,
  adaptRanking,
  formatPlayCount,
  xyzList,
  xyzCursor,
} from '@/xyz/adapter';

export default {
  name: 'PodcastHome',
  components: {
    ModalLoginXyz,
    PublicPodcastFeeds,
  },
  data() {
    return {
      user: null,
      showLoginModal: false,
      currentTab: 'discovery',
      tabs: [
        { id: 'discovery', name: '精选推荐' },
        { id: 'subscriptions', name: '我的订阅' },
        { id: 'rankings', name: '热门榜单' },
        { id: 'history', name: '收听历史' },
        { id: 'search', name: '搜索播客' },
        { id: 'rss', name: '本地 RSS' },
      ],
      rankingTypes: [
        { id: 'HOT', name: '🔥 最热榜' },
        { id: 'NEW', name: '新星榜' },
        { id: 'ROCK', name: '锋芒榜' },
      ],
      currentRankType: 'HOT',
      loading: false,
      errorMessage: '',
      requestId: 0,
      loadMoreKey: null,
      keyword: '',
      searchType: 'PODCAST',
      searched: false,
      searchResults: [],
      discoveryEpisodes: [],
      discoveryPodcasts: [],
      subscriptions: [],
      rankingPodcasts: [],
      rankingTitle: '',
      rankingInformation: '',
      rankingDate: '',
      historyEpisodes: [],
    };
  },
  watch: {
    '$route.query.tab'(tab) {
      if (tab === 'rss' && this.currentTab !== 'rss') this.switchTab('rss');
    },
  },
  created() {
    if (this.$route.query.tab === 'rss') this.currentTab = 'rss';
    this.user = isXyzLoggedIn()
      ? getXyzUser() || { nickname: '小宇宙用户' }
      : null;
    this.loadTabData();
  },
  methods: {
    formatPlayCount,
    handleLoginSuccess(user) {
      this.user = user;
      this.loadTabData();
    },
    handleLogout() {
      logoutXyz();
      this.user = null;
      this.subscriptions = [];
      this.historyEpisodes = [];
      this.loadTabData();
    },
    switchTab(tabId) {
      this.currentTab = tabId;
      this.loadTabData();
    },
    changeRankingType(type) {
      this.currentRankType = type;
      this.loadTabData();
    },
    async loadTabData(append = false) {
      const request = ++this.requestId;
      const tab = this.currentTab;
      this.errorMessage = '';
      this.loading = false;
      if (!append) this.loadMoreKey = null;
      if (tab === 'rss') return;
      if (['subscriptions', 'history'].includes(tab) && !isXyzLoggedIn())
        return;
      if (tab === 'search' && !this.keyword.trim()) return;
      this.loading = true;
      try {
        const pagination = append ? { loadMoreKey: this.loadMoreKey } : {};
        let response;
        if (tab === 'discovery') response = await xyzService.getDiscovery();
        if (tab === 'subscriptions')
          response = await xyzService.getSubscriptions(pagination);
        if (tab === 'rankings')
          response = await xyzService.getTopList(this.currentRankType);
        if (tab === 'history')
          response = await xyzService.getHistory(pagination);
        if (tab === 'search')
          response = await xyzService.search({
            keyword: this.keyword.trim(),
            type: this.searchType,
          });
        if (request !== this.requestId) return;
        const list = xyzList(response);
        const podcasts = items =>
          items
            .map(item => adaptPodcastToPlaylist(item.podcast || item))
            .filter(Boolean);
        const episodes = items =>
          items
            .map(item =>
              adaptEpisodeToTrack(item.episode || item, item.podcast)
            )
            .filter(Boolean);
        if (tab === 'discovery') {
          const discovery = adaptDiscovery(response);
          this.discoveryEpisodes = discovery.episodes;
          this.discoveryPodcasts = discovery.podcasts;
        }
        if (tab === 'subscriptions')
          this.subscriptions = append
            ? [...this.subscriptions, ...podcasts(list)]
            : podcasts(list);
        if (tab === 'rankings') {
          this.rankingPodcasts = adaptRanking(response);
          const metadata = response?.data || response || {};
          this.rankingTitle = metadata.title || '热门榜单';
          this.rankingInformation = metadata.information || '';
          this.rankingDate = metadata.publishDate || '';
        }
        if (tab === 'history')
          this.historyEpisodes = append
            ? [...this.historyEpisodes, ...episodes(list)]
            : episodes(list);
        if (tab === 'search') {
          this.searchResults =
            this.searchType === 'PODCAST' ? podcasts(list) : episodes(list);
          this.searched = true;
        }
        this.loadMoreKey = ['subscriptions', 'history'].includes(tab)
          ? xyzCursor(response)
          : null;
      } catch (error) {
        if (request === this.requestId) {
          this.errorMessage = xyzErrorMessage(error);
          if (!isXyzLoggedIn()) this.user = null;
        }
      } finally {
        if (request === this.requestId) this.loading = false;
      }
    },
    goToPodcast(pid) {
      this.$router.push({ name: 'podcast', params: { id: pid } });
    },
    async playEpisode(ep) {
      try {
        const player = this.$store.state.player;
        if (player.currentTrack.id === ep.id && player._howler) {
          player.playOrPause();
          return;
        }
        await player.playPodcastEpisode(ep);
      } catch (error) {
        this.errorMessage = xyzErrorMessage(error);
      }
    },
    async playPodcastFirstEpisode(pid) {
      try {
        const res = await xyzService.getEpisodeList({ pid, limit: 1 });
        const list = xyzList(res);
        if (list.length > 0) {
          const ep = adaptEpisodeToTrack(list[0].episode || list[0]);
          await this.playEpisode(ep);
        }
      } catch (err) {
        this.errorMessage = xyzErrorMessage(err);
      }
    },
    formatDuration(seconds) {
      if (!seconds) return '00:00';
      const m = Math.floor(seconds / 60);
      if (m >= 60) {
        const h = Math.floor(m / 60);
        const remM = m % 60;
        return `${h} 小时 ${remM} 分钟`;
      }
      return `${m} 分钟`;
    },
    formatDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return `${d.getMonth() + 1}月${d.getDate()}日`;
    },
  },
};
</script>

<style lang="scss" scoped>
.podcast-page {
  padding: 0 10vw 96px;
  color: var(--color-text);

  .search-form {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-bottom: 24px;
  }
  .search-form input,
  .search-form select {
    padding: 12px;
    background: var(--color-secondary-bg);
    color: var(--color-text);
    border-radius: 8px;
    border: 1px solid var(--color-secondary-bg);
  }
  .search-form input {
    flex: 1;
    min-width: 180px;
  }
  .search-result {
    display: flex;
    width: 100%;
    gap: 16px;
    align-items: center;
    text-align: left;
    padding: 12px;
    margin-bottom: 12px;
    border-radius: 12px;
    background: var(--color-secondary-bg);
    color: var(--color-text);
    cursor: pointer;
  }
  .search-result img {
    width: 64px;
    height: 64px;
    object-fit: cover;
    border-radius: 8px;
  }
  .search-result span:first-of-type {
    flex: 1;
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }
  .tab-buttons {
    flex-wrap: wrap;
  }
  .tab-btn {
    border: none;
    color: var(--color-text);
    min-height: 44px;
  }
  @media (max-width: 640px) {
    padding: 0 20px 96px;
    .header-section {
      flex-wrap: wrap;
      gap: 16px;
    }
    .episodes-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .episodes-grid .episode-card .play-circle-btn {
      opacity: 1;
    }
  }

  .header-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 24px;
    margin-bottom: 24px;

    h1 {
      font-size: 42px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.5px;
    }

    .subtitle {
      font-size: 14px;
      opacity: 0.72;
      margin-top: 6px;
    }

    .account-badge {
      display: flex;
      align-items: center;

      .logged-in {
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--color-secondary-bg);
        padding: 6px 14px;
        border-radius: 24px;

        .user-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          object-fit: cover;
        }

        .user-name {
          font-size: 14px;
          font-weight: 600;
        }
      }
    }
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 18px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: all 0.2s ease;

    &.login-btn {
      background: var(--color-primary-bg);
      color: var(--color-primary);

      &:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
      }
    }

    &.logout-btn {
      padding: 4px 10px;
      font-size: 12px;
      background: transparent;
      color: var(--color-text);
      opacity: 0.6;

      &:hover {
        opacity: 1;
        color: #e53e3e;
      }
    }
  }

  .tab-buttons {
    display: flex;
    gap: 12px;
    margin-bottom: 32px;

    .tab-btn {
      padding: 8px 18px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      opacity: 0.75;
      background: var(--color-secondary-bg);
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

  .section {
    margin-bottom: 40px;

    h2 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 18px;
    }
  }

  .episodes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 16px;

    .episode-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px;
      border-radius: 14px;
      background: var(--color-secondary-bg);
      cursor: pointer;
      position: relative;
      transition: all 0.2s ease;

      &:hover {
        background: var(--color-secondary-bg-for-transparent);
        transform: translateY(-2px);

        .play-circle-btn {
          opacity: 1;
          transform: scale(1);
        }
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
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ep-podcast {
          font-size: 13px;
          opacity: 0.72;
          margin-top: 3px;
        }

        .ep-meta {
          font-size: 12px;
          opacity: 0.55;
          margin-top: 4px;
        }
      }

      .play-circle-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--color-primary);
        color: white;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transform: scale(0.85);
        transition: all 0.2s ease;
        flex-shrink: 0;
      }
    }
  }

  .podcast-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 24px 20px;

    .podcast-card {
      cursor: pointer;
      position: relative;

      &.ranked {
        .rank-badge {
          position: absolute;
          top: -8px;
          left: -8px;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: var(--color-primary);
          color: white;
          font-size: 14px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
        }
      }

      .cover-wrapper {
        position: relative;
        width: 100%;
        padding-top: 100%;
        border-radius: 14px;
        overflow: hidden;
        margin-bottom: 10px;
        box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);

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
          color: white;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          transform: translateY(6px);
          transition: all 0.25s ease;
        }

        &:hover {
          .pod-cover {
            transform: scale(1.04);
          }

          .pod-play-btn {
            opacity: 1;
            transform: translateY(0);
          }
        }
      }

      .pod-title {
        font-size: 15px;
        font-weight: 600;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .pod-brief {
        font-size: 12px;
        opacity: 0.65;
        margin-top: 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: 1.4;
      }
    }
  }

  .ranking-selector {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;

    .rank-pill {
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      background: var(--color-secondary-bg);
      border: none;
      color: var(--color-text);
      cursor: pointer;
      opacity: 0.7;
      transition: all 0.2s ease;

      &.active {
        opacity: 1;
        background: var(--color-primary-bg);
        color: var(--color-primary);
      }
    }
  }

  .empty-state,
  .loading-state {
    text-align: center;
    padding: 60px 0;
    opacity: 0.7;
    font-size: 15px;

    .empty-text {
      margin-bottom: 16px;
    }
  }
}
// Unified podcast workspace: a quiet frame around editorial content.
.podcast-page {
  box-sizing: border-box;
  max-width: 1240px;
  width: calc(100% - 96px);
  margin: 0 auto;
  padding: 16px 0 112px;

  .header-section {
    margin: 16px 0 24px;
    gap: 24px;
  }
  .header-section h1 {
    font-size: 32px;
    line-height: 1.3;
    letter-spacing: -1px;
  }
  .header-section .subtitle {
    margin-top: 8px;
    font-size: 14px;
  }
  .account-badge {
    flex-shrink: 0;
    .login-btn {
      min-height: 40px;
      white-space: nowrap;
    }
    .login-btn svg {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }
  }
  .tab-buttons {
    gap: 28px;
    margin: 0 0 28px;
    border-bottom: 1px solid var(--color-secondary-bg);
  }
  .tab-buttons .tab-btn {
    position: relative;
    padding: 12px 0 16px;
    border-radius: 0;
    background: transparent;
    opacity: 0.65;
    font-size: 15px;
    &.active {
      background: transparent;
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
  }
  .section {
    margin-bottom: 32px;
  }
  .section h2 {
    font-size: 22px;
    margin-bottom: 16px;
  }
  .episodes-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .episodes-grid .episode-card {
    min-height: 88px;
    padding: 16px;
    transform: none;
  }
  .episodes-grid .episode-card .ep-info .ep-title {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.5;
  }
  .episodes-grid .episode-card .play-circle-btn {
    opacity: 1;
    transform: none;
    width: 44px;
    height: 44px;
  }
  .podcast-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 24px;
  }
  .podcast-grid .podcast-card .cover-wrapper {
    box-shadow: none;
    border-radius: 12px;
  }
  .podcast-grid .podcast-card .pod-title {
    -webkit-line-clamp: 2;
    min-height: 42px;
  }
  .podcast-grid .podcast-card .cover-wrapper .pod-play-btn {
    opacity: 1;
    transform: none;
    width: 44px;
    height: 44px;
  }

  .ranking-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 24px;
  }
  .ranking-heading h2 {
    font-size: 26px;
    margin: 0 0 8px;
  }
  .ranking-heading p {
    max-width: 620px;
    margin: 0 0 8px;
    font-size: 14px;
    line-height: 1.6;
    opacity: 0.65;
  }
  .ranking-date {
    font-size: 12px;
    opacity: 0.5;
  }
  .ranking-selector {
    flex-shrink: 0;
    gap: 4px;
    margin: 0;
    padding: 4px;
    border-radius: 10px;
    background: var(--color-secondary-bg);
  }
  .ranking-selector .rank-pill {
    min-height: 36px;
    padding: 8px 14px;
    border-radius: 7px;
    background: transparent;
    font-size: 13px;
  }
  .ranking-selector .rank-pill.active {
    background: var(--color-primary-bg);
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
    min-height: 124px;
    width: 100%;
    padding: 18px 8px;
    text-align: left;
    border: 0;
    border-bottom: 1px solid var(--color-secondary-bg);
    border-radius: 0;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    transition: background 150ms ease;
    &:hover,
    &.is-current {
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
    width: 76px;
    height: 76px;
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
    line-height: 1.5;
    font-weight: 600;
  }
  .ranking-podcast {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    opacity: 0.65;
    margin-top: 5px;
  }
  .ranking-duration {
    display: block;
    font-size: 12px;
    opacity: 0.45;
    margin-top: 4px;
  }
  .ranking-play {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--color-primary-bg);
    color: var(--color-primary);
  }
  .ranking-play svg {
    width: 16px;
    height: 16px;
  }
  .empty-state[role='alert'] {
    padding: 16px 20px;
    background: var(--color-secondary-bg);
    border-radius: 10px;
    text-align: left;
    line-height: 1.6;
    margin-bottom: 20px;
  }
  .empty-state[role='alert'] .action-btn {
    display: inline-flex;
    margin-left: 12px;
    color: var(--color-primary);
  }
  @media (max-width: 1050px) {
    width: calc(100% - 48px);
    .ranking-list {
      grid-template-columns: minmax(0, 1fr);
    }
    .ranking-heading {
      align-items: flex-start;
    }
  }
  @media (max-width: 680px) {
    width: calc(100% - 32px);
    .header-section h1 {
      font-size: 28px;
    }
    .tab-buttons {
      gap: 20px;
      flex-wrap: nowrap;
      overflow-x: auto;
    }
    .tab-buttons .tab-btn {
      white-space: nowrap;
    }
    .ranking-heading {
      flex-direction: column;
      gap: 16px;
    }
    .episodes-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .ranking-row {
      gap: 10px;
      padding: 14px 0;
    }
    .ranking-cover {
      width: 64px;
      height: 64px;
    }
    .ranking-play {
      width: 32px;
      height: 32px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition: none !important;
      transform: none !important;
    }
  }
}
</style>
