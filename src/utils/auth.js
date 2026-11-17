import Cookies from 'js-cookie';
import { logout } from '@/api/auth';
import store from '@/store';

export function setCookies(string) {
  if (typeof string !== 'string' || !string.trim()) {
    throw new Error('登录接口未返回有效凭证，请重新扫码');
  }
  // API versions join Set-Cookie records with either ; or ;;. Discard upstream
  // attributes (especially Domain/HttpOnly) and store each cookie on this origin.
  const attributes = new Set([
    'domain',
    'path',
    'expires',
    'max-age',
    'samesite',
    'secure',
    'httponly',
    'priority',
    'partitioned',
  ]);
  string.split(';').forEach(part => {
    const separator = part.indexOf('=');
    if (separator < 1) return;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (attributes.has(name.toLowerCase()) || !value) return;
    Cookies.set(name, value, { path: '/', sameSite: 'Lax', expires: 30 });
    localStorage.setItem(`cookie-${name}`, value);
  });
}

export function getCookie(key) {
  return Cookies.get(key) || localStorage.getItem(`cookie-${key}`) || undefined;
}

export function removeCookie(key) {
  Cookies.remove(key);
  localStorage.removeItem(`cookie-${key}`);
}

// MUSIC_U 只有在账户登录的情况下才有
export function isLoggedIn() {
  return getCookie('MUSIC_U') !== undefined;
}

// 账号登录
export function isAccountLoggedIn() {
  return (
    getCookie('MUSIC_U') !== undefined &&
    store.state.data.loginMode === 'account'
  );
}

// 用户名搜索（用户数据为只读）
export function isUsernameLoggedIn() {
  return store.state.data.loginMode === 'username';
}

// 账户登录或者用户名搜索都判断为登录，宽松检查
export function isLooseLoggedIn() {
  return isAccountLoggedIn() || isUsernameLoggedIn();
}

export function doLogout() {
  logout();
  removeCookie('MUSIC_U');
  removeCookie('__csrf');
  // 更新状态仓库中的用户信息
  store.commit('updateData', { key: 'user', value: {} });
  // 更新状态仓库中的登录状态
  store.commit('updateData', { key: 'loginMode', value: null });
  // 更新状态仓库中的喜欢列表
  store.commit('updateData', { key: 'likedSongPlaylistID', value: undefined });
}
