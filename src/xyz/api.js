const axios = require('axios').create({ timeout: 12000 });

const BASE_URL = 'https://api.xiaoyuzhoufm.com';

function getHeaders(token = '') {
  const now = new Date().toISOString();
  const headers = {
    Host: 'api.xiaoyuzhoufm.com',
    'User-Agent': 'Xiaoyuzhou/2.57.1 (build:1576; iOS 17.4.1)',
    Market: 'AppStore',
    'App-BuildNo': '1576',
    OS: 'ios',
    Manufacturer: 'Apple',
    BundleID: 'app.podcast.cosmos',
    Connection: 'keep-alive',
    'abtest-info': JSON.stringify({ old_user_discovery_feed: 'enable' }),
    'Accept-Language': 'zh-Hans-CN;q=1.0, zh-Hant-HK;q=0.9',
    Model: 'iPhone14,2',
    'app-permissions': '4',
    Accept: '*/*',
    'App-Version': '2.57.1',
    WifiConnected: 'true',
    'OS-Version': '17.4.1',
    'Local-Time': now,
    Timezone: 'Asia/Shanghai',
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['x-jike-access-token'] = token;
  }

  return headers;
}

/**
 * 发送短信验证码
 */
async function sendCode({ mobilePhoneNumber, areaCode = '+86' }) {
  const url = `${BASE_URL}/v1/auth/sendCode`;
  const response = await axios.post(
    url,
    { mobilePhoneNumber, areaCode },
    { headers: getHeaders() }
  );
  return response.data;
}

/**
 * 短信验证码登录
 */
async function loginWithSMS({
  mobilePhoneNumber,
  verifyCode,
  areaCode = '+86',
}) {
  const url = `${BASE_URL}/v1/auth/loginVerificationCode`;
  const response = await axios.post(
    url,
    { mobilePhoneNumber, verifyCode, areaCode },
    { headers: getHeaders() }
  );

  const accessToken = response.headers['x-jike-access-token'] || '';
  const refreshToken = response.headers['x-jike-refresh-token'] || '';

  return {
    ...response.data,
    tokens: {
      accessToken,
      refreshToken,
    },
  };
}

/**
 * 刷新 Token
 */
async function refreshToken(oldRefreshToken, oldAccessToken) {
  if (!oldRefreshToken || !oldAccessToken) {
    const error = new Error(
      '续期需要 Access Token 和 Refresh Token，请重新导入完整凭证'
    );
    error.status = 400;
    throw error;
  }
  const url = `${BASE_URL}/app_auth_tokens.refresh`;
  const headers = getHeaders(oldAccessToken);
  headers['x-jike-refresh-token'] = oldRefreshToken;
  headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=utf-8';
  const response = await axios.post(url, null, { headers });
  const data = response.data?.data || response.data || {};
  const accessToken =
    response.headers?.['x-jike-access-token'] ||
    data['x-jike-access-token'] ||
    data.accessToken ||
    '';
  const refreshToken =
    response.headers?.['x-jike-refresh-token'] ||
    data['x-jike-refresh-token'] ||
    data.refreshToken ||
    '';
  return {
    ...response.data,
    tokens: { accessToken, refreshToken },
  };
}

/**
 * 获取我的订阅播客列表
 */
async function getSubscriptions(token, { limit = 25, loadMoreKey } = {}) {
  const url = `${BASE_URL}/v1/subscription/list`;
  const body = { limit, sortBy: 'subscribedAt', sortOrder: 'desc' };
  if (loadMoreKey) body.loadMoreKey = loadMoreKey;
  const response = await axios.post(url, body, { headers: getHeaders(token) });
  return response.data;
}

/**
 * 订阅更新列表（未读/最新单集）
 */
async function getSubscriptionUpdates(token) {
  const url = `${BASE_URL}/v1/inbox/list`;
  const response = await axios.post(
    url,
    { limit: 20 },
    { headers: getHeaders(token) }
  );
  return response.data;
}

/**
 * 播客详情
 */
async function getPodcastDetail(token, pid) {
  const url = `${BASE_URL}/v1/podcast/get?pid=${encodeURIComponent(pid)}`;
  const response = await axios.get(url, { headers: getHeaders(token) });
  return response.data;
}

/**
 * 播客单集列表
 */
async function getEpisodeList(
  token,
  { pid, order = 'desc', limit = 20, loadMoreKey } = {}
) {
  const url = `${BASE_URL}/v1/episode/list`;
  const body = { pid, order, limit };
  if (loadMoreKey) body.loadMoreKey = loadMoreKey;
  const response = await axios.post(url, body, { headers: getHeaders(token) });
  return response.data;
}

/**
 * 单集详情
 */
async function getEpisodeDetail(token, eid) {
  const url = `${BASE_URL}/v1/episode/get?eid=${encodeURIComponent(eid)}`;
  const response = await axios.get(url, { headers: getHeaders(token) });
  return response.data;
}

/**
 * 查询播放进度
 */
async function getPlaybackProgress(token, eids = []) {
  const url = `${BASE_URL}/v1/playback-progress/list`;
  const response = await axios.post(
    url,
    { eids },
    { headers: getHeaders(token) }
  );
  return response.data;
}

/**
 * 更新播放进度（向小宇宙同步进度）
 */
