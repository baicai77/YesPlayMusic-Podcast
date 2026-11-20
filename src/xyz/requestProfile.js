const { version } = require('../../package.json');

function desktopHeaders(token = '') {
  const headers = {
    'User-Agent': `YesPlayMusic/${version}`,
    Accept: 'application/json',
    'Accept-Language': 'zh-CN, zh;q=0.9',
  };
  if (token) headers['x-jike-access-token'] = token;
  return headers;
}

module.exports = { desktopHeaders };
