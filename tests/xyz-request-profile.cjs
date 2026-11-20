// Loopback-only wire checks. Never load or accept an account credential.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const http = require('http');
const { createRequire } = require('module');
const { upstreamRequestScope } = require('../src/xyz/requestScope');
const express = require('express');
const axios = require('axios');
const { desktopHeaders } = require('../src/xyz/requestProfile');

function probeAndroidMock(url) {
  const target = new URL(url);
  if (
    target.protocol !== 'http:' ||
    target.hostname !== '127.0.0.1' ||
    target.username ||
    target.password
  ) {
    return Promise.reject(
      new Error(
        'Android mock requires an IPv4 loopback URL without credentials'
      )
    );
  }
  return axios.get(target.href, {
    proxy: false,
    maxRedirects: 0,
    timeout: 2000,
    headers: {
      ...desktopHeaders(),
      'User-Agent': 'YesPlayMusic-Test/1.0 (Android mock)',
      'X-Test-Platform': 'android',
    },
  });
}

async function main() {
  const app = express();
  let upstreamError;
  let now = Date.now();
  let upstreamCalls = 0;
  let queuedRequest;
  let onEnqueue;
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const xyzApi = {
    getDiscovery: async () => {
      upstreamCalls++;
      if (queuedRequest) return queuedRequest(upstreamRequestScope.getStore());
      throw upstreamError;
    },
  };
  const moduleStub = { exports: {} };
  const serverRequire = createRequire(require.resolve('../src/xyz/server'));
  vm.runInNewContext(
    fs.readFileSync(require.resolve('../src/xyz/server'), 'utf8'),
    {
      module: moduleStub,
      require: name => {
        if (name === './api') return xyzApi;
        if (name === './requestScope') {
          return { upstreamRequestScope, upstreamTimeoutMs: 300, upstreamConcurrency: 1 };
        }
        if (name === './rateLimit') {
          const rateLimit = serverRequire(name);
          return {
            retryDeadline: value => rateLimit.retryDeadline(value, now),
            retrySeconds: deadline => rateLimit.retrySeconds(deadline, now),
          };
        }
        return serverRequire(name);
      },
      setTimeout: (callback, delay) => {
        if (onEnqueue) onEnqueue();
        return setTimeout(callback, delay);
      },
      clearTimeout,
    }
  );
  app.use('/xyz', moduleStub.exports);
  app.get('/echo', (req, res) => res.json(req.headers));
  app.get('/redirect', (req, res) => res.redirect('/echo'));
  let holdResponse;
  let started;
  const holding = new Promise(resolve => {
    started = resolve;
  });
  let lateRequests = 0;
  app.get('/hold', (req, res) => {
    holdResponse = res;
    started();
  });
  app.post('/must-not-send', (req, res) => {
    lateRequests++;
    res.sendStatus(200);
  });
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const pc = await axios.get(`${url}/echo`, {
      headers: desktopHeaders(),
      proxy: false,
      timeout: 2000,
    });
    assert.match(pc.data['user-agent'], /^YesPlayMusic\//);
    assert.equal(pc.data['x-test-platform'], undefined);
    assert.equal(pc.data['content-type'], undefined);
    const android = await probeAndroidMock(`${url}/echo`);
    assert.equal(android.data['x-test-platform'], 'android');
    assert.equal(android.data['x-jike-access-token'], undefined);
    assert.equal(android.data.cookie, undefined);
    await assert.rejects(
      probeAndroidMock('https://api.xiaoyuzhoufm.com/echo'),
      /loopback/
    );
    await assert.rejects(
      probeAndroidMock('http://test:fake@127.0.0.1/echo'),
      /without credentials/
    );
    await assert.rejects(
      probeAndroidMock(`${url}/redirect`),
      error => error.response?.status === 302
    );

    const proxyRequest = () =>
      axios.post(
        `${url}/xyz/discovery`,
        {},
        {
          proxy: false,
          timeout: 2000,
          validateStatus: () => true,
        }
      );
    upstreamError = {
      response: { status: 429, headers: { 'retry-after': '30' } },
    };
    let rejectFirst;
    let startedFirst;
    const firstStarted = new Promise(resolve => { startedFirst = resolve; });
    queuedRequest = () => new Promise((resolve, reject) => {
      rejectFirst = reject;
      startedFirst();
    });
    const first = proxyRequest();
    await firstStarted;
    const secondQueued = new Promise(resolve => { onEnqueue = resolve; });
    const second = proxyRequest();
    await secondQueued;
    onEnqueue = null;
    assert.equal(upstreamCalls, 1);
    rejectFirst(upstreamError);
    const limited = await first;
    assert.equal((await second).status, 429);
    assert.equal(upstreamCalls, 1, 'queued request must never invoke upstream');
    queuedRequest = null;
    assert.equal(limited.status, 429);
    assert.equal(limited.headers['retry-after'], '30');
    const initialCalls = upstreamCalls;
    assert.deepStrictEqual((await Promise.all([proxyRequest(), proxyRequest()])).map(res => res.status), [429, 429]);
    assert.equal(upstreamCalls, initialCalls);
    now += 30000;
    upstreamError = { response: { status: 429, headers: { 'retry-after': new Date(now + 5000).toUTCString() } } };
    assert.equal((await proxyRequest()).headers['retry-after'], '5');
    assert.equal((await proxyRequest()).status, 429);
    assert.equal(upstreamCalls, initialCalls + 1);
    now += 5000;
    upstreamError = { code: 'ECONNABORTED' };
    assert.equal((await proxyRequest()).status, 504);
    upstreamError = {
      response: { status: 302, headers: { location: '/echo' } },
    };
    const redirected = await proxyRequest();
    assert.equal(redirected.status, 502);
    assert.equal(redirected.headers.location, undefined);
    const options = { proxy: false, maxRedirects: 0, httpAgent: agent };
    const held = axios.get(`${url}/hold`, { ...options, timeout: 2000 });
    await holding;
    const cancellations = [];
    let observed;
    queuedRequest = scope => {
      scope.cancelToken.promise.then(reason =>
        cancellations.push(reason.message)
      );
      const request = axios.post(
        `${url}/must-not-send`,
        {},
        {
          ...options,
          cancelToken: scope.cancelToken,
        }
      );
      if (observed) observed(scope.cancelToken.promise);
      return request;
    };
    assert.equal((await proxyRequest()).status, 504);
    const queued = new Promise(resolve => {
      observed = value => resolve({ value });
    });
    const source = axios.CancelToken.source();
    const disconnected = axios.post(
      `${url}/xyz/discovery`,
      {},
      {
        proxy: false,
        cancelToken: source.token,
        timeout: 2000,
      }
    );
    const rejected = assert.rejects(disconnected, axios.isCancel);
    const { value: upstreamCancelled } = await queued;
    source.cancel();
    await rejected;
    await upstreamCancelled;
    holdResponse.end('done');
    await held;
    await axios.get(`${url}/echo`, options);
    assert.equal(lateRequests, 0);
    assert.deepStrictEqual(cancellations, [
      'Upstream deadline exceeded',
      'Downstream disconnected',
    ]);
    console.log(
      'PASS: distinct desktop/Android wire headers, loopback guard, blocked redirects, 429 and 504'
    );
    console.log('PASS: queued writes cancelled on deadline or disconnect');
  } finally {
    agent.destroy();
    if (holdResponse && !holdResponse.writableEnded) holdResponse.end();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
