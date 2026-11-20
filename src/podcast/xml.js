/**
 * 轻量级零依赖 XML 解析器（适用于 RSS 2.0 / Atom / OPML）
 */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeXmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g,
    (match, entity) => {
      if (entity[0] === '#') {
        const isHex = entity[1] === 'x' || entity[1] === 'X';
        const codePoint = parseInt(
          entity.slice(isHex ? 2 : 1),
          isHex ? 16 : 10
        );
        if (
          Number.isFinite(codePoint) &&
          codePoint >= 0 &&
          codePoint <= 0x10ffff
        ) {
          try {
            return String.fromCodePoint(codePoint);
          } catch (e) {
            return match;
          }
        }
        return match;
      }
      const lower = entity.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower)
        ? NAMED_ENTITIES[lower]
        : match;
    }
  );
}

function escapeXml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseAttributes(attrString) {
  const attrs = {};
  if (!attrString) return attrs;
  const regex = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = regex.exec(attrString)) !== null) {
    const key = match[1].toLowerCase();
    const rawVal =
      match[2] !== undefined
        ? match[2]
        : match[3] !== undefined
        ? match[3]
        : match[4] || '';
    attrs[key] = decodeXmlEntities(rawVal);
  }
  return attrs;
}

/**
 * 将 XML 字符串解析为树结构
 * 节点结构：{ name: string, rawName: string, attrs: object, children: Node[], text: string }
 */
function parseXml(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') {
    throw new Error('XML 内容为空');
  }
  // 去除 BOM
  const src = xmlText.replace(/^\uFEFF/, '');
  const root = {
    name: '#document',
    rawName: '#document',
    attrs: {},
    children: [],
    text: '',
  };
  const stack = [root];
  const len = src.length;
  let pos = 0;

  while (pos < len) {
    const lt = src.indexOf('<', pos);
    if (lt === -1) {
      const tail = src.slice(pos);
      if (tail) {
        stack[stack.length - 1].text += decodeXmlEntities(tail);
      }
      break;
    }

    if (lt > pos) {
      const textChunk = src.slice(pos, lt);
      stack[stack.length - 1].text += decodeXmlEntities(textChunk);
    }

    // CDATA
    if (src.startsWith('<![CDATA[', lt)) {
      const endCdata = src.indexOf(']]>', lt + 9);
      if (endCdata === -1) {
        stack[stack.length - 1].text += src.slice(lt + 9);
        break;
      }
      stack[stack.length - 1].text += src.slice(lt + 9, endCdata);
      pos = endCdata + 3;
      continue;
    }

    // Comment
    if (src.startsWith('<!--', lt)) {
      const endComment = src.indexOf('-->', lt + 4);
      if (endComment === -1) break;
      pos = endComment + 3;
      continue;
    }

    // Processing instruction <?...?>
    if (src.startsWith('<?', lt)) {
      const endPi = src.indexOf('?>', lt + 2);
      if (endPi === -1) break;
      pos = endPi + 2;
      continue;
    }

    // DOCTYPE or other <!...> declarations
    if (src.startsWith('<!', lt)) {
      let depth = 1;
      let cursor = lt + 2;
      while (cursor < len && depth > 0) {
        if (src[cursor] === '<') depth++;
        else if (src[cursor] === '>') depth--;
        cursor++;
      }
      pos = cursor;
      continue;
    }

    // Find end of tag, respecting quotes inside attributes
    let gt = -1;
    let quote = null;
    for (let i = lt + 1; i < len; i++) {
      const ch = src[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        gt = i;
        break;
      }
    }

    if (gt === -1) {
      stack[stack.length - 1].text += decodeXmlEntities(src.slice(lt));
      break;
    }

    const rawTag = src.slice(lt + 1, gt).trim();
    pos = gt + 1;

    if (!rawTag) continue;

    // Closing tag </name>
    if (rawTag[0] === '/') {
      const closeName = rawTag.slice(1).trim().toLowerCase();
      for (let idx = stack.length - 1; idx >= 1; idx--) {
        if (stack[idx].name === closeName) {
          stack.length = idx;
          break;
        }
      }
      continue;
    }

    const selfClosing = rawTag[rawTag.length - 1] === '/';
    const tagBody = selfClosing
      ? rawTag.slice(0, rawTag.length - 1).trim()
      : rawTag;

    const spaceIdx = tagBody.search(/\s/);
    const rawName = spaceIdx === -1 ? tagBody : tagBody.slice(0, spaceIdx);
    const attrStr = spaceIdx === -1 ? '' : tagBody.slice(spaceIdx + 1);

    if (!rawName || !/^[a-zA-Z_][\w:.-]*$/.test(rawName)) {
      continue;
    }

    const node = {
      name: rawName.toLowerCase(),
      rawName,
      attrs: parseAttributes(attrStr),
      children: [],
      text: '',
    };

    stack[stack.length - 1].children.push(node);
    if (!selfClosing) {
      stack.push(node);
    }
  }

  return root;
}

function findChild(node, names) {
  if (!node || !Array.isArray(node.children)) return null;
  const targets = Array.isArray(names)
    ? names.map(n => n.toLowerCase())
    : [String(names).toLowerCase()];
  for (let i = 0; i < node.children.length; i++) {
    if (targets.includes(node.children[i].name)) {
      return node.children[i];
    }
  }
  return null;
}

function findChildren(node, names) {
  if (!node || !Array.isArray(node.children)) return [];
  const targets = Array.isArray(names)
    ? names.map(n => n.toLowerCase())
    : [String(names).toLowerCase()];
  return node.children.filter(child => targets.includes(child.name));
}

function getChildText(node, names) {
  const child = findChild(node, names);
  return child ? child.text.trim() : '';
}

module.exports = {
  decodeXmlEntities,
  escapeXml,
  parseXml,
  findChild,
  findChildren,
  getChildText,
};
