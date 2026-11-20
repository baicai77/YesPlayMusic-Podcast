<template>
  <Modal
    :show="show"
    :close="close"
    title="管理 RSS 订阅源"
    width="520px"
    :show-footer="false"
  >
    <div class="rss-modal-container">
      <div class="mode-switch">
        <button
          type="button"
          class="mode-btn"
          :class="{ active: mode === 'rss' }"
          @click="switchMode('rss')"
        >
          添加 RSS 链接
        </button>
        <button
          type="button"
          class="mode-btn"
          :class="{ active: mode === 'opml' }"
          @click="switchMode('opml')"
        >
          导入 / 导出 OPML
        </button>
      </div>

      <!-- 添加单条 RSS -->
      <div v-if="mode === 'rss'" class="panel">
        <p class="hint-text">
          输入任意播客的标准 RSS / Atom
          订阅地址，无需登录任何平台账号，数据完全保存在本地。
        </p>

        <form class="url-form" @submit.prevent="previewFeed">
          <input
            v-model="rssUrl"
            type="url"
            class="rss-input"
            placeholder="https://example.com/feed.xml"
            required
          />
          <button
            type="submit"
            class="primary-btn"
            :disabled="loading || !rssUrl.trim()"
          >
            {{ loading ? '解析中...' : '解析预览' }}
          </button>
        </form>

        <div v-if="previewData" class="preview-card">
          <img
            :src="previewData.podcast.coverImgUrl"
            class="preview-cover"
            alt=""
          />
          <div class="preview-info">
            <div class="preview-title">{{ previewData.podcast.title }}</div>
            <div class="preview-author">
              {{ previewData.podcast.author || '播客节目' }} · 共
              {{ previewData.episodes.length }} 集
            </div>
            <div class="preview-desc">
              {{ previewData.podcast.description || '暂无节目简介' }}
            </div>
          </div>
        </div>

        <div v-if="previewData" class="preview-actions">
          <button
            type="button"
            class="primary-btn full-width"
            @click="confirmSubscribePreview"
          >
            {{
              isPreviewSubscribed ? '已订阅（更新并打开）' : '确认订阅并查看'
            }}
          </button>
        </div>
      </div>

      <!-- OPML 导入 / 导出 -->
      <div v-else class="panel">
        <p class="hint-text">
          支持导入 Apple Podcasts、Overcast、Pocket Casts、AntennaPod
          等播客客户端导出的标准 OPML 文件。
        </p>

        <div class="opml-toolbar">
          <label class="secondary-btn file-label">
            <span>选择 .opml / .xml 文件</span>
            <input
              type="file"
              accept=".opml,.xml,text/xml,application/xml"
              class="hidden-file"
              @change="handleOpmlFile"
            />
          </label>
          <button
            type="button"
            class="secondary-btn"
            :disabled="subscriptionCount === 0"
            @click="handleExportOpml"
          >
            导出当前订阅 ({{ subscriptionCount }})
          </button>
        </div>

        <textarea
          v-model="opmlText"
          class="opml-textarea"
          rows="5"
          placeholder="或直接粘贴 OPML XML 内容到这里..."
        ></textarea>

        <div class="opml-parse-row">
          <button
            type="button"
            class="secondary-btn"
            :disabled="!opmlText.trim()"
            @click="parseOpmlInput"
          >
            解析 OPML
          </button>
          <span v-if="parsedFeeds.length > 0" class="parse-summary">
            已识别 {{ parsedFeeds.length }} 个播客源（新增
            {{ newFeedsCount }} 个）
          </span>
        </div>

        <div v-if="parsedFeeds.length > 0" class="opml-preview-list">
          <label
            v-for="feed in parsedFeeds"
            :key="feed.feedUrl"
            class="opml-item"
          >
            <input
              v-model="selectedFeedUrls"
              type="checkbox"
              :value="feed.feedUrl"
            />
            <span class="opml-item-title">{{ feed.title }}</span>
            <span v-if="feed.alreadySubscribed" class="badge-existing"
              >已订阅</span
            >
          </label>
        </div>

        <button
          v-if="parsedFeeds.length > 0"
          type="button"
          class="primary-btn full-width"
          :disabled="selectedFeedUrls.length === 0"
          @click="confirmImportOpml"
        >
          导入选中的 {{ selectedFeedUrls.length }} 个订阅源
        </button>
      </div>

      <div v-if="errorMessage" class="feedback error" role="alert">
        {{ errorMessage }}
      </div>
      <div v-if="successMessage" class="feedback success" role="status">
        {{ successMessage }}
      </div>
    </div>
  </Modal>
