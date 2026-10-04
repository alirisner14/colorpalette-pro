// Renders the Markdown documents in /Legal as readable pages: legal.html?doc=privacy

export const DOCS = {
  privacy: { file: 'Legal/shared/PRIVACY-POLICY.md', title: 'Privacy Policy' },
  eula: { file: 'Legal/shared/EULA.md', title: 'End User Licence Agreement' },
  terms: { file: 'Legal/shared/TERMS-OF-USE.md', title: 'Terms of Use' },
  licences: { file: 'Legal/shared/THIRD-PARTY-LICENCES.md', title: 'Third-party licences' },
  sale: { file: 'Legal/direct/TERMS-OF-SALE.md', title: 'Terms of Sale' },
  refunds: { file: 'Legal/direct/REFUND-POLICY.md', title: 'Refund Policy' },
  support: { file: 'Legal/direct/SUPPORT-POLICY.md', title: 'Support Policy' },
  start: { file: 'Legal/direct/INSTALL.md', title: 'Getting started' },
};

const byFile = Object.fromEntries(Object.entries(DOCS).map(([id, d]) => [d.file.split('/').pop(), id]));

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function link(href, text) {
  const file = href.split('/').pop().split('#')[0];
  if (byFile[file]) return `<a href="legal.html?doc=${byFile[file]}">${text}</a>`;
  if (/^(https?:|mailto:)/.test(href)) return `<a href="${esc(href)}" rel="noopener" target="_blank">${text}</a>`;
  return text; // internal notes that point at repo files: show as text
}

function inline(s) {
  const codes = [];
  s = esc(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, h) => link(h, t))
    .replace(/&lt;((?:https?:\/\/|mailto:)[^&\s]+)&gt;/g, (_, u) => link(u, u))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\b([\w.+-]+@[\w-]+\.[\w.]+)\b(?![^<]*>)/g, (m) => `<a href="mailto:${m}">${m}</a>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

/**
 * The documents carry notes for the publisher as blockquotes and as
 * *(Remove this…)* asides. Readers of the published page never see them.
 */
export function publicText(md) {
  return md
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !l.startsWith('>'))
    .join('\n')
    .replace(/\s*\*\((?:Remove|Fill|Delete)[^)]*\)\*/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

/** Small Markdown subset: headings, paragraphs, lists, tables, quotes, code, rules. */
export function renderMarkdown(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const buf = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) buf.push(lines[i]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      out.push(`<h${h[1].length} id="${id}">${inline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(`<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)/;
    if (li.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && (li.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = lines[i].match(li);
        if (m && m[1].length < 2) items.push(m[3]);
        else items[items.length - 1] += ` ${lines[i].trim().replace(/^[-*]\s+/, '')}`;
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => {
        const box = t.match(/^\[( |x)\]\s+(.*)/i);
        return box ? `<li class="task"><span class="box">${box[1].trim() ? '☑' : '☐'}</span> ${inline(box[2])}</li>` : `<li>${inline(t)}</li>`;
      }).join('')}</${tag}>`);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\||```|---+\s*$|\s*([-*]|\d+\.)\s)/.test(lines[i])) buf.push(lines[i++]);
    // Short lines inside a paragraph are deliberate breaks (addresses, bylines).
    const text = buf.map((l, k) => l + (k < buf.length - 1 ? (l.length < 55 ? '\u0001' : ' ') : '')).join('');
    out.push(`<p>${inline(text).replace(/\u0001/g, '<br>')}</p>`);
  }
  return out.join('\n');
}

async function main() {
  const id = new URLSearchParams(location.search).get('doc') || 'privacy';
  const doc = DOCS[id] || DOCS.privacy;
  document.title = `${doc.title} · Color Palette PRO`;
  document.querySelector('#doc-nav').innerHTML = Object.entries(DOCS)
    .map(([k, d]) => `<a href="legal.html?doc=${k}" ${DOCS[k] === doc ? 'aria-current="page"' : ''}>${d.title}</a>`).join('');
  const el = document.querySelector('#doc');
  try {
    const res = await fetch(doc.file);
    if (!res.ok) throw new Error(res.status);
    el.innerHTML = renderMarkdown(publicText(await res.text()));
  } catch {
    el.innerHTML = '<p>Sorry, this document could not be loaded. Please email <a href="mailto:ontherisedigital@gmail.com">ontherisedigital@gmail.com</a>.</p>';
  }
}

if (typeof document !== 'undefined') main();
