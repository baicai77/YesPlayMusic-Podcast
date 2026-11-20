const { AsyncLocalStorage } = require('async_hooks');

const upstreamTimeoutMs = 12000;
const upstreamConcurrency = 8;
const upstreamRequestScope = new AsyncLocalStorage();

module.exports = {
  upstreamRequestScope,
  upstreamTimeoutMs,
  upstreamConcurrency,
};
