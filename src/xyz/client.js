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

export function logoutXyz() {
  setXyzToken('');
  setXyzRefreshToken('');
  setXyzUser(null);
}

let refreshPromise = null;

export function xyzErrorMessage(error) {
  const detail = error.response?.data?.error;
  const message =
    detail?.message ||
    detail?.msg ||
    (typeof detail === 'string' ? detail : '') ||
    error.response?.data?.message ||
    '';
  if (/captchaVerifyParam|captcha|人机验证/i.test(message)) {
    return '小宇宙要求先完成人机验证，当前第三方客户端尚未接入该验证流程，无法发送短信。请勿反复点击获取验证码；可先使用官方 App 登录，但官方 App 登录不会自动登录本应用。';
  }
  return (
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    (error.response?.status === 401
      ? '请先登录小宇宙后重试'
      : '小宇宙服务暂时不可用，请稍后重试')
  );
}
// Axios 实例
const client = axios.create({
  baseURL: '/xyz',
  timeout: 15000,
});

client.interceptors.request.use(config => {
  const token = getXyzToken();
  if (token) {
    config.headers['x-jike-access-token'] = token;
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
    if (
      err.response?.status !== 401 ||
      !config ||
      config._xyzRetried ||
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
    try {
      if (!refreshPromise) {
        refreshPromise = client
          .post('/refresh_token', {
            refreshToken: oldRefreshToken,
            accessToken: oldAccessToken,
          })
          .then(result => {
            if (getXyzRefreshToken() !== oldRefreshToken)
              throw new Error('登录状态已更改');
            if (!result?.tokens?.accessToken)
              throw new Error('登录已过期，请重新登录');
            setXyzToken(result.tokens.accessToken);
            setXyzRefreshToken(result.tokens.refreshToken || oldRefreshToken);
          })
          .finally(() => {
            refreshPromise = null;
          });
      }
      await refreshPromise;
      return client(config);
    } catch (refreshError) {
      if (
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
  setXyzToken(access);
  setXyzRefreshToken(refresh);
  setXyzUser(profile);
  return profile;
}

export const xyzService = {
  sendCode: data => client.post('/sendCode', data),
  login: data => client.post('/login', data),
  refreshToken: data => client.post('/refresh_token', data),
  getSubscriptions: data => client.post('/subscription', data),
  getSubscriptionUpdates: () => client.post('/subscription_update'),
  getPodcastDetail: pid => client.post('/podcast_detail', { pid }),
  getEpisodeList: data => client.post('/episode_list', data),
  getEpisodeDetail: eid => client.post('/episode_detail', { eid }),
  getPlaybackProgress: eids => client.post('/playback_progress', { eids }),
  updatePlaybackProgress: data =>
    client.post('/playback_progress_update', data),
  getDiscovery: () => client.post('/discovery'),
  getTopList: rankingType => client.post('/top_list', { rankingType }),
  search: data => client.post('/search', data),
  searchPreset: () => client.post('/search_preset'),
  getClaps: (eid, duration) => client.post('/claps', { eid, duration }),
  getComments: data => client.post('/comments', data),
  getFavorites: data => client.post('/favorites', data),
  getHistory: data => client.post('/history', data),
  getUserProfile: uid => client.post('/user_profile', { uid }),
};

export default xyzService;
