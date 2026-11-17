/* Offline regression checks: node tests/podcast.cjs */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const storage = new Map();
const localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
function load(file, mocks = {}, extra = {}) {
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
      require: name => mocks[name] || require(name),
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
  let refreshes = 0;
  let retries = 0;
  const client = config => {
    retries++;
    return Promise.resolve(config);
  };
  client.interceptors = {
    request: { use() {} },
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
        config: { url: '/subscription' },
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
  const mocks = {};
  const playerSource = fs.readFileSync('src/utils/Player.js', 'utf8');
  for (const match of playerSource.matchAll(/from '([^']+)'/g))
    mocks[match[1]] = {};
  mocks['@/xyz/client'] = { xyzService: {}, isXyzLoggedIn: () => false };
  const Player = load('src/utils/Player.js', mocks, {
    process: { env: {} },
  }).default;
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
