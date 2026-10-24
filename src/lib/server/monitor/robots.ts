// Minimal robots.txt parser/matcher (RFC 9309): group selection by user-agent,
// `*` and `$` patterns, longest match wins, Allow wins ties.

export interface RobotsRule {
	allow: boolean;
	path: string;
}

export interface RobotsGroup {
	agents: string[];
	rules: RobotsRule[];
	crawlDelay?: number;
}

export function parseRobots(text: string): RobotsGroup[] {
	const groups: RobotsGroup[] = [];
	let current: RobotsGroup | null = null;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.replace(/#.*$/, '').trim();
		const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
		if (!m) continue;
		const key = m[1].toLowerCase();
		const value = m[2].trim();
		if (key === 'user-agent') {
			// consecutive user-agent lines share one group
			if (!current || current.rules.length || current.crawlDelay !== undefined) {
				current = { agents: [], rules: [] };
				groups.push(current);
			}
			current.agents.push(value.toLowerCase());
		} else if (current && (key === 'allow' || key === 'disallow')) {
			// an empty Disallow allows everything
			if (value) current.rules.push({ allow: key === 'allow', path: value });
		} else if (current && key === 'crawl-delay') {
			const n = Number(value);
			if (Number.isFinite(n)) current.crawlDelay = n;
		}
	}
	return groups;
}

/** Group for our user agent token, falling back to `*` */
export function groupFor(groups: RobotsGroup[], token: string): RobotsGroup | undefined {
	const t = token.toLowerCase();
	return (
		groups.find((g) => g.agents.some((a) => a !== '*' && t.includes(a))) ??
		groups.find((g) => g.agents.includes('*'))
	);
}

function patternToRegex(path: string): RegExp {
	const anchored = path.endsWith('$');
	const body = (anchored ? path.slice(0, -1) : path)
		.split('*')
		.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
		.join('.*');
	return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** Whether `url` may be fetched under `group` (no group = allowed) */
export function isAllowed(
	group: RobotsGroup | undefined,
	url: string
): { allowed: boolean; rule?: RobotsRule } {
	if (!group) return { allowed: true };
	const u = new URL(url);
	let target = u.pathname + u.search;
	try {
		target = decodeURI(target);
	} catch {
		// keep the raw path
	}
	let best: RobotsRule | undefined;
	for (const rule of group.rules) {
		let path = rule.path;
		try {
			path = decodeURI(path);
		} catch {
			// keep the raw rule
		}
		if (!patternToRegex(path).test(target)) continue;
		if (
			!best ||
			rule.path.length > best.path.length ||
			(rule.path.length === best.path.length && rule.allow)
		) {
			best = rule;
		}
	}
	return { allowed: !best || best.allow, rule: best };
}

/** AI crawler tokens that sites commonly block wholesale */
export const AI_AGENTS = [
	'claudebot',
	'anthropic-ai',
	'claude-web',
	'gptbot',
	'ccbot',
	'google-extended'
];

export function blocksAllFor(groups: RobotsGroup[], agent: string): boolean {
	const g = groups.find((x) => x.agents.includes(agent));
	return (
		!!g &&
		g.rules.some((r) => !r.allow && r.path === '/') &&
		!g.rules.some((r) => r.allow && r.path === '/')
	);
}
