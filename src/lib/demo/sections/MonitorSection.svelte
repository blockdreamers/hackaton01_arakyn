<script lang="ts">
	// Data monitor: the real connected DB as a terminal tree, and a traced keyword search replayed
	// over it (cursor walks categories, then rows), next to a single pipeline of what happened.
	// Read-only and LLM-free, so running it costs nothing.
	import { onMount, tick } from 'svelte';
	import { countSearch } from '#lib/demo/stats.ts';
	import type { MonitorTree, MonitorSearchResult, TraceRow } from '#lib/server/monitor.ts';

	type StepKey = 'request' | 'parse' | 'index' | 'filter' | 'deliver' | 'verify' | 'pay';
	type StepState = 'idle' | 'on' | 'done' | 'bad';
	const STEPS: { key: StepKey; label: string }[] = [
		{ key: 'request', label: 'Request' },
		{ key: 'parse', label: 'Parse spec' },
		{ key: 'index', label: 'Index lookup' },
		{ key: 'filter', label: 'Filter & rank' },
		{ key: 'deliver', label: 'Deliver' },
		{ key: 'verify', label: 'Verify' },
		{ key: 'pay', label: 'Pay' }
	];
	const HINTS = ['네오디움 자석', 'LED', '모터', '건전지 홀더'];

	let tree = $state<MonitorTree | null>(null);
	let loadError = $state('');
	let q = $state('');
	let running = $state(false);
	let res = $state<MonitorSearchResult | null>(null);
	let open = $state<Record<string, boolean>>({});
	let catStatus = $state<Record<string, 'match' | 'skip'>>({});
	let catMatches = $state<Record<string, number>>({});
	let rowStatus = $state<Record<number, 'scan' | 'match' | 'skip'>>({});
	let shownRows = $state<Record<string, TraceRow[]>>({});
	let cursor = $state<string | null>(null);
	let steps = $state<Record<StepKey, { s: StepState; v: string }>>(freshSteps());
	let log = $state<string[]>([]);
	let evaluated = $state(0);
	let replayMs = $state(0);
	let token = 0;
	let treeEl = $state<HTMLDivElement>();

	function freshSteps() {
		return Object.fromEntries(STEPS.map((s) => [s.key, { s: 'idle', v: '' }])) as Record<
			StepKey,
			{ s: StepState; v: string }
		>;
	}

	const fmt = (n: number) => n.toLocaleString('en-US');
	const money = (p: number | null, cur: string) =>
		p == null
			? '—'
			: cur === 'KRW'
				? `₩${fmt(p)}`
				: cur === 'JPY'
					? `¥${fmt(p)}`
					: `$${p.toFixed(2)}`;
	const ago = (iso: string | null) => {
		if (!iso) return 'never';
		const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
		return m < 60
			? `${m}m ago`
			: m < 1440
				? `${Math.round(m / 60)}h ago`
				: `${Math.round(m / 1440)}d ago`;
	};

	onMount(async () => {
		try {
			const r = await fetch('/api/monitor/tree');
			if (!r.ok) throw new Error(String(r.status));
			tree = await r.json();
		} catch (e) {
			loadError = `Could not read the database (${(e as Error).message}).`;
		}
	});

	const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	function note(line: string) {
		log = [...log, `${new Date().toLocaleTimeString('en-GB')}  ${line}`];
	}

	async function follow(id: string) {
		cursor = id;
		await tick();
		const el = treeEl?.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`);
		if (el && treeEl) {
			const top = el.offsetTop - treeEl.clientHeight / 2;
			treeEl.scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' });
		}
	}

	async function run(text = q) {
		if (!text.trim() || running || !tree) return;
		q = text;
		const my = ++token;
		running = true;
		res = null;
		catStatus = {};
		catMatches = {};
		rowStatus = {};
		shownRows = {};
		open = {};
		steps = freshSteps();
		log = [];
		evaluated = 0;
		countSearch();

		steps.request = { s: 'on', v: `“${text}”` };
		note(`request  search_offers("${text}")`);
		const t0 = performance.now();
		const r = await fetch('/api/monitor/search', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ q: text })
		});
		if (my !== token) return;
		if (!r.ok) {
			steps.request = { s: 'bad', v: `error ${r.status}` };
			running = false;
			return;
		}
		const data: MonitorSearchResult = await r.json();
		const animate = !reduced();
		const wait = (ms: number) => (animate ? sleep(ms) : Promise.resolve());
		steps.request = { s: 'done', v: `“${text}”` };
		steps.parse = {
			s: data.terms.length ? 'done' : 'bad',
			v: data.terms.length ? data.terms.join(' · ') : 'no search terms'
		};
		note(`parse    terms = [${data.terms.join(', ')}]`);
		await wait(350);

		// stage 1: walk the category folders
		steps.index = { s: 'on', v: 'scanning categories…' };
		for (const c of data.categories) {
			if (my !== token) return;
			await follow(`cat:${c.name}`);
			catStatus[c.name] = c.matches > 0 ? 'match' : 'skip';
			catMatches[c.name] = c.matches;
			evaluated++;
			await wait(70);
		}
		const hitCats = data.categories.filter((c) => c.matches > 0).length;
		steps.index = { s: 'done', v: `${hitCats} of ${data.categories.length} categories hit` };
		note(`index    ${hitCats}/${data.categories.length} categories contain a term`);

		// stage 2: open the busiest matching categories and walk their rows
		steps.filter = { s: 'on', v: 'checking rows…' };
		const byCat = new Map<string, TraceRow[]>();
		for (const row of data.rows) byCat.set(row.category, [...(byCat.get(row.category) ?? []), row]);
		for (const [cat, rows] of byCat) {
			if (my !== token) return;
			open[cat] = true;
			shownRows[cat] = rows;
			await tick();
			for (const row of rows) {
				if (my !== token) return;
				rowStatus[row.id] = 'scan';
				await follow(`row:${row.id}`);
				await wait(110);
				rowStatus[row.id] = row.result;
				evaluated++;
			}
		}
		steps.filter = { s: 'done', v: `${fmt(data.total)} matches → top 3 by price` };
		note(`filter   ${fmt(data.total)} rows match, ranked by unit price`);
		await wait(250);

		res = data;
		replayMs = performance.now() - t0;
		steps.deliver = {
			s: data.top.length ? 'done' : 'bad',
			v: data.top.length
				? `${Math.min(3, data.top.length)} rows · ${data.dataHash.slice(0, 10)}`
				: 'nothing to deliver'
		};
		note(`deliver  ${data.top.length} rows, hash ${data.dataHash}`);
		await wait(300);
		const passed = data.verify.checks.filter((c) => c.listed && c.termInName).length;
		steps.verify = {
			s: data.verify.pass ? 'done' : 'bad',
			v: `${passed}/${data.verify.checks.length} rows pass · code rules, 0 tokens`
		};
		note(`verify   ${data.verify.pass ? 'pass' : 'fail'} (${passed}/${data.verify.checks.length})`);
		await wait(300);
		steps.pay = data.verify.pass
			? { s: 'done', v: '0.02 USDC · x402 (simulated here)' }
			: { s: 'bad', v: 'refused · 0 USDC' };
		note(
			data.verify.pass
				? 'pay      0.02 USDC settled (simulated)'
				: 'pay      refused, agent re-searches'
		);
		cursor = null;
		running = false;
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		run();
	}

	const rank = (id: number) => (res ? res.top.slice(0, 3).findIndex((r) => r.id === id) + 1 : 0);
	const sitesTotal = $derived(tree ? tree.sites.length : 0);
</script>

<div class="mon">
	<div class="chips">
		<span class="chip live"><i></i>Live DB</span>
		{#if tree}
			<span class="chip"><b>{sitesTotal}</b> sites</span>
			<span class="chip"><b>{fmt(tree.totals.products)}</b> products</span>
			<span class="chip"><b>{tree.totals.categories}</b> categories</span>
			<span class="chip">scraped {ago(tree.totals.lastScraped)}</span>
		{:else if loadError}
			<span class="chip bad">{loadError}</span>
		{:else}
			<span class="chip">connecting…</span>
		{/if}
	</div>

	<form class="ask" onsubmit={submit}>
		<input
			bind:value={q}
			placeholder="Search the index, e.g. 네오디움 자석"
			aria-label="Search the index"
			disabled={running}
		/>
		<button class="btn btn-primary" disabled={running || !q.trim() || !tree}
			>{running ? 'Running…' : 'Run'}</button
		>
	</form>
	<p class="hint">
		Try
		{#each HINTS as h, i (h)}<button type="button" onclick={() => run(h)} disabled={running}
				>{h}</button
			>{i < HINTS.length - 1 ? ' · ' : ''}{/each}
	</p>

	<div class="grid">
		<div class="term">
			<div class="term-head">
				<span>catalog.db</span>
				<span class="state">{running ? 'scanning' : res ? 'done' : 'idle'}</span>
			</div>
			<div class="term-body" bind:this={treeEl}>
				{#if tree}
					<div class="row folder" data-row="root">
						<span class="nm">catalog.db/</span><span class="cm"
							># {sitesTotal} sites · {fmt(tree.totals.products)} products</span
						>
					</div>
					<div class="row folder d1"><span class="nm">sites/</span></div>
					{#each tree.sites as s (s.code)}
						<div class="row d2">
							<span class="nm site">{s.code}</span><span class="cm"
								># {s.name} · {s.country} · {s.currency} · {fmt(s.count)}</span
							>
						</div>
					{/each}
					<div class="row folder d1">
						<span class="nm">categories/</span><span class="cm"># top {tree.categories.length}</span
						>
					</div>
					{#each tree.categories as c (c.name)}
						{@const st = catStatus[c.name]}
						{@const isOpen = open[c.name]}
						<button
							type="button"
							class="row folder d2 {st ?? ''}"
							class:cur={cursor === `cat:${c.name}`}
							data-row={`cat:${c.name}`}
							onclick={() => (open[c.name] = !isOpen)}
						>
							<span class="caret">{isOpen ? '▾' : '▸'}</span><span class="nm">{c.name}/</span><span
								class="cm"
								># {st === 'match'
									? `${fmt(catMatches[c.name] ?? 0)} match`
									: st === 'skip'
										? 'skipped by index'
										: fmt(c.count)}</span
							>
						</button>
						{#if isOpen}
							{#each shownRows[c.name] ?? c.products as p (p.id)}
								{@const rs = rowStatus[p.id]}
								{@const rk = rank(p.id)}
								<div
									class="row d3 {rs ?? ''}"
									class:cur={cursor === `row:${p.id}`}
									data-row={`row:${p.id}`}
								>
									{#if rk}<span class="rank">#{rk}</span>{/if}<span class="nm prod">{p.name}</span
									><span class="cm"
										># {money(p.price, p.currency)}{rs === 'skip' && 'reason' in p
											? ` · ${p.reason}`
											: ''}</span
									>
								</div>
							{/each}
						{/if}
					{/each}
				{:else}
					<div class="row"><span class="cm">{loadError || 'loading…'}</span></div>
				{/if}
			</div>
			<div class="term-foot">
				{#if res}
					real query {res.realMs} ms · replay {(replayMs / 1000).toFixed(1)} s · {evaluated} rows evaluated
				{:else}
					Run a search to watch the engine walk the index
				{/if}
			</div>
		</div>

		<div class="side">
			<ol class="pipe">
				{#each STEPS as st, i (st.key)}
					{@const s = steps[st.key]}
					<li class={s.s}>
						<span class="dot">{s.s === 'done' ? '✓' : s.s === 'bad' ? '✕' : i + 1}</span>
						<div>
							<b>{st.label}</b>
							<span class="v">{s.v || '—'}</span>
						</div>
					</li>
				{/each}
			</ol>

			<div class="results">
				<div class="rh">
					<span>Delivered to the agent</span>
					{#if res}<span class="tag {res.verify.pass ? 'ok' : 'bad'}"
							>{res.verify.pass ? 'verified · paid' : 'not verified · not paid'}</span
						>{/if}
				</div>
				{#if res?.top.length}
					{#each res.top.slice(0, 3) as r, i (r.id)}
						<a class="card" href={r.url} target="_blank" rel="noreferrer">
							<span class="n">#{i + 1}</span>
							<span class="name">{r.name}</span>
							<span class="price">{money(r.price, r.currency)}</span>
							<span class="meta">{r.site} · seen {r.seen}</span>
						</a>
					{/each}
				{:else if res}
					<p class="empty">No product in the index matches “{res.query}”.</p>
				{:else}
					<p class="empty">Results appear here after a search.</p>
				{/if}
			</div>

			{#if log.length}
				<details class="log">
					<summary>Event log ({log.length})</summary>
					<pre>{log.join('\n')}</pre>
				</details>
			{/if}
		</div>
	</div>
</div>

<style>
	.mon {
		max-width: 1280px;
		margin: 0 auto;
		padding: 16px 20px 72px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font: 12.5px var(--mono);
		color: var(--muted);
		padding: 5px 11px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--glass);
	}
	.chip b {
		color: var(--ink);
		font-weight: 600;
	}
	.chip.live {
		color: var(--accent);
		border-color: rgba(93, 240, 168, 0.35);
	}
	.chip.live i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
		animation: blink 1.4s infinite;
	}
	.chip.bad {
		color: var(--red);
	}
	@keyframes blink {
		50% {
			opacity: 0.3;
		}
	}
	.ask {
		display: flex;
		gap: 10px;
		padding: 7px 7px 7px 18px;
		border-radius: 999px;
		background: var(--glass-2);
		border: 1px solid var(--brand-line);
		max-width: 720px;
	}
	.ask input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: 0;
		outline: 0;
		color: var(--ink);
		font: 15px var(--font);
	}
	.ask input::placeholder {
		color: var(--muted-2);
	}
	.ask .btn {
		padding: 10px 22px;
	}
	.hint {
		font-size: 13px;
		color: var(--muted-2);
		margin-top: -4px;
	}
	.hint button {
		background: none;
		border: 0;
		color: var(--brand-2);
		font: inherit;
		cursor: pointer;
		padding: 0 2px;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
		gap: 16px;
		align-items: start;
	}
	.term {
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		background: #050912;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.term-head,
	.term-foot {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 16px;
		font: 12px var(--mono);
		color: var(--muted-2);
		border-bottom: 1px solid var(--line);
	}
	.term-foot {
		border-bottom: 0;
		border-top: 1px solid var(--line);
	}
	.state {
		color: var(--brand-2);
	}
	.term-body {
		height: 560px;
		overflow: auto;
		padding: 10px 0;
		font: 13px/1.95 var(--mono);
	}
	.row {
		display: flex;
		align-items: baseline;
		gap: 10px;
		width: 100%;
		padding: 0 16px;
		white-space: nowrap;
		background: none;
		border: 0;
		color: var(--ink);
		font: inherit;
		text-align: left;
		transition:
			background 0.15s,
			opacity 0.2s;
	}
	button.row {
		cursor: pointer;
	}
	button.row:hover {
		background: rgba(61, 107, 255, 0.07);
	}
	.d1 {
		padding-left: 32px;
	}
	.d2 {
		padding-left: 48px;
	}
	.d3 {
		padding-left: 80px;
	}
	.caret {
		width: 10px;
		margin-left: -16px;
		color: var(--muted-2);
	}
	.nm {
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 0 1 auto;
		min-width: 0;
	}
	.folder .nm {
		color: var(--folder);
	}
	.site {
		color: var(--cyan);
	}
	.cm {
		color: var(--comment);
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1 1 auto;
		min-width: 0;
	}
	.row.skip {
		opacity: 0.38;
	}
	.row.match .nm {
		color: var(--amber);
	}
	.folder.match .cm {
		color: var(--brand-2);
	}
	.row.scan {
		background: rgba(92, 198, 255, 0.12);
	}
	.row.cur {
		background: rgba(31, 75, 255, 0.22);
		box-shadow: inset 3px 0 0 var(--brand-2);
	}
	.rank {
		font-size: 11px;
		font-weight: 700;
		color: #fff;
		background: var(--brand);
		border-radius: 4px;
		padding: 0 5px;
		line-height: 1.6;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.pipe {
		list-style: none;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		background: var(--glass);
		padding: 8px 16px;
	}
	.pipe li {
		display: flex;
		gap: 14px;
		padding: 9px 0;
		position: relative;
	}
	.pipe li + li::before {
		content: '';
		position: absolute;
		left: 12px;
		top: -9px;
		height: 18px;
		width: 1px;
		background: var(--line-strong);
	}
	.dot {
		flex: none;
		width: 25px;
		height: 25px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font: 600 11px var(--mono);
		color: var(--muted-2);
		border: 1px solid var(--line-strong);
		background: #050912;
	}
	.pipe li.on .dot {
		color: #fff;
		border-color: var(--brand-2);
		box-shadow: 0 0 0 4px rgba(61, 107, 255, 0.18);
	}
	.pipe li.done .dot {
		color: #fff;
		background: var(--brand);
		border-color: var(--brand);
	}
	.pipe li.bad .dot {
		color: #fff;
		background: var(--red);
		border-color: var(--red);
	}
	.pipe b {
		display: block;
		font-size: 14px;
		font-weight: 600;
	}
	.pipe .v {
		display: block;
		font: 12px var(--mono);
		color: var(--muted);
		overflow-wrap: anywhere;
	}
	.pipe li.idle b {
		color: var(--muted);
	}
	.results {
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		background: var(--glass);
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.rh {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		font: 600 11px var(--mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-2);
	}
	.tag {
		letter-spacing: 0;
		text-transform: none;
		font-weight: 500;
		padding: 2px 8px;
		border-radius: 999px;
		border: 1px solid;
	}
	.tag.ok {
		color: var(--accent);
	}
	.tag.bad {
		color: var(--red);
	}
	.card {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 2px 10px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: rgba(0, 0, 0, 0.25);
	}
	.card:hover {
		border-color: var(--brand-line);
	}
	.card .n {
		font: 700 12px var(--mono);
		color: var(--brand-2);
		grid-row: span 2;
		align-self: center;
	}
	.card .name {
		font-size: 14px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.card .price {
		font: 600 14px var(--mono);
		color: var(--accent);
	}
	.card .meta {
		grid-column: 2 / 4;
		font: 11.5px var(--mono);
		color: var(--muted-2);
	}
	.empty {
		font-size: 14px;
		color: var(--muted-2);
	}
	.log {
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 10px 14px;
		font-size: 13px;
		color: var(--muted);
	}
	.log summary {
		cursor: pointer;
	}
	.log pre {
		margin-top: 8px;
		font: 11.5px/1.7 var(--mono);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--muted);
	}
	@media (max-width: 1000px) {
		.grid {
			grid-template-columns: 1fr;
		}
		.term-body {
			height: 420px;
		}
	}
	@media (max-width: 560px) {
		.d2 {
			padding-left: 32px;
		}
		.d3 {
			padding-left: 48px;
		}
		.term-body {
			font-size: 12px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.chip.live i {
			animation: none;
		}
	}
</style>
