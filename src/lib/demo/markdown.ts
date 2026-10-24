// Tiny markdown renderer for agent answers: paragraphs, headings, lists, tables, code, bold,
// italics and links. Everything is HTML-escaped first and only http(s) links are kept, so the
// output is safe for {@html}.

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const host = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
};

const link = (url: string, label: string) =>
	`<a href="${url}" target="_blank" rel="noreferrer noopener">${label}</a>`;

function inline(raw: string) {
	const codes: string[] = [];
	let s = esc(raw).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
	// [label](https://...)
	s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => link(url, label));
	// bare URLs not already inside a link: show the domain only
	s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, url) => pre + link(url, host(url)));
	s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
	return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

const cells = (line: string) =>
	line
		.trim()
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map((c) => c.trim());

const isSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function md(text: string) {
	const lines = text
		.replace(/\r\n?/g, '\n')
		// the agent's text blocks arrive glued together ("…listings.100개 기준…"): break where a
		// sentence ends and the next starts with no space
		.replace(/([a-z][.!?])(?=[가-힣A-Z0-9])/g, '$1\n\n')
		.split('\n');
	const out: string[] = [];
	let para: string[] = [];
	const flush = () => {
		if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
		para = [];
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (/^\s*```/.test(line)) {
			flush();
			const body: string[] = [];
			while (++i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i]);
			out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
			continue;
		}

		if (/^\s*\|/.test(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
			flush();
			const head = cells(line);
			i++;
			const rows: string[][] = [];
			while (i + 1 < lines.length && /^\s*\|/.test(lines[i + 1])) rows.push(cells(lines[++i]));
			out.push(
				`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows
					.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
					.join('')}</tbody></table></div>`
			);
			continue;
		}

		const h = line.match(/^\s*(#{1,4})\s+(.*)$/);
		if (h) {
			flush();
			const level = Math.min(6, h[1].length + 2);
			out.push(`<h${level}>${inline(h[2])}</h${level}>`);
			continue;
		}

		if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
			flush();
			const ordered = /^\s*\d/.test(line);
			const items: string[] = [];
			i--;
			while (i + 1 < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i + 1]))
				items.push(lines[++i].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
			const tag = ordered ? 'ol' : 'ul';
			out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
			continue;
		}

		if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
			flush();
			out.push('<hr>');
			continue;
		}

		if (!line.trim()) flush();
		else para.push(line);
	}
	flush();
	return out.join('');
}
