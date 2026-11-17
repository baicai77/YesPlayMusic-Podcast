const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
function load(source, mocks, extra = {}) {
  const module = { exports: {} };
  const code = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: name => mocks[name],
    console,
    ...extra,
  });
  return module.exports;
}
async function main() {
  const values = new Map();
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const cookies = {
    get: () => undefined,
    set: (key, value) => values.set(key, value),
  };
  const auth = load(
    fs.readFileSync('src/utils/auth.js', 'utf8'),
    {
      'js-cookie': cookies,
      '@/api/auth': {},
      '@/store': { state: { data: {} } },
    },
    { localStorage }
  );
  assert.equal(auth.isLoggedIn(), false);
  auth.setCookies(
    'MUSIC_U=fake==; Domain=.music.163.com; Path=/; HTTPOnly;__csrf=test; Max-Age=100'
  );
  assert.equal(auth.getCookie('MUSIC_U'), 'fake==');
  assert.equal(auth.getCookie('__csrf'), 'test');
  assert.equal(values.has('cookie-Domain'), false);
  auth.setCookies('MUSIC_U=second;;__csrf=second-csrf');
  assert.equal(auth.getCookie('__csrf'), 'second-csrf');
  assert.throws(() => auth.setCookies(''));
  const source = fs
    .readFileSync('src/views/loginAccount.vue', 'utf8')
    .split('<script>')[1]
    .split('</script>')[0];
  const mocks = {
    qrcode: {},
    'crypto-js/md5': {},
    nprogress: {},
    vuex: { mapMutations: () => ({}) },
    '@/utils/auth': auth,
    '@/utils/nativeAlert': {},
    '@/api/auth': {},
  };
  const component = load(source, mocks).default;
  let navigated = false;
  const context = {
    processing: false,
    updateData() {},
    $store: {
      state: { data: { user: { userId: 123 } } },
      dispatch: action =>
        action === 'fetchLikedPlaylist'
          ? Promise.reject(new Error('unavailable'))
          : Promise.resolve(),
    },
    $router: {
      push: async () => {
        navigated = true;
      },
    },
  };
  await component.methods.handleLoginResponse.call(context, {
    code: 200,
    cookie: 'MUSIC_U=fake',
  });
  assert.equal(navigated, true);
  assert.equal(context.processing, false);
  context.$store.state.data.user = {};
  await component.methods.handleLoginResponse.call(context, {
    code: 200,
    cookie: 'MUSIC_U=fake',
  });
  assert.match(context.qrCodeInformation, /获取账号资料失败/);
  const detailSource = fs
    .readFileSync('src/views/podcast.vue', 'utf8')
    .split('<script>')[1]
    .split('</script>')[0];
  let toggled = 0;
  let replaced = 0;
  const detail = load(detailSource, {
    '@/components/ButtonTwoTone.vue': {},
    '@/components/Modal.vue': {},
    '@/xyz/client': {},
    '@/xyz/adapter': {},
    '@/xyz/notes': {},
  }).default;
  const player = {
    currentTrack: { id: 'xyz_test' },
    _howler: {},
    playOrPause: () => toggled++,
    playPodcastEpisode: async () => replaced++,
  };
  await detail.methods.playEpisode.call(
    { $store: { state: { player } }, episodes: [] },
    { id: 'xyz_test' }
  );
  assert.equal(toggled, 1);
  assert.equal(replaced, 0);
  console.log(
    'PASS: cookie formats, attributes, missing login, equals in values, playlist failure and profile error feedback'
  );
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
