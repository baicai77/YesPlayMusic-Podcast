const express = require('express');
const xyzApi = require('./api');

const router = express.Router();
router.use(express.json());

function getToken(req) {
  return (
    req.headers['x-jike-access-token'] ||
    req.body?.token ||
    req.query?.token ||
    ''
  );
}

// 统一错误处理
function handleResponse(promise, res) {
  promise
    .then(data => res.json({ code: 200, data }))
    .catch(err => {
      const status = err.response?.status || err.status || 500;
      const data = err.response?.data || { message: err.message };
      res.status(status).json({ code: status, error: data });
    });
}

// Validate a user-supplied session without persisting or logging its credentials.
router.post('/session/verify', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const token = req.body?.accessToken;
  if (
    typeof token !== 'string' ||
    !token.trim() ||
    token.length > 16384 ||
    /\s/.test(token)
  ) {
    return res
      .status(400)
      .json({ code: 400, error: { message: '请填写有效的 Access Token' } });
  }
  handleResponse(xyzApi.getOwnProfile(token), res);
});

// 发送短信验证码
router.post('/sendCode', (req, res) => {
  handleResponse(xyzApi.sendCode(req.body), res);
});

// 验证码登录
router.post('/login', (req, res) => {
  handleResponse(xyzApi.loginWithSMS(req.body), res);
});

// 刷新 Token
router.post('/refresh_token', (req, res) => {
  handleResponse(
    xyzApi.refreshToken(
      req.body?.refreshToken,
      req.body?.accessToken || getToken(req)
    ),
    res
  );
});

// 我的订阅列表
router.post('/subscription', (req, res) => {
  handleResponse(xyzApi.getSubscriptions(getToken(req), req.body), res);
});

// 订阅更新 / 收件箱
router.post('/subscription_update', (req, res) => {
  handleResponse(xyzApi.getSubscriptionUpdates(getToken(req)), res);
});

// 播客节目详情
router.post('/podcast_detail', (req, res) => {
  handleResponse(xyzApi.getPodcastDetail(getToken(req), req.body?.pid), res);
});

// 单集列表
router.post('/episode_list', (req, res) => {
  handleResponse(xyzApi.getEpisodeList(getToken(req), req.body), res);
});

// 单集详情
router.post('/episode_detail', (req, res) => {
  handleResponse(xyzApi.getEpisodeDetail(getToken(req), req.body?.eid), res);
});

// 播放进度
router.post('/playback_progress', (req, res) => {
  handleResponse(
    xyzApi.getPlaybackProgress(getToken(req), req.body?.eids),
    res
  );
});

// 更新播放进度
router.post('/playback_progress_update', (req, res) => {
  handleResponse(xyzApi.updatePlaybackProgress(getToken(req), req.body), res);
});

// 首页精选与推荐
router.post('/discovery', (req, res) => {
  handleResponse(xyzApi.getDiscovery(getToken(req)), res);
});

// 热门榜单
router.post('/top_list', (req, res) => {
  handleResponse(
    xyzApi.getTopList(
      getToken(req),
      req.body?.rankingType ?? req.body?.category
    ),
    res
  );
});

// 搜索
router.post('/search', (req, res) => {
  handleResponse(xyzApi.search(getToken(req), req.body), res);
});

// 搜索预设词
router.post('/search_preset', (req, res) => {
  handleResponse(xyzApi.searchPreset(getToken(req)), res);
});

// 精彩时间点
router.post('/claps', (req, res) => {
  handleResponse(
    xyzApi.getClaps(getToken(req), req.body?.eid, req.body?.duration),
    res
  );
});

// 评论列表
router.post('/comments', (req, res) => {
  handleResponse(xyzApi.getComments(getToken(req), req.body), res);
});

// 收藏单集
router.post('/favorites', (req, res) => {
  handleResponse(xyzApi.getFavoriteEpisodes(getToken(req), req.body), res);
});

// 收听历史
router.post('/history', (req, res) => {
  handleResponse(xyzApi.getPlayedHistory(getToken(req), req.body), res);
});

// 个人资料
router.post('/user_profile', (req, res) => {
  handleResponse(xyzApi.getUserProfile(getToken(req), req.body?.uid), res);
});

module.exports = router;
