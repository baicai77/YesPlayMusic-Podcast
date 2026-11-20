<template>
  <section class="feeds" aria-labelledby="rss-heading">
    <h2 id="rss-heading">公开播客订阅</h2>
    <p id="rss-help">不需要登录。订阅列表和续听进度只保存在本机。</p>
    <form @submit.prevent="addUrl">
      <label for="rss-url">发布者的 HTTPS RSS 地址</label>
      <div class="actions">
        <input
          id="rss-url"
          v-model.trim="url"
          type="url"
          required
          aria-describedby="rss-help"
        />
        <button type="submit" :disabled="busy">添加订阅</button>
      </div>
    </form>
    <label class="file-label">
      无法直连？导入 RSS 文件
      <input
        type="file"
        accept=".xml,.rss,application/xml,application/rss+xml"
        :disabled="busy"
        @change="importFile"
      />
    </label>
    <p v-if="error" role="alert" class="feedback">{{ error }}</p>
    <p v-if="busy || notice" role="status" class="feedback">{{
      busy ? '正在读取 RSS…' : notice
    }}</p>
    <p v-if="!feeds.length"
      >还没有订阅。添加公开 RSS 地址或导入节目文件即可开始收听。</p
    >
    <details v-for="feed in feeds" :key="feed.key">
      <summary>{{ feed.title }} · {{ feed.episodes.length }} 集</summary>
      <div class="actions">
        <button
          v-if="feed.url"
          type="button"
          :disabled="busy"
          @click="loadUrl(feed.url)"
          >更新节目</button
        >
        <button type="button" :disabled="busy" @click="removeFeed(feed)"
          >移除订阅</button
        >
      </div>
      <ul>
        <li v-for="episode in feed.episodes" :key="episode.eid">
          <button type="button" @click="play(feed, episode)"
            >播放：{{ episode.title }}</button
          >
        </li>
      </ul>
    </details>
  </section>
</template>

<script>
import {
  fetchPublicFeed,
  maxFeedSize,
  parseFeed,
  publicEpisodeTrack,
  readPublicFeeds,
  savePublicFeeds,
} from '@/xyz/rss';

export default {
  name: 'PublicPodcastFeeds',
  data() {
    return {
      feeds: readPublicFeeds(),
      url: '',
      busy: false,
      error: '',
      notice: '',
    };
  },
  methods: {
    addUrl() {
      return this.loadUrl(this.url);
    },
    async loadUrl(url) {
      await this.addFeed(() => fetchPublicFeed(url));
    },
    async importFile(event) {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      await this.addFeed(async () => {
        if (file.size > maxFeedSize) throw new Error('RSS 文件不能超过 2 MB');
        return parseFeed(await file.text());
      });
    },
    async addFeed(load) {
      if (this.busy) return;
      this.busy = true;
      this.error = '';
      this.notice = '';
      try {
        const feed = await load();
        const next = readPublicFeeds().filter(item => item.key !== feed.key);
        this.persist([feed, ...next]);
        this.notice = `已保存「${feed.title}」`;
      } catch (error) {
        this.error =
          error.name === 'QuotaExceededError'
            ? '本地存储已满，请移除不再收听的订阅'
            : error.message;
      } finally {
        this.busy = false;
      }
    },
    persist(feeds) {
      savePublicFeeds(feeds);
      this.feeds = feeds;
    },
    removeFeed(feed) {
      try {
        this.persist(readPublicFeeds().filter(item => item.key !== feed.key));
        this.error = '';
        this.notice = `已移除「${feed.title}」`;
      } catch {
        this.error = '无法更新本地订阅';
      }
    },
    async play(feed, episode) {
      this.error = '';
      try {
        const played = await this.$store.state.player.playPodcastEpisode(
          publicEpisodeTrack(feed, episode),
          feed.episodes.map(item => publicEpisodeTrack(feed, item))
        );
        if (!played) this.error = '无法播放该单集，请检查发布者的音频地址';
      } catch {
        this.error = '无法播放该单集，请检查发布者的音频地址';
      }
    },
  },
};
</script>

<style scoped>
.feeds {
  max-width: 760px;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 8px 0 12px;
}
.actions input {
  flex: 1 1 280px;
  min-width: 0;
  color: inherit;
  background: var(--color-secondary-bg);
  border: 1px solid currentColor;
  border-radius: 8px;
  padding: 8px;
}
button {
  color: inherit;
  background: var(--color-secondary-bg);
  border-radius: 8px;
  padding: 8px 12px;
  min-height: 44px;
  max-width: 100%;
  overflow-wrap: anywhere;
  text-align: left;
}
button:disabled {
  opacity: 0.6;
}
button:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
.file-label input {
  display: block;
  max-width: 100%;
  margin: 8px 0;
}
.feedback {
  overflow-wrap: anywhere;
}
details {
  padding: 12px 0;
  border-bottom: 1px solid var(--color-secondary-bg);
}
summary {
  cursor: pointer;
  overflow-wrap: anywhere;
}
ul {
  padding: 0;
  list-style: none;
}
li + li {
  margin-top: 8px;
}
</style>
