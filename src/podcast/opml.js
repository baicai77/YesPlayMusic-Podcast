/**
 * 标准 OPML 1.0 / 2.0 播客订阅列表解析与导出
 */

const { parseXml, escapeXml, findChild, findChildren } = require('./xml');
const { normalizeFeedUrl, createPodcastId } = require('./rss');

/**
 * 解析 OPML XML 文本，提取所有包含有效 xmlUrl 的播客订阅源（支持嵌套分组）
 */
function parseOpml(opmlText) {
  if (!opmlText || typeof opmlText !== 'string') {
    throw new Error('OPML 内容为空');
  }
  const doc = parseXml(opmlText);
  const opmlNode = findChild(doc, 'opml');
  if (!opmlNode) {
    throw new Error('未能识别有效的 OPML 文件格式（缺少 <opml> 根节点）');
  }
  const bodyNode = findChild(opmlNode, 'body');
  if (!bodyNode) {
    throw new Error('OPML 文件缺少 <body> 内容');
  }

  const feeds = [];
  const seen = new Set();

  function walkOutlines(parentNode, groupName) {
    const outlines = findChildren(parentNode, 'outline');
    for (let i = 0; i < outlines.length; i++) {
      const node = outlines[i];
      const attrs = node.attrs || {};
      const xmlUrl = normalizeFeedUrl(attrs.xmlurl || attrs.url || '');
      const title = (attrs.title || attrs.text || '').trim();

      if (xmlUrl) {
        const key = xmlUrl.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          feeds.push({
            pid: createPodcastId(xmlUrl),
            feedUrl: xmlUrl,
            title: title || xmlUrl,
            link: attrs.htmlurl || '',
            description: (attrs.description || '').trim(),
            categories: groupName ? [groupName] : [],
          });
        }
      }

      if (node.children && node.children.length > 0) {
        walkOutlines(node, xmlUrl ? groupName : title || groupName);
      }
    }
  }

  walkOutlines(bodyNode, '');
  return feeds;
}

/**
 * 将本地订阅列表导出为标准 OPML 2.0 XML 字符串
 */
function exportOpml(subscriptions = [], title = 'YesPlayMusic RSS 播客订阅') {
  const now = new Date().toUTCString();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeXml(title)}</title>`,
    `    <dateCreated>${escapeXml(now)}</dateCreated>`,
    '  </head>',
    '  <body>',
  ];

  (subscriptions || []).forEach(sub => {
    const feedUrl = normalizeFeedUrl(sub && sub.feedUrl);
    if (!feedUrl) return;
    const text = escapeXml((sub.title || sub.name || feedUrl).trim());
    const xmlUrl = escapeXml(feedUrl);
    const htmlUrl = sub.link ? ` htmlUrl="${escapeXml(sub.link)}"` : '';
    const desc = sub.description
      ? ` description="${escapeXml(String(sub.description).slice(0, 200))}"`
      : '';
    lines.push(
      `    <outline type="rss" text="${text}" title="${text}" xmlUrl="${xmlUrl}"${htmlUrl}${desc} />`
    );
  });

  lines.push('  </body>', '</opml>');
  return lines.join('\n');
}

module.exports = {
  parseOpml,
  exportOpml,
};
