/* Offline regression checks for RSS / OPML Podcast architecture: node tests/podcast.cjs */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const babel = require('@babel/core');

const storage = new Map();
const localStorage = {
  getItem: key => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
  clear: () => storage.clear(),
};

function loadModule(file, mocks = {}, extra = {}) {
  const absPath = path.resolve(file);
  const dir = path.dirname(absPath);
  const code = babel.transformSync(fs.readFileSync(absPath, 'utf8'), {
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const mod = { exports: {} };
  vm.runInNewContext(
    code,
    {
      module: mod,
      exports: mod.exports,
      require: name => {
        if (Object.prototype.hasOwnProperty.call(mocks, name)) {
          return mocks[name];
        }
        if (name.startsWith('./') || name.startsWith('../')) {
          const resolved = path.resolve(dir, name);
          const candidate = resolved.endsWith('.js')
            ? resolved
            : `${resolved}.js`;
          if (fs.existsSync(candidate)) {
            return loadModule(candidate, mocks, extra);
          }
        }
        if (name.startsWith('@/')) {
          const resolved = path.resolve('src', name.slice(2));
          const candidate = resolved.endsWith('.js')
            ? resolved
            : `${resolved}.js`;
          if (fs.existsSync(candidate)) {
            return loadModule(candidate, mocks, extra);
          }
        }
        return require(name);
      },
      localStorage,
      console,
      URL,
      ...extra,
    },
    { filename: absPath }
  );
  return mod.exports;
}

async function main() {
  /* 1. XML & RSS 2.0 / Atom 解析 */
  const xml = require('../src/podcast/xml');
  assert.equal(
    xml.decodeXmlEntities('A &amp; B &lt;3&#39; &#x1F399;'),
    "A & B <3' 🎙"
  );

  const rss = require('../src/podcast/rss');
  assert.equal(rss.parseDuration('01:02:03'), 3723);
  assert.equal(rss.parseDuration('45:30'), 2730);
  assert.equal(rss.parseDuration('185'), 185);
  assert.equal(rss.parseDuration('invalid'), 0);

  const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
  <!-- 播客测试样例 -->
  <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
    <channel>
      <title>测试中文播客 &amp; 漫谈</title>
      <link>https://example.com/show</link>
      <description><![CDATA[<p>这是一档关于<b>技术</b>与生活的播客</p>]]></description>
      <language>zh-CN</language>
      <itunes:author>主播甲</itunes:author>
      <itunes:image href="https://cdn.example.com/cover.jpg" />
      <itunes:category text="Technology"><itunes:category text="Tech News" /></itunes:category>
      <item>
        <title>EP01 为什么改用标准 RSS</title>
        <guid>ep-guid-001</guid>
        <pubDate>Tue, 17 Nov 2026 08:00:00 +0800</pubDate>
        <itunes:duration>01:12:05</itunes:duration>
        <description>简要说明</description>
        <content:encoded><![CDATA[<p>完整 <strong>Show Notes</strong> 节目单</p><a href="https://example.com/ref">参考链接</a>]]></content:encoded>
        <enclosure url="https://audio.example.com/ep01.mp3" length="123456" type="audio/mpeg" />
      </item>
      <item>
        <title>EP02 无音频条目的公告（应跳过）</title>
        <guid>ep-guid-no-audio</guid>
      </item>
      <item>
        <title>EP01 重复 GUID（应去重）</title>
        <guid>ep-guid-001</guid>
        <enclosure url="https://audio.example.com/ep01.mp3" type="audio/mpeg" />
      </item>
    </channel>
  </rss>`;

  const parsedRss = rss.parseRssFeed(sampleRss, 'https://feeds.example.com/rss.xml');
  assert.equal(parsedRss.podcast.title, '测试中文播客 & 漫谈');
  assert.equal(parsedRss.podcast.author, '主播甲');
  assert.equal(parsedRss.podcast.coverImgUrl, 'https://cdn.example.com/cover.jpg');
  assert.ok(parsedRss.podcast.categories.includes('Technology'));
  assert.equal(parsedRss.episodes.length, 1);
  assert.equal(parsedRss.episodes[0].duration, 4325);
  assert.match(parsedRss.episodes[0].showNotes, /完整 <strong>Show Notes<\/strong>/);
  assert.equal(parsedRss.episodes[0].audioUrl, 'https://audio.example.com/ep01.mp3');
  assert.equal(
    parsedRss.podcast.pid,
    rss.createPodcastId('https://feeds.example.com/rss.xml')
  );

  const sampleAtom = `<?xml version="1.0" encoding="utf-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <title>Atom 播客样例</title>
    <author><name>Atom 主播</name></author>
    <entry>
      <id>atom-ep-1</id>
      <title>第一集</title>
      <published>2026-11-18T10:00:00Z</published>
      <link rel="enclosure" type="audio/mp4" href="https://audio.example.com/atom1.m4a" />
      <summary>Atom 简介</summary>
    </entry>
  </feed>`;
  const parsedAtom = rss.parseRssFeed(sampleAtom, 'https://feeds.example.com/atom.xml');
  assert.equal(parsedAtom.podcast.title, 'Atom 播客样例');
  assert.equal(parsedAtom.episodes.length, 1);
  assert.equal(parsedAtom.episodes[0].audioUrl, 'https://audio.example.com/atom1.m4a');
  console.log('PASS: XML, RSS 2.0 and Atom parsing');

  /* 2. OPML 导入与导出往返 */
  const opml = require('../src/podcast/opml');
  const sampleOpml = `<?xml version="1.0" encoding="UTF-8"?>
  <opml version="2.0">
    <head><title>我的播客</title></head>
    <body>
      <outline text="科技">
        <outline type="rss" text="科技漫谈 &amp; 杂谈" xmlUrl="https://feeds.example.com/tech.xml" htmlUrl="https://example.com/tech" />
        <outline type="rss" text="重复源" xmlUrl="https://feeds.example.com/tech.xml" />
      </outline>
      <outline type="rss" title="商业故事" xmlUrl="https://feeds.example.com/biz.xml" />
    </body>
  </opml>`;
  const importedFeeds = opml.parseOpml(sampleOpml);
  assert.equal(importedFeeds.length, 2);
  assert.equal(importedFeeds[0].title, '科技漫谈 & 杂谈');
  assert.deepEqual(importedFeeds[0].categories, ['科技']);
  const exportedXml = opml.exportOpml(importedFeeds);
  const roundTrip = opml.parseOpml(exportedXml);
  assert.equal(roundTrip.length, 2);
  assert.equal(roundTrip[0].title, '科技漫谈 & 杂谈');
  assert.equal(roundTrip[1].feedUrl, 'https://feeds.example.com/biz.xml');
  console.log('PASS: OPML parse, deduplication, export and round-trip');

  /* 3. SSRF 安全校验 */
  const security = require('../src/podcast/security');
  assert.equal(
    security.validatePublicHttpUrl('https://feeds.fireside.fm/test/rss#top'),
    'https://feeds.fireside.fm/test/rss'
  );
  for (const blockedUrl of [
    'http://localhost:8080/feed.xml',
    'http://127.0.0.1/feed.xml',
    'http://10.0.0.1/feed.xml',
    'http://172.16.0.5/feed.xml',
    'http://192.168.1.1/feed.xml',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/feed.xml',
    'file:///etc/passwd',
    'ftp://example.com/feed.xml',
  ]) {
    assert.throws(
      () => security.validatePublicHttpUrl(blockedUrl),
      err => err.status === 400,
      `must block ${blockedUrl}`
    );
  }
  await assert.rejects(
    security.assertPublicHostResolution('https://internal.example.com/rss', async () => [
      { address: '127.0.0.1', family: 4 },
    ]),
    err => err.status === 400
  );
  console.log('PASS: SSRF and protocol validation');

  /* 4. 后端服务：RSS 重定向防护、iTunes 搜索与榜单解析 */
  const service = loadModule('src/podcast/service.js', {
    axios: {
      create: () => ({
        get: async (url, config = {}) => {
          if (url === 'https://public.example.com/redirect-to-local') {
            return {
              status: 302,
              headers: { location: 'http://127.0.0.1/secret' },
              data: '',
            };
          }
          if (url === 'https://public.example.com/feed.xml') {
            return { status: 200, headers: {}, data: sampleRss };
          }
          if (url === 'https://itunes.apple.com/search') {
            if (config.params.entity === 'podcastEpisode') {
              return {
                status: 200,
                data: {
                  results: [
                    {
                      trackId: 901,
                      collectionId: 101,
                      trackName: '搜索单集测试',
                      collectionName: '播客名',
                      episodeUrl: 'https://audio.example.com/search-ep.mp3',
                      feedUrl: 'https://feeds.example.com/show.xml',
                      trackTimeMillis: 900000,
                      releaseDate: '2026-11-15T00:00:00Z',
                    },
                  ],
                },
              };
            }
            return {
              status: 200,
              data: {
                results: [
                  {
                    collectionId: 101,
                    collectionName: '声动早咖啡',
                    artistName: '声动活泼',
                    feedUrl: 'https://feeds.example.com/morning.xml',
                    artworkUrl600: 'https://cdn.example.com/morning.jpg',
                    trackCount: 300,
                    genres: ['商业', '播客'],
                  },
                ],
              },
            };
          }
          if (url.includes('/rss/toppodcasts/')) {
            return {
              status: 200,
              data: {
                feed: {
                  title: { label: 'Apple Podcasts 热门播客' },
                  updated: { label: '2026-11-19T00:00:00Z' },
                  entry: [
                    {
                      id: { attributes: { 'im:id': '101' } },
                      'im:name': { label: '声动早咖啡' },
                      'im:artist': { label: '声动活泼' },
                      'im:image': [{ label: 'https://cdn.example.com/small.jpg' }],
                      category: { attributes: { label: '商业' } },
                    },
                  ],
                },
              },
            };
          }
          if (url === 'https://itunes.apple.com/lookup') {
            return {
              status: 200,
              data: {
                results: [
                  {
                    collectionId: 101,
                    collectionName: '声动早咖啡',
                    artistName: '声动活泼',
                    feedUrl: 'https://feeds.example.com/morning.xml',
                    artworkUrl600: 'https://cdn.example.com/morning600.jpg',
                    trackCount: 300,
                    genres: ['商业', '播客'],
                  },
                ],
              },
            };
          }
          throw new Error(`Unexpected URL in mock: ${url}`);
        },
      }),
    },
    './security': {
      validatePublicHttpUrl: security.validatePublicHttpUrl,
      assertPublicHostResolution: async u => security.validatePublicHttpUrl(u),
    },
  });

  await assert.rejects(
    service.fetchFeed('https://public.example.com/redirect-to-local'),
    err => err.status === 400
  );
  const fetched = await service.fetchFeed('https://public.example.com/feed.xml');
  assert.equal(fetched.podcast.title, '测试中文播客 & 漫谈');
  assert.equal(fetched.episodes.length, 1);

  const podSearch = await service.searchPodcasts({ term: '早咖啡', entity: 'podcast' });
  assert.equal(podSearch.items.length, 1);
  assert.equal(podSearch.items[0].feedUrl, 'https://feeds.example.com/morning.xml');

  const epSearch = await service.searchPodcasts({
    term: '测试',
    entity: 'podcastEpisode',
  });
  assert.equal(epSearch.items.length, 1);
  assert.equal(epSearch.items[0].duration, 900);

  const charts = await service.getTopCharts({ country: 'CN', limit: 10 });
  assert.equal(charts.items.length, 1);
  assert.equal(charts.items[0].feedUrl, 'https://feeds.example.com/morning.xml');
  assert.equal(charts.items[0].coverImgUrl, 'https://cdn.example.com/morning600.jpg');
  console.log('PASS: feed fetch, redirect SSRF guard, iTunes search and top charts');

  /* 5. 本地存储与适配器 */
  localStorage.clear();
  const adapter = loadModule('src/podcast/adapter.js');
  const podStorage = loadModule('src/podcast/storage.js');

  const track = adapter.adaptEpisodeToTrack(
    parsedRss.episodes[0],
    parsedRss.podcast
  );
  assert.ok(track.id.startsWith('rss_'));
  assert.equal(track.isPodcast, true);
  assert.equal(track.dt, 4325000);
  assert.equal(track.ar[0].name, '测试中文播客 & 漫谈');

  const sub = podStorage.subscribePodcast(parsedRss.podcast);
  assert.equal(podStorage.isSubscribed(sub.feedUrl), true);
  assert.equal(podStorage.getFeedUrlByPid(sub.pid), sub.feedUrl);
  const batchRes = podStorage.importSubscriptionsBatch([
    { feedUrl: sub.feedUrl, title: '重复' },
    { feedUrl: 'https://feeds.example.com/new.xml', title: '新播客' },
  ]);
  assert.equal(batchRes.added, 1);
  assert.equal(batchRes.skipped, 1);

  podStorage.saveEpisodeProgress(track.eid, 128);
  assert.equal(podStorage.getEpisodeProgress(track.eid), 128);
  podStorage.recordListeningHistory(track, 128);
  assert.equal(podStorage.getListeningHistory().length, 1);
  assert.equal(podStorage.getCachedTrackById(track.id).url, track.url);

  podStorage.unsubscribePodcast(sub.pid);
  assert.equal(podStorage.isSubscribed(sub.feedUrl), false);
  console.log('PASS: adapter and local subscription/history/progress storage');

  /* 6. Player 集成校验（无任何小宇宙私有 API 调用） */
  const playerMocks = {};
  const playerSource = fs.readFileSync('src/utils/Player.js', 'utf8');
  assert.ok(!/xiaoyuzhou|@\/xyz/.test(playerSource), 'Player.js must not reference xyz');
  for (const match of playerSource.matchAll(/from '([^']+)'/g)) {
    playerMocks[match[1]] = {};
  }
  const Player = loadModule('src/utils/Player.js', playerMocks, {
    process: { env: {} },
  }).default;

  const player = Object.create(Player.prototype);
  player._currentTrack = track;
  player._howler = { _podcastEid: 'other-eid', seek: () => 55 };
  player._syncPodcastProgress();
  assert.equal(
    podStorage.getEpisodeProgress(track.eid),
    128,
    'mismatched audio instance must not overwrite progress'
  );
  player._howler._podcastEid = track.eid;
  player._syncPodcastProgress();
  assert.equal(podStorage.getEpisodeProgress(track.eid), 55);

  player._currentTrack = { id: 12345 };
  player._playlistSource = { type: 'podcast' };
  assert.equal(player.isPodcast, false, 'music track must not inherit podcast mode');
  let appliedRate;
  player._howler.rate = val => {
    appliedRate = val;
  };
  player.playbackRate = 1.5;
  assert.equal(appliedRate, 1, 'music playback must remain 1x');
  player._currentTrack = track;
  player.playbackRate = 1.5;
  assert.equal(appliedRate, 1.5, 'podcast playback must apply custom rate');
  console.log('PASS: Player RSS integration, local progress ownership and rate isolation');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
