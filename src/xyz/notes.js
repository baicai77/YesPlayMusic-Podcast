// Rebuild remote HTML from a small allowlist; never retain scripts or event handlers.
export function formatShowNotes(notes) {
  if (!notes) return '<p>暂无 Show Notes</p>';
  const source = new DOMParser().parseFromString(String(notes), 'text/html');
  const output = document.createElement('div');
  const allowed = new Set([
    'P',
    'BR',
    'DIV',
    'SPAN',
    'STRONG',
    'B',
    'EM',
    'I',
    'UL',
    'OL',
    'LI',
    'BLOCKQUOTE',
    'H1',
    'H2',
    'H3',
    'H4',
    'A',
    'IMG',
    'HR',
    'PRE',
    'CODE',
  ]);
  const blocked = new Set([
    'SCRIPT',
    'STYLE',
    'IFRAME',
    'OBJECT',
    'EMBED',
    'FORM',
    'INPUT',
    'SVG',
    'MATH',
    'TEMPLATE',
  ]);
  function safeUrl(value) {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }
  function append(node, parent) {
    if (node.nodeType === 3) {
      node.textContent.split('\n').forEach((text, index) => {
        if (index) parent.appendChild(document.createElement('br'));
        parent.appendChild(document.createTextNode(text));
      });
      return;
    }
    if (node.nodeType !== 1 || blocked.has(node.tagName)) return;
    const element = allowed.has(node.tagName)
      ? document.createElement(node.tagName.toLowerCase())
      : document.createElement('span');
    if (node.tagName === 'A') {
      const href = safeUrl(node.getAttribute('href'));
      if (href) element.setAttribute('href', href);
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG') {
      const src = safeUrl(node.getAttribute('src'));
      if (!src) return;
      element.setAttribute('src', src);
      element.setAttribute('alt', node.getAttribute('alt') || '节目图片');
      element.setAttribute('loading', 'lazy');
      element.style.maxWidth = '100%';
    }
    Array.from(node.childNodes).forEach(child => append(child, element));
    parent.appendChild(element);
  }
  Array.from(source.body.childNodes).forEach(node => append(node, output));
  return output.innerHTML;
}
