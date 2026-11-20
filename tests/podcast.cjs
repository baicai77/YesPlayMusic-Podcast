/* Offline regression checks: node tests/podcast.cjs */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { createRequire } = require('module');
const { resolve } = require('path');
const babel = require('@babel/core');
const storage = new Map();
const localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
function load(file, mocks = {}, extra = {}) {
  const sourceRequire = createRequire(resolve(file));
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), {
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      require: name => mocks[name] || sourceRequire(name),
      localStorage,
      console,
      URL,
      ...extra,
    },
    { filename: file }
  );
  return module.exports;
}
async function main() {
  let refreshRequest;
  let refreshResponse = {
    headers: {},
    data: {
      'x-jike-access-token': 'next-access',
      'x-jike-refresh-token': 'next-refresh',
    },
  };
  const refreshApi = load('src/xyz/api.js', {
    axios: {
      create: () => ({
        post: async (url, body, options) => {
          refreshRequest = { url, body, options };
          return refreshResponse;
        },
      }),
    },
  });
  const refreshed = await refreshApi.refreshToken('old-refresh', 'old-access');
  assert.equal(
    refreshRequest.url,
    'https://api.xiaoyuzhoufm.com/app_auth_tokens.refresh'
  );
  assert.equal(
    refreshRequest.options.headers['x-jike-access-token'],
    'old-access'
  );
  assert.equal(
    refreshRequest.options.headers['x-jike-refresh-token'],
    'old-refresh'
  );
  assert.equal(refreshed.tokens.accessToken, 'next-access');
  refreshResponse = {
    headers: { 'x-jike-access-token': 'header-access' },
    data: {},
  };
  assert.equal(
    (await refreshApi.refreshToken('old-refresh', 'old-access')).tokens
      .accessToken,
    'header-access'
  );
  await assert.rejects(
    refreshApi.refreshToken('old-refresh'),
    error => error.status === 400
  );
  console.log(
    'PASS: upstream token refresh path, credential pair and body/header responses'
  );
  const adapter = load('src/xyz/adapter.js');
  assert.equal(
    adapter.adaptEpisodeToTrack({ eid: 'count-test', playCount: 12345 })
      .playCount,
    12345
  );
  assert.equal(
    adapter.adaptEpisodeToTrack({ eid: 'missing-count' }).playCount,
    null
  );
  assert.equal(adapter.formatPlayCount(0), '0次收听');
  assert.equal(adapter.formatPlayCount(12345), '1.2万次收听');
  assert.equal(adapter.formatPlayCount(null), '');
  const sampleEpisode = {
    eid: 'discovery-episode',
    title: '测试单集',
    podcast: { pid: 'discovery-podcast', title: '测试节目' },
  };
  const discovery = adapter.adaptDiscovery({
    data: {
      data: [
        { type: 'DISCOVERY_HEADER', data: [{ id: 'banner' }] },
        {
          type: 'DISCOVERY_EPISODE_RECOMMEND',
          data: { target: [{ episode: sampleEpisode }] },
        },
        { type: 'EDITOR_PICK', data: { picks: [{ episode: sampleEpisode }] } },
      ],
    },
  });
  assert.equal(discovery.episodes.length, 1);
  assert.equal(discovery.podcasts.length, 1);
  assert.equal(discovery.episodes[0].ar[0].name, '测试节目');
  if (process.argv[2]) {
    const actual = adapter.adaptDiscovery(
      JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
    );
    assert.ok(actual.episodes.length > 0);
    assert.ok(actual.podcasts.length > 0);
    console.log(
      `PASS: supplied response parsed into ${actual.episodes.length} episodes and ${actual.podcasts.length} podcasts`
    );
  }
  const ranked = adapter.adaptRanking({
    data: {
      items: [
        { item: sampleEpisode },
        { item: { ...sampleEpisode, eid: 'second-episode' } },
      ],
    },
  });
  assert.equal(ranked.length, 2);
  assert.equal(ranked[1].eid, 'second-episode');
  let topRequest;
  let subscriptionBody;
  const api = load('src/xyz/api.js', {
    axios: {
      create: () => ({
        get: async (url, options) => {
          topRequest = { url, options };
          return { data: {} };
        },
        post: async (url, body) => {
          subscriptionBody = body;
          return { data: {} };
        },
      }),
    },
  });
  await api.getSubscriptions('fake-test-token', { loadMoreKey: { skip: 20 } });
  for (const [type, category] of Object.entries({
    HOT: 'HOT_EPISODES_IN_24_HOURS',
    NEW: 'NEW_STAR_EPISODES',
    ROCK: 'SKYROCKET_EPISODES',
  })) {
    await api.getTopList('fake-test-token', type);
    assert.equal(
      topRequest.url,
      'https://api.xiaoyuzhoufm.com/v1/top-list/get'
    );
    assert.equal(topRequest.options.params.category, category);
  }
  for (const [type, category] of Object.entries({
    NEW_STAR: 'NEW_STAR_EPISODES',
    SPARK: 'SKYROCKET_EPISODES',
    ' hot ': 'HOT_EPISODES_IN_24_HOURS',
    SKYROCKET_EPISODES: 'SKYROCKET_EPISODES',
  })) {
    await api.getTopList('fake-test-token', type);
    assert.equal(topRequest.options.params.category, category);
  }
  await assert.rejects(
    api.getTopList('fake-test-token', 'unknown'),
    error => error.status === 400
  );
  await assert.rejects(
    api.getTopList('fake-test-token', {}),
    error => error.status === 400
  );
  console.log(
    'PASS: ranking endpoint, current/legacy categories, invalid input and ordered episode adaptation'
  );
  assert.equal(subscriptionBody.sortBy, 'subscribedAt');
  assert.equal(subscriptionBody.sortOrder, 'desc');
  assert.equal(subscriptionBody.loadMoreKey.skip, 20);
  console.log(
    'PASS: nested discovery cards, deduplication and subscription sort contract'
  );
  const track = adapter.adaptEpisodeToTrack(
    {
      eid: 'e1',
      duration: 120,
      playbackProgress: { progress: 42 },
      media: { source: { url: 'https://audio.example/test.m4a' } },
    },
    {
      pid: 'p1',
      name: '节目名称',
      coverImgUrl: 'https://image.example/cover.jpg',
    }
  );
  assert.equal(track.ar[0].name, '节目名称');
  assert.equal(track.al.picUrl, 'https://image.example/cover.jpg');
  assert.equal(track.playbackProgress, 42);
  assert.equal(track.dt, 120000);
  assert.equal(adapter.adaptEpisodeToTrack({}), null);
  assert.equal(adapter.xyzList({ data: { items: [1, 2] } }).length, 2);
  assert.equal(adapter.xyzCursor({ loadMoreKey: { id: 'next' } }).id, 'next');
  let responseError;
  let prepareRequest;
  let refreshes = 0;
  let retries = 0;
  const client = config => {
    retries++;
    return Promise.resolve(config);
  };
  client.interceptors = {
    request: {
      use(handler) {
        prepareRequest = handler;
      },
    },
    response: {
      use(ok, error) {
        responseError = error;
      },
    },
  };
  client.post = async () => {
    refreshes++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return { tokens: { accessToken: 'new', refreshToken: 'refresh-new' } };
  };
  const session = load('src/xyz/client.js', {
    axios: { create: () => client },
  });
  assert.match(
    session.xyzErrorMessage({
      response: { data: { error: { message: 'empty captchaVerifyParam' } } },
    }),
    /尚未接入/
  );
  session.setXyzToken('old');
  session.setXyzRefreshToken('refresh-old');
  await Promise.all(
    [1, 2, 3].map(() =>
      responseError({
        response: { status: 401 },
        config: prepareRequest({ url: '/subscription', headers: {} }),
      })
    )
  );
  assert.equal(refreshes, 1, 'parallel 401s must share one refresh');
  assert.equal(retries, 3);
  assert.equal(session.getXyzToken(), 'new');
  client.post = async () => ({
    data: { uid: 'test-user', nickname: '测试用户' },
  });
  const imported = await session.importXyzSession(
    'test-access',
    'test-refresh'
  );
  assert.equal(imported.uid, 'test-user');
  assert.equal(session.getXyzToken(), 'test-access');
  client.post = async () => {
    throw new Error('verification failed');
  };
  await assert.rejects(session.importXyzSession('invalid-access'));
  assert.equal(
    session.getXyzToken(),
    'test-access',
    'failed import must retain previous session'
  );
  await assert.rejects(session.importXyzSession('full cookie value'));
  session.logoutXyz();
  assert.equal(session.isXyzLoggedIn(), false);
  assert.equal(session.getXyzRefreshToken(), '');

  // Cache, in-flight deduplication, cache invalidation & error messages
  assert.match(session.xyzErrorMessage({ response: { status: 429 } }), /频繁/);
  assert.match(session.xyzErrorMessage({ response: { status: 403 } }), /受限/);
  assert.match(session.xyzErrorMessage({ code: 'ECONNABORTED' }), /超时/);
  assert.match(session.xyzErrorMessage({ response: { status: 504 } }), /超时/);
  assert.match(
    session.xyzErrorMessage({
      response: { status: 429, headers: { 'retry-after': '30' } },
    }),
    /等待 30 秒/
  );
  let discoveryCalls = 0;
  client.post = async url => {
    if (url === '/discovery') {
      discoveryCalls++;
      await new Promise(resolve => setTimeout(resolve, 5));
      return { items: [{ id: discoveryCalls }] };
    }
    return {};
  };
  const [d1, d2] = await Promise.all([
    session.xyzService.getDiscovery(),
    session.xyzService.getDiscovery(),
  ]);
  assert.equal(discoveryCalls, 1, 'concurrent discovery calls must coalesce');
  assert.deepEqual(d1, d2);
  await session.xyzService.getDiscovery();
  assert.equal(
    discoveryCalls,
    1,
    'cached discovery must not refetch within TTL'
  );
  session.clearXyzCache();
  await session.xyzService.getDiscovery();
  assert.equal(discoveryCalls, 2, 'clearXyzCache must invalidate cache');
  session.clearXyzCache();
  const pendingResponses = [];
  client.post = () => new Promise(resolve => pendingResponses.push(resolve));
  const stale = session.xyzService.getDiscovery();
  await Promise.resolve();
  session.clearXyzCache();
  const fresh = session.xyzService.getDiscovery();
  await Promise.resolve();
  pendingResponses[0]('stale');
  await stale;
  assert.strictEqual(session.xyzService.getDiscovery(), fresh);
  pendingResponses[1]('fresh');
  assert.equal(await fresh, 'fresh');
  assert.equal(await session.xyzService.getDiscovery(), 'fresh');
  let subscriptionCalls = 0;
  client.post = async (url, data) => ({
    page: ++subscriptionCalls,
    limit: data?.limit ?? 25,
  });
  assert.equal(
    (await session.xyzService.getSubscriptions({ limit: 10 })).limit,
    10
  );
  assert.equal(
    (await session.xyzService.getSubscriptions({ limit: 25 })).limit,
    25
  );
  assert.equal((await session.xyzService.getSubscriptions()).page, 2);
  const oldRequest = prepareRequest({ url: '/subscription', headers: {} });
  session.replaceXyzSession('old-account', 'old-refresh', { uid: 'old' });
  assert.equal((await session.xyzService.getSubscriptions()).page, 3);
  await assert.rejects(
    responseError({ response: { status: 401 }, config: oldRequest })
  );
  assert.equal(session.getXyzToken(), 'old-account');
  let finishRefresh;
  client.post = () =>
    new Promise(resolve => {
      finishRefresh = resolve;
    });
  const refreshing = responseError({
    response: { status: 401 },
    config: prepareRequest({ url: '/subscription', headers: {} }),
  });
  const staleRefresh = assert.rejects(refreshing, /登录状态已更改/);
  session.replaceXyzSession('new-account', 'new-refresh', { uid: 'new' });
  finishRefresh({ tokens: { accessToken: 'stale-token' } });
  await staleRefresh;
  assert.equal(session.getXyzToken(), 'new-account');
  assert.equal(session.canSyncXyzProgress(), true);
  await assert.rejects(
    responseError({
      response: { status: 403 },
      config: prepareRequest({ url: '/playback_progress', headers: {} }),
    })
  );
  assert.equal(session.canSyncXyzProgress(), false);
  session.replaceXyzSession('verified-account', 'verified-refresh', {
    uid: 'verified',
  });
  assert.equal(session.canSyncXyzProgress(), true);
  let unexpectedRefreshes = 0;
  client.post = async () => {
    unexpectedRefreshes++;
  };
  const challenge = {
    response: { status: 401, data: { error: 'captchaVerifyParam' } },
    config: prepareRequest({ url: '/playback_progress_update', headers: {} }),
  };
  await assert.rejects(responseError(challenge), error => error === challenge);
  assert.equal(unexpectedRefreshes, 0);
  assert.equal(session.getXyzToken(), 'verified-account');
  assert.equal(session.canSyncXyzProgress(), false);
  const mocks = {};
  const playerSource = fs.readFileSync('src/utils/Player.js', 'utf8');
  for (const match of playerSource.matchAll(/from '([^']+)'/g))
    mocks[match[1]] = {};
  let onAudioLoad;
  let sought;
  mocks.howler = {
    Howler: { unload() {} },
    Howl: class {
      rate() {}
      on() {}
      once(event, callback) { if (event === 'load') onAudioLoad = callback; }
      duration() { return 120.25; }
      seek(value) { sought = value; }
    },
  };
  mocks['@/xyz/client'] = { xyzService: {}, canSyncXyzProgress: () => false };
  const Player = load('src/utils/Player.js', mocks, {
    process: { env: {} },
  }).default;
  const rssPlayer = Object.create(Player.prototype);
  rssPlayer.setOutputDevice = () => {};
  rssPlayer._currentTrack = { eid: 'rss:test', localPodcast: true, dt: 0 };
  localStorage.setItem('xyz_progress_rss:test', '45');
  rssPlayer._playAudioSource('https://example.test/audio.mp3', false);
  assert.equal(rssPlayer.currentTrackDuration, 1);
  onAudioLoad();
  assert.equal(rssPlayer.currentTrackDuration, 121);
  assert.equal(sought, 45);
  const player = Object.create(Player.prototype);
  player._currentTrack = track;
  player._howler = { _xyzEid: 'other', seek: () => 33 };
  player._syncPodcastProgress();
  assert.equal(
    localStorage.getItem('xyz_progress_e1'),
    null,
    'old audio cannot overwrite another episode'
  );
  player._howler._xyzEid = 'e1';
  player._syncPodcastProgress();
  assert.equal(localStorage.getItem('xyz_progress_e1'), '33');

  let cloudSyncCalls = 0;
  mocks['@/xyz/client'] = {
    xyzService: {
      updatePlaybackProgress: () => {
        cloudSyncCalls++;
        return cloudSyncCalls === 1
          ? Promise.reject(new Error('offline'))
          : Promise.resolve();
      },
    },
    canSyncXyzProgress: () => true,
    getXyzSessionVersion: session.getXyzSessionVersion,
  };
  player._syncPodcastProgress();
  player._syncPodcastProgress();
  assert.equal(
    cloudSyncCalls,
    1,
    'duplicate cloud progress sync for same second must be skipped'
  );
  await new Promise(resolve => setImmediate(resolve));
  player._syncPodcastProgress();
  assert.equal(cloudSyncCalls, 2, 'same position must retry after failure');
  await new Promise(resolve => setImmediate(resolve));
  player._syncPodcastProgress();
  assert.equal(cloudSyncCalls, 2, 'confirmed position must not be sent twice');
  session.replaceXyzSession('third-account', '', { uid: 'third' });
  player._syncPodcastProgress();
  assert.equal(
    cloudSyncCalls,
    3,
    'a different account must sync independently'
  );
  player._currentTrack = { id: 123 };
  player._playlistSource = { type: 'podcast' };
  assert.equal(player.isPodcast, false, 'music must not inherit podcast mode');
  let rate;
  player._howler.rate = value => {
    rate = value;
  };
  player.playbackRate = 1.5;
  assert.equal(rate, 1, 'music must remain normal speed');
  player._currentTrack = track;
  player.playbackRate = 1.5;
  assert.equal(rate, 1.5);
  console.log(
    'PASS: audio ownership, local resume, podcast detection and music/podcast playback rates'
  );
  console.log(
    'PASS: adapter metadata, duration, progress, invalid episodes, nested lists, pagination, concurrent refresh, retry and logout'
  );
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
