const fallbackMs = 30000;

function retryDeadline(value, now = Date.now()) {
  if (typeof value !== 'string') return now + fallbackMs;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const deadline = now + Number(text) * 1000;
    return Number.isFinite(deadline) ? deadline : now + fallbackMs;
  }
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(now, date) : now + fallbackMs;
}

function retrySeconds(deadline, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

module.exports = { retryDeadline, retrySeconds };
