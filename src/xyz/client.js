import axios from 'axios';

const TOKEN_KEY = 'xyz_access_token';
const REFRESH_TOKEN_KEY = 'xyz_refresh_token';
const USER_KEY = 'xyz_user_info';

export function getXyzToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setXyzToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getXyzRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || '';
}

export function setXyzRefreshToken(token) {
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function getXyzUser() {
  const user = localStorage.getItem(USER_KEY);
  try {
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

export function setXyzUser(user) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

export function isXyzLoggedIn() {
  return !!getXyzToken();
}

const responseCache = new Map();
const inFlightRequests = new Map();

export function clearXyzCache() {
  responseCache.clear();
  inFlightRequests.clear();
}

function cachedPost(key, ttlMs, requestFn) {
  const now = Date.now();
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }
  const promise = Promise.resolve()
    .then(requestFn)
    .then(data => {
      if (inFlightRequests.get(key) === promise) {
        responseCache.set(key, { value: data, expiresAt: Date.now() + ttlMs });
      }
      return data;
    })
    .finally(() => {
      if (inFlightRequests.get(key) === promise) inFlightRequests.delete(key);
    });
  inFlightRequests.set(key, promise);
  return promise;
}

let sessionVersion = 0;
let refreshPromise = null;
let cloudSyncPaused = false;

export function canSyncXyzProgress() {
  return isXyzLoggedIn() && !cloudSyncPaused;
}

export function getXyzSessionVersion() {
  return sessionVersion;
}

export function replaceXyzSession(accessToken, refreshToken, user) {
  sessionVersion++;
  refreshPromise = null;
  cloudSyncPaused = false;
  setXyzToken(accessToken);
  setXyzRefreshToken(refreshToken);
  setXyzUser(user);
  clearXyzCache();
}

export function logoutXyz() {
  replaceXyzSession('', '', null);
}

function getXyzErrorText(error) {
  const detail = error.response?.data?.error;
  const message =
    detail?.message ||
    detail?.msg ||
    (typeof detail === 'string' ? detail : '') ||
    error.response?.data?.message ||
    '';
  return message;
}

function requiresVerification(error) {
  return /captchaVerifyParam|captcha|人机验证/i.test(getXyzErrorText(error));
}

export function xyzErrorMessage(error) {
  if (requiresVerification(error)) {
    return '小宇宙要求先完成人机验证，当前第三方客户端尚未接入该验证流程，无法发送短信。请勿反复点击获取验证码；可先使用官方 App 登录，但官方 App 登录不会自动登录本应用。';
  }
  if (!error.response) {
    return error.code === 'ECONNABORTED'
      ? '请求超时，请检查网络连接后重试'
      : '无法连接到本地播客代理或小宇宙服务，请稍后重试';
  }
  const status = error.response.status;
  if (status === 401) return '请先登录小宇宙后重试';
  if (status === 403)
    return '小宇宙访问受限，自动进度同步已暂停；本地进度不受影响';
  if (status === 429) {
    const retryAfter = error.response.headers?.['retry-after'];
    if (typeof retryAfter === 'string' && /^\d{1,9}$/.test(retryAfter)) {
      return `请求过于频繁，请至少等待 ${Number(retryAfter)} 秒后再试`;
    }
    return '请求过于频繁，请稍后再试';
  }
  if (status === 504) return '小宇宙服务响应超时，请稍后重试';
  return (
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    '小宇宙服务暂时不可用，请稍后重试'
  );
}
// Axios 实例
const client = axios.create({
  baseURL: '/xyz',
  timeout: 15000,
});

client.interceptors.request.use(config => {
  if (config._xyzRetried && config._xyzSessionVersion !== sessionVersion) {
    throw new Error('登录状态已更改');
  }
  const token = getXyzToken();
  config._xyzSessionVersion = sessionVersion;
  if (token) {
    config.headers['x-jike-access-token'] = token;
  } else {
    delete config.headers['x-jike-access-token'];
  }
  return config;
});

client.interceptors.response.use(
  res => {
    // 统一解包 data
    if (res.data && res.data.data !== undefined) {
      return res.data.data;
    }
    return res.data;
  },
  async err => {
    const config = err.config;
    const verificationRequired = requiresVerification(err);
    if (
      config?._xyzSessionVersion === sessionVersion &&
      (err.response?.status === 403 || verificationRequired)
    ) {
      cloudSyncPaused = true;
    }
    if (
      verificationRequired ||
      err.response?.status !== 401 ||
      !config ||
      config._xyzRetried ||
      config._xyzSessionVersion !== sessionVersion ||
      ['/login', '/sendCode', '/refresh_token', '/session/verify'].includes(
        config.url
      )
    ) {
      return Promise.reject(err);
    }
    const oldRefreshToken = getXyzRefreshToken();
    if (!oldRefreshToken) {
      logoutXyz();
      return Promise.reject(err);
    }
    config._xyzRetried = true;
    const oldAccessToken = getXyzToken();
    const requestSessionVersion = config._xyzSessionVersion;
    try {
      if (!refreshPromise) {
        const pendingRefresh = client
          .post('/refresh_token', {
            refreshToken: oldRefreshToken,
            accessToken: oldAccessToken,
          })
          .then(result => {
            if (sessionVersion !== requestSessionVersion)
              throw new Error('登录状态已更改');
            if (!result?.tokens?.accessToken)
              throw new Error('登录已过期，请重新登录');
            setXyzToken(result.tokens.accessToken);
            setXyzRefreshToken(result.tokens.refreshToken || oldRefreshToken);
          })
          .finally(() => {
            if (refreshPromise === pendingRefresh) refreshPromise = null;
          });
        refreshPromise = pendingRefresh;
      }
      await refreshPromise;
      if (sessionVersion !== requestSessionVersion) return Promise.reject(err);
      return client(config);
    } catch (refreshError) {
      if (
        sessionVersion === requestSessionVersion &&
        getXyzToken() === oldAccessToken &&
        [401, 403].includes(refreshError.response?.status)
      )
        logoutXyz();
      return Promise.reject(refreshError);
    }
  }
);

export async function importXyzSession(accessToken, refreshToken = '') {
  const access = accessToken.trim();
  const refresh = refreshToken.trim();
  if (
    !access ||
    /\s/.test(access) ||
    /\s/.test(refresh) ||
    access.length > 16384 ||
    refresh.length > 16384
  ) {
    throw new Error('请只粘贴 Token 的值，不要粘贴完整 Cookie 或请求头');
  }
  const result = await client.post('/session/verify', { accessToken: access });
  const profile = result?.data?.user || result?.data || result?.user || result;
  if (!profile?.uid)
    throw new Error(
      '凭证验证未返回用户资料，请确认使用的是本人有效的小宇宙凭证'
    );
  replaceXyzSession(access, refresh, profile);
  return profile;
}

export const xyzService = {
  sendCode: data => client.post('/sendCode', data),
  login: data => client.post('/login', data),
  refreshToken: data => client.post('/refresh_token', data),
  getSubscriptions: data => {
    if (data?.loadMoreKey) return client.post('/subscription', data);
    const { limit = 25 } = data || {};
    return cachedPost(`sub:${JSON.stringify(limit)}`, 60000, () =>
      client.post('/subscription', data)
    );
  },
  getSubscriptionUpdates: () => client.post('/subscription_update'),
  getPodcastDetail: pid =>
    cachedPost(`pod:${pid}`, 120000, () =>
      client.post('/podcast_detail', { pid })
    ),
  getEpisodeList: data =>
    !data?.loadMoreKey
      ? cachedPost(
          `eps:${data?.pid}:${data?.order || 'desc'}:${data?.limit || 20}`,
          120000,
          () => client.post('/episode_list', data)
        )
      : client.post('/episode_list', data),
  getEpisodeDetail: eid =>
    cachedPost(`ep:${eid}`, 300000, () =>
      client.post('/episode_detail', { eid })
    ),
  getPlaybackProgress: eids => client.post('/playback_progress', { eids }),
  updatePlaybackProgress: data =>
    client.post('/playback_progress_update', data),
  getDiscovery: () =>
    cachedPost('discovery', 300000, () => client.post('/discovery')),
  getTopList: rankingType =>
    cachedPost(`toplist:${rankingType || 'HOT'}`, 300000, () =>
      client.post('/top_list', { rankingType })
    ),
  search: data => client.post('/search', data),
  searchPreset: () =>
    cachedPost('search_preset', 300000, () => client.post('/search_preset')),
  getClaps: (eid, duration) => client.post('/claps', { eid, duration }),
  getComments: data => client.post('/comments', data),
  getFavorites: data => client.post('/favorites', data),
  getHistory: data => client.post('/history', data),
  getUserProfile: uid => client.post('/user_profile', { uid }),
};

export default xyzService;