async function updatePlaybackProgress(token, { pid, eid, progress }) {
  if (!pid || !eid || !Number.isFinite(progress) || progress < 0) {
    const error = new Error('进度同步缺少有效节目、单集或播放位置');
    error.status = 400;
    throw error;
  }
  const url = `${BASE_URL}/v1/playback-progress/update`;
  const body = {
    data: [
      {
        pid,
        eid,
        progress: Math.floor(progress),
        playedAt: new Date().toISOString(),
      },
    ],
  };
  const response = await axios.post(url, body, { headers: getHeaders(token) });
  return response.data;
}

/**
 * 首页精选与推荐
 */
async function getDiscovery(token) {
  const url = `${BASE_URL}/v1/discovery-feed/list`;
  const response = await axios.post(url, {}, { headers: getHeaders(token) });
  return response.data;
}

/**
 * 热门榜单 (最热榜、新星榜、锋芒榜)
 */
async function getTopList(token, rankingType = 'HOT') {
  const categories = new Map([
    ['HOT', 'HOT_EPISODES_IN_24_HOURS'],
    ['NEW', 'NEW_STAR_EPISODES'],
    ['NEW_STAR', 'NEW_STAR_EPISODES'],
    ['ROCK', 'SKYROCKET_EPISODES'],
    ['SPARK', 'SKYROCKET_EPISODES'],
    ['HOT_EPISODES_IN_24_HOURS', 'HOT_EPISODES_IN_24_HOURS'],
    ['NEW_STAR_EPISODES', 'NEW_STAR_EPISODES'],
    ['SKYROCKET_EPISODES', 'SKYROCKET_EPISODES'],
  ]);
  const key =
    typeof rankingType === 'string' ? rankingType.trim().toUpperCase() : '';
  const category = categories.get(key);
  if (!category) {
    const error = new Error('不支持的榜单类型，请选择最热榜、新星榜或锋芒榜');
    error.status = 400;
    throw error;
  }
  const url = `${BASE_URL}/v1/top-list/get`;
  const response = await axios.get(url, {
    params: { category },
    headers: getHeaders(token),
  });
  return response.data;
}

/**
 * 搜索 (播客、单集)
 */
async function search(token, { keyword, type = 'ALL', limit = 20 }) {
  const url = `${BASE_URL}/v1/search/create`;
  const body = {
    keyword,
    type,
    limit,
    sourcePageName: '4',
    currentPageName: '4',
  };
  const response = await axios.post(url, body, { headers: getHeaders(token) });
  return response.data;
}

/**
 * 搜索预设词 / 热门搜索
 */
async function searchPreset(token) {
  const url = `${BASE_URL}/v1/search/get-preset`;
  const response = await axios.get(url, { headers: getHeaders(token) });
  return response.data;
}

/**
 * 精彩时间点 (Clap)
 */
async function getClaps(token, eid, duration = 0) {
  const url = `${BASE_URL}/v1/clap/list`;
  const response = await axios.post(
    url,
    { eid, duration },
    { headers: getHeaders(token) }
  );
  return response.data;
}

/**
 * 单集评论列表
 */
async function getComments(token, { eid, order = 'HOT', loadMoreKey } = {}) {
  const url = `${BASE_URL}/v1/comment/list-primary`;
  const body = { owner: { id: eid, type: 'EPISODE' }, order };
  if (loadMoreKey) body.loadMoreKey = loadMoreKey;
  const response = await axios.post(url, body, { headers: getHeaders(token) });
  return response.data;
}

/**
 * 收藏单集列表
 */
async function getFavoriteEpisodes(token, { loadMoreKey } = {}) {
  const url = `${BASE_URL}/v1/favorite/list`;
  const body = {};
  if (loadMoreKey) body.loadMoreKey = loadMoreKey;
  const response = await axios.post(url, body, { headers: getHeaders(token) });
  return response.data;
}

/**
 * 收听历史
 */
async function getPlayedHistory(token, { limit = 20, loadMoreKey } = {}) {
  const url = `${BASE_URL}/v1/episode-played/list-history`;
  const body = { limit };
  if (loadMoreKey) body.loadMoreKey = loadMoreKey;
  const response = await axios.post(url, body, { headers: getHeaders(token) });
  return response.data;
}

/**
 * 个人主页与用户统计数据
 */
async function getUserProfile(token, uid) {
  const url = `${BASE_URL}/v1/profile/get?uid=${encodeURIComponent(uid)}`;
  const response = await axios.get(url, { headers: getHeaders(token) });
  return response.data;
}

async function getOwnProfile(token) {
  const response = await axios.get(`${BASE_URL}/v1/profile/get`, {
    headers: getHeaders(token),
  });
  return response.data;
}

module.exports = {
  getOwnProfile,
  sendCode,
  loginWithSMS,
  refreshToken,
  getSubscriptions,
  getSubscriptionUpdates,
  getPodcastDetail,
  getEpisodeList,
  getEpisodeDetail,
  getPlaybackProgress,
  updatePlaybackProgress,
  getDiscovery,
  getTopList,
  search,
  searchPreset,
  getClaps,
  getComments,
  getFavoriteEpisodes,
  getPlayedHistory,
  getUserProfile,
};