</template>

<script>
import Modal from '@/components/Modal.vue';
import { podcastApi, podcastErrorMessage } from '@/podcast/client';
import { parseOpml, exportOpml } from '@/podcast/opml';
import { adaptPodcastToPlaylist } from '@/podcast/adapter';
import {
  getSubscriptions,
  isSubscribed,
  subscribePodcast,
  importSubscriptionsBatch,
  mergeLatestEpisodes,
} from '@/podcast/storage';

export default {
  name: 'ModalAddRss',
  components: { Modal },
  props: {
    show: {
      type: Boolean,
      default: false,
    },
    initialMode: {
      type: String,
      default: 'rss',
    },
    initialUrl: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      mode: 'rss',
      rssUrl: '',
      loading: false,
      previewData: null,
      opmlText: '',
      parsedFeeds: [],
      selectedFeedUrls: [],
      errorMessage: '',
      successMessage: '',
      subscriptionCount: 0,
    };
  },
  computed: {
    isPreviewSubscribed() {
      return (
        this.previewData &&
        isSubscribed(
          this.previewData.podcast.feedUrl || this.previewData.podcast.pid
        )
      );
    },
    newFeedsCount() {
      return this.parsedFeeds.filter(f => !f.alreadySubscribed).length;
    },
  },
  watch: {
    show(val) {
      if (val) {
        this.mode = this.initialMode === 'opml' ? 'opml' : 'rss';
        this.rssUrl = this.initialUrl || '';
        this.previewData = null;
        this.opmlText = '';
        this.parsedFeeds = [];
        this.selectedFeedUrls = [];
        this.errorMessage = '';
        this.successMessage = '';
        this.subscriptionCount = getSubscriptions().length;
      }
    },
  },
  methods: {
    close() {
      this.$emit('update:show', false);
    },
    switchMode(nextMode) {
      this.mode = nextMode;
      this.errorMessage = '';
      this.successMessage = '';
      this.subscriptionCount = getSubscriptions().length;
    },
    async previewFeed() {
      const url = this.rssUrl.trim();
      if (!url) return;
      this.loading = true;
      this.errorMessage = '';
      this.successMessage = '';
      this.previewData = null;
      try {
        const res = await podcastApi.fetchFeed(url, true);
        const podcast = adaptPodcastToPlaylist(res.podcast, res.episodes);
        this.previewData = {
          podcast,
          episodes: res.episodes || [],
        };
      } catch (err) {
        this.errorMessage = podcastErrorMessage(err);
      } finally {
        this.loading = false;
      }
    },
    confirmSubscribePreview() {
      if (!this.previewData) return;
      const { podcast, episodes } = this.previewData;
      const latestPubDate =
        episodes.length > 0 ? episodes[0].pubDate || '' : '';
      const entry = subscribePodcast({
        ...podcast,
        episodeCount: episodes.length,
        latestPubDate,
      });
      mergeLatestEpisodes(entry, episodes);
      this.subscriptionCount = getSubscriptions().length;
      this.$emit('subscribed', entry);
      this.close();
    },
    handleOpmlFile(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.opmlText = String(reader.result || '');
        this.parseOpmlInput();
      };
      reader.onerror = () => {
        this.errorMessage = '读取 OPML 文件失败，请重试';
      };
      reader.readAsText(file, 'utf-8');
      event.target.value = '';
    },
    parseOpmlInput() {
      this.errorMessage = '';
      this.successMessage = '';
      try {
        const feeds = parseOpml(this.opmlText);
        if (!feeds.length) {
          this.errorMessage = '未在 OPML 中找到任何有效的 RSS 订阅链接';
          this.parsedFeeds = [];
          this.selectedFeedUrls = [];
          return;
        }
        this.parsedFeeds = feeds.map(feed => ({
          ...feed,
          alreadySubscribed: isSubscribed(feed.feedUrl),
        }));
        this.selectedFeedUrls = this.parsedFeeds
          .filter(feed => !feed.alreadySubscribed)
          .map(feed => feed.feedUrl);
        if (this.selectedFeedUrls.length === 0) {
          this.successMessage = 'OPML 中的所有播客均已在你的本地订阅列表中';
        }
      } catch (err) {
        this.errorMessage = err.message || 'OPML 解析失败';
        this.parsedFeeds = [];
        this.selectedFeedUrls = [];
      }
    },
    confirmImportOpml() {
      const selectedSet = new Set(this.selectedFeedUrls);
      const targets = this.parsedFeeds.filter(f => selectedSet.has(f.feedUrl));
      const summary = importSubscriptionsBatch(targets);
      this.subscriptionCount = summary.total;
      this.successMessage = `已导入 ${summary.added} 个新播客订阅（跳过 ${summary.skipped} 个已存在项）`;
      this.$emit('imported', summary);
      setTimeout(() => {
        this.close();
      }, 600);
    },
    handleExportOpml() {
      const subs = getSubscriptions();
      if (!subs.length) return;
      const xml = exportOpml(subs);
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yesplaymusic-podcasts-${new Date()
        .toISOString()
        .slice(0, 10)}.opml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.successMessage = `已导出 ${subs.length} 个订阅为 OPML 文件`;
    },
  },
};
</script>

