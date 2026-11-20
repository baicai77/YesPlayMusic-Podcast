// Offline API contract checks against the reviewed upstream handlers.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { createRequire } = require('module');
const { upstreamRequestScope } = require('../src/xyz/requestScope');
const apiRequire = createRequire(require.resolve('../src/xyz/api'));
let transportOptions;
let request;
const transport = {};
for (const method of ['get', 'post']) {
  transport[method] = async (url, body, options) => {
    request = {
      method,
      url,
      body: method === 'get' ? undefined : body,
      options: method === 'get' ? body : options,
    };
    return { data: {}, headers: {} };
  };
}
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync('src/xyz/api.js', 'utf8'), {
  require: name =>
    name === 'axios'
      ? {
          create: options => {
            transportOptions = options;
            return transport;
          },
        }
      : apiRequire(name),
  module: moduleStub,
  console,
  Date,
  Number,
  Map,
  Error,
  encodeURIComponent,
});
const api = moduleStub.exports;
function check(method, path) {
  assert.equal(request.method, method);
  assert.equal(request.url, `https://api.xiaoyuzhoufm.com${path}`);
  assert.match(request.options.headers['User-Agent'], /^YesPlayMusic\//);
  assert.equal(request.options.headers.Accept, 'application/json');
  for (const header of ['OS', 'Model', 'Host', 'BundleID', 'Content-Type']) {
    assert.ok(!(header in request.options.headers), header);
  }
  assert.equal(request.options.headers['x-jike-access-token'], 'test-token');
}
async function main() {
  assert.equal(transportOptions.timeout, 12000);
  assert.equal(transportOptions.maxRedirects, 0);
  assert.equal(transportOptions.httpsAgent.keepAlive, true);
  await api.getSubscriptions('test-token');
  check('post', '/v1/subscription/list');
  assert.equal(request.body.sortBy, 'subscribedAt');
  await api.getDiscovery('test-token');
  check('post', '/v1/discovery-feed/list');
  const { token: cancelToken } = require('axios').CancelToken.source();
  await upstreamRequestScope.run({ cancelToken }, () =>
    api.getDiscovery('test-token')
  );
  assert.strictEqual(request.options.cancelToken, cancelToken);
  await api.getDiscovery('test-token');
  assert.equal(request.options.cancelToken, undefined);
  await api.getSubscriptionUpdates('test-token');
  check('post', '/v1/inbox/list');
  await api.getEpisodeList('test-token', { pid: 'p', order: 'asc' });
  check('post', '/v1/episode/list');
  assert.equal(request.body.order, 'asc');
  await api.getEpisodeDetail('test-token', 'e');
  check('get', '/v1/episode/get?eid=e');
  await api.getPodcastDetail('test-token', 'p');
  check('get', '/v1/podcast/get?pid=p');
  await api.search('test-token', { keyword: 'test', type: 'EPISODE' });
  check('post', '/v1/search/create');
  assert.equal(request.body.keyword, 'test');
  assert.equal(request.body.currentPageName, '4');
  await api.searchPreset('test-token');
  check('get', '/v1/search/get-preset');
  await api.getClaps('test-token', 'e', 120);
  check('post', '/v1/clap/list');
  assert.equal(request.body.duration, 120);
  await api.getComments('test-token', { eid: 'e' });
  check('post', '/v1/comment/list-primary');
  assert.equal(request.body.owner.id, 'e');
  assert.equal(request.body.owner.type, 'EPISODE');
  await api.getFavoriteEpisodes('test-token');
  check('post', '/v1/favorite/list');
  await api.getPlayedHistory('test-token');
  check('post', '/v1/episode-played/list-history');
  await api.getUserProfile('test-token', 'u');
  check('get', '/v1/profile/get?uid=u');
  await api.getOwnProfile('test-token');
  check('get', '/v1/profile/get');
  await api.getPlaybackProgress('test-token', ['e']);
  check('post', '/v1/playback-progress/list');
  await api.updatePlaybackProgress('test-token', {
    pid: 'p',
    eid: 'e',
    progress: 12.9,
  });
  check('post', '/v1/playback-progress/update');
  assert.equal(request.body.data[0].pid, 'p');
  assert.equal(request.body.data[0].progress, 12);
  assert.ok(Number.isFinite(Date.parse(request.body.data[0].playedAt)));
  await assert.rejects(
    api.updatePlaybackProgress('test-token', { eid: 'e', progress: -1 }),
    error => error.status === 400
  );
  console.log(
    'PASS: reviewed read endpoints, search fields, comment owner and playback progress batch contract'
  );
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
