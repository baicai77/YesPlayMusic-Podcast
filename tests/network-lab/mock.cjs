const http = require('http');
const { gzipSync } = require('zlib');

function createMock() {
  return http.createServer((req, res) => {
    if (req.url === '/slow') {
      const timer = setTimeout(() => res.writeHead(204).end(), 3000);
      res.once('close', () => clearTimeout(timer));
      return;
    }
    const cases = { '/json': 200, '/gzip': 200, '/auth': 401, '/limit': 429 };
    if (!Object.prototype.hasOwnProperty.call(cases, req.url)) {
      res.writeHead(404).end();
      return;
    }
    if (req.headers.authorization || req.headers.cookie || req.headers['x-jike-access-token']) {
      res.writeHead(400).end();
      return;
    }
    const json = JSON.stringify({ message: '播客测试' });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.url === '/limit') res.setHeader('Retry-After', '30');
    if (req.url === '/gzip') res.setHeader('Content-Encoding', 'gzip');
    res.writeHead(cases[req.url]).end(req.url === '/gzip' ? gzipSync(json) : json);
  });
}

module.exports = { createMock };
if (require.main === module) {
  createMock().listen(17651, '127.0.0.1', () => console.log('Mock: http://127.0.0.1:17651'));
}