<style lang="scss" scoped>
.rss-modal-container {
  color: var(--color-text);
  padding: 4px 2px 8px;
}

.mode-switch {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.mode-btn {
  flex: 1;
  height: 38px;
  border: none;
  border-radius: 10px;
  background: var(--color-secondary-bg);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  opacity: 0.75;
  transition: all 0.2s ease;

  &.active {
    background: var(--color-primary-bg);
    color: var(--color-primary);
    opacity: 1;
  }
}

.hint-text {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.6;
  opacity: 0.72;
}

.url-form {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.rss-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--color-secondary-bg);
  background: var(--color-secondary-bg);
  color: var(--color-text);
  font-size: 14px;
}

.primary-btn {
  height: 40px;
  padding: 0 18px;
  border-radius: 10px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.full-width {
    width: 100%;
    margin-top: 12px;
  }
}

.secondary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 14px;
  border-radius: 9px;
  border: none;
  background: var(--color-secondary-bg);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.preview-card {
  display: flex;
  gap: 14px;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-secondary-bg);
}

.preview-cover {
  width: 72px;
  height: 72px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
}

.preview-info {
  flex: 1;
  min-width: 0;
}

.preview-title {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
}

.preview-author {
  font-size: 12px;
  opacity: 0.68;
  margin-top: 4px;
}

.preview-desc {
  font-size: 12px;
  opacity: 0.72;
  margin-top: 6px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.opml-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.hidden-file {
  display: none;
}

.opml-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-secondary-bg);
  background: var(--color-secondary-bg);
  color: var(--color-text);
  font-size: 12px;
  font-family: monospace;
  resize: vertical;
}

.opml-parse-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}

.parse-summary {
  font-size: 13px;
  opacity: 0.75;
}

.opml-preview-list {
  margin-top: 12px;
  max-height: 180px;
  overflow-y: auto;
  border-radius: 10px;
  background: var(--color-secondary-bg);
  padding: 8px;
}

.opml-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  font-size: 13px;
  cursor: pointer;
}

.opml-item-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge-existing {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--color-primary-bg);
  color: var(--color-primary);
}

.feedback {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 9px;
  font-size: 13px;
  line-height: 1.5;

  &.error {
    background: rgba(229, 62, 62, 0.12);
    color: #e53e3e;
  }

  &.success {
    background: var(--color-primary-bg);
    color: var(--color-primary);
  }
}
</style>
