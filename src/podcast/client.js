import axios from 'axios';

const client = axios.create({
  baseURL: '/podcast-api',
  timeout: 20000,
});

client.interceptors.response.use(res => {
  if (res.data && res.data.data !== undefined) {
    return res.data.data;
  }
  return res.data;
});

export function podcastErrorMessage(error) {
  if (!error) return '请求失败，请稍后重试';
  const apiMsg =
    (error.response &&
      error.response.data &&
      error.response.data.error &&
      error.response.data.error.message) ||
    (error.response && error.response.data && error.response.data.message);
  if (apiMsg) return apiMsg;
  if (error.code === 'ECONNABORTED') {
    return '请求超时，该 RSS 源或网络响应较慢，请稍后重试';
  }
  if (error.message && /Network Error/i.test(error.message)) {
    return '无法连接本地播客服务，请确认应用服务已启动';
  }
  return error.message || '播客内容加载失败，请稍后重试';
}

export const podcastApi = {
  fetchFeed: (url, forceRefresh = false) =>
    client.post('/feed', { url, forceRefresh }),
  search: ({ term, country = 'CN', limit = 25, entity = 'podcast' }) =>
    client.post('/search', { term, country, limit, entity }),
  getTopCharts: ({
    country = 'CN',
    genre = '',
    limit = 30,
    forceRefresh = false,
  } = {}) => client.post('/charts', { country, genre, limit, forceRefresh }),
  lookupByIds: (ids, country = 'CN') =>
    client.post('/lookup', { ids, country }),
};

export default podcastApi;
