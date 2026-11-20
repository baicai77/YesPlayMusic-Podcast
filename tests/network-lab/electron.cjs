const assert = require('assert');
const { app, BrowserWindow } = require('electron');
const { buildSync } = require('esbuild');
const { createMock } = require('./mock.cjs');
const path = require('path');

app.commandLine.appendSwitch('no-proxy-server');
app.setPath('userData', process.env.PI_SCRATCH_DIR || app.getPath('temp'));

async function main() {
  await app.whenReady();
  const server = createMock();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const win = new BrowserWindow({
    show: false,
    webPreferences: { partition: 'podcast-mock', sandbox: true },
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith(origin + '/') });
  });
  try {
    await win.loadURL(origin + '/json');
    const result = await win.webContents.executeJavaScript(`(async () => {
      const results = [];
      for (const path of ['/json', '/gzip', '/auth', '/limit']) {
        const response = await fetch(path, { credentials: 'omit', redirect: 'error' });
        results.push([response.status, (await response.json()).message, response.headers.get('Retry-After')]);
      }
      return results;
    })()`);
    assert.deepStrictEqual(result, [
      [200, '播客测试', null],
      [200, '播客测试', null],
      [401, '播客测试', null],
      [429, '播客测试', '30'],
    ]);
    assert.equal(await win.webContents.executeJavaScript(`(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 100);
      try {
        await fetch('/slow', { credentials: 'omit', signal: controller.signal });
        return 'not cancelled';
      } catch (error) {
        return error.name;
      } finally {
        clearTimeout(timer);
      }
    })()`), 'AbortError');
    const { text } = buildSync({
      entryPoints: [path.join(__dirname, '../../src/xyz/rss.js')],
      bundle: true,
      format: 'iife',
      globalName: 'rssLab',
      write: false,
    }).outputFiles[0];
    const rss = await win.webContents.executeJavaScript(`${text}
      (() => {
        const xml = '<rss><channel><title>测试节目</title>' +
          '<item><title>单集</title><guid>1</guid><duration>01:02:03</duration><enclosure type="audio/mpeg" url="https://example.test/a.mp3"/></item>' +
          '<item><guid>1</guid><enclosure url="https://example.test/b.mp3"/></item>' +
          '<item><enclosure url="file:///unsafe.mp3"/></item>' +
          '<item><enclosure url="https://example.test/no.mp3" type="text/html"/></item></channel></rss>';
        const feed = rssLab.parseFeed(xml, 'fixture');
        rssLab.savePublicFeeds([feed]);
        const track = rssLab.findPublicEpisode(feed.episodes[0].eid);
        let rejected = 0;
        for (const invalid of ['<rss>', '<!DOCTYPE rss>' + xml]) {
          try { rssLab.parseFeed(invalid, 'invalid'); } catch { rejected++; }
        }
        const imported = rssLab.parseFeed(xml);
        const other = rssLab.parseFeed(xml.replace('测试节目', '第二个节目'));
        const withSelf = rssLab.parseFeed(xml.replace('<channel>', '<channel><atom:link xmlns:atom="http://www.w3.org/2005/Atom" rel="self" href="https://example.test/feed.xml"/>'));
        if (imported.key === other.key || imported.key !== rssLab.parseFeed(xml).key) throw new Error('Invalid import identity');
        if (withSelf.key !== 'https://example.test/feed.xml' || track.dt !== 3723000) throw new Error('Invalid RSS metadata');
        return [feed.title, feed.episodes.length, track.name, track.url, track.localPodcast, rejected];
      })()
    `);
    assert.deepStrictEqual(rss, ['测试节目', 1, '单集', 'https://example.test/a.mp3', true, 2]);
    console.log('PASS: Electron loopback network and RSS parsing/storage');
  } finally {
    win.destroy();
    server.close();
  }
}
main().then(() => app.exit(0), error => {
  console.error(error);
  app.exit(1);
});
