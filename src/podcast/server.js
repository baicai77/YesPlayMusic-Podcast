/**
 * 本地播客 Express 路由（挂载于 /podcast-api）
 * 仅提供标准 RSS 源抓取解析与 Apple Podcasts 公开目录检索，无任何第三方私有账号接口
 */

const express = require('express');
const podcastService = require('./service');

const router = express.Router();
router.use(express.json({ limit: '2mb' }));

function handleResponse(promise, res) {
  promise
    .then(data => res.json({ code: 200, data }))
    .catch(err => {
      const status =
        (err && err.status) ||
        (err && err.response && err.response.status) ||
        500;
      const message =
        (err && err.message) || '播客服务请求失败，请检查网络连接或 RSS 地址';
      res.status(status).json({ code: status, error: { message } });
    });
}

router.get('/health', (req, res) => {
  res.json({ code: 200, data: { mode: 'rss', status: 'ok' } });
});

// 解析任意标准 RSS / Atom 播客源
router.post('/feed', (req, res) => {
  const body = req.body || {};
  handleResponse(
    podcastService.fetchFeed(body.url, {
      forceRefresh: Boolean(body.forceRefresh),
    }),
    res
  );
});

// 搜索公开播客节目 / 单集（Apple iTunes Search API）
router.post('/search', (req, res) => {
  const body = req.body || {};
  handleResponse(
    podcastService.searchPodcasts({
      term: body.term || body.keyword || '',
      country: body.country || 'CN',
      limit: body.limit || 25,
      entity: body.entity || 'podcast',
    }),
    res
  );
});

// 热门播客榜单（Apple Podcasts 公开 RSS 榜）
router.post('/charts', (req, res) => {
  const body = req.body || {};
  handleResponse(
    podcastService.getTopCharts({
      country: body.country || 'CN',
      genre: body.genre || '',
      limit: body.limit || 30,
      forceRefresh: Boolean(body.forceRefresh),
    }),
    res
  );
});

// 按 Apple Podcasts collectionId 查询 RSS 地址
router.post('/lookup', (req, res) => {
  const body = req.body || {};
  const ids = body.ids || (body.itunesId ? [body.itunesId] : []);
  handleResponse(podcastService.lookupByIds(ids, body.country || 'CN'), res);
});

module.exports = router;
