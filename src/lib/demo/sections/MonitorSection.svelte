<script lang="ts">
	import ProductMarquee from '#lib/demo/ProductMarquee.svelte';
	import RollingNumber from '#lib/demo/RollingNumber.svelte';
	import GhostSuggest from '#lib/demo/GhostSuggest.svelte';
	import type { Preset } from '#lib/demo/presets.ts';
	// Data monitor: the real connected DB as a terminal tree, and a traced keyword search replayed
	// over it (cursor walks categories, then rows), next to a single pipeline of what happened.
	// Read-only and LLM-free, so running it costs nothing.
	import { onMount, tick, untrack } from 'svelte';
	import { demo } from '#lib/demo/demo-state.svelte.ts';
	import { slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { countSearch } from '#lib/demo/stats.ts';
	import { t, i18n } from '#lib/demo/i18n.svelte.ts';
	import type { MonitorTree, MonitorSearchResult, Product, TraceRow } from '#lib/server/monitor.ts';

	type StepKey = 'request' | 'parse' | 'index' | 'filter' | 'deliver' | 'verify' | 'pay';
	type StepState = 'idle' | 'on' | 'done' | 'bad';
	// step values are stored as functions when they hold copy, so they follow the EN / 한국어 switch
	type Val = string | (() => string);
	const vv = (v: Val) => (typeof v === 'function' ? v() : v);
	const STEPS: { key: StepKey; label: () => string }[] = [
		{ key: 'request', label: () => t('Request', '요청') },
		{ key: 'parse', label: () => t('Parse spec', '스펙 해석') },
		{ key: 'index', label: () => t('Index lookup', '인덱스 조회') },
		{ key: 'filter', label: () => t('Filter & rank', '필터 · 정렬') },
		{ key: 'deliver', label: () => t('Deliver', '전달') },
		{ key: 'verify', label: () => t('Verify', '검증') },
		{ key: 'pay', label: () => t('Pay', '결제') }
	];
	const HINTS = ['LED', '캐스터', '자석', 'socket screw'];

	let tree = $state<MonitorTree | null>(null);
	let loadError = $state('');
	let q = $state('');
	let running = $state(false);
	let res = $state<MonitorSearchResult | null>(null);
	let open = $state<Record<string, boolean>>({});
	let catStatus = $state<Record<string, 'match' | 'skip'>>({});
	let catMatches = $state<Record<string, number>>({});
	let siteStatus = $state<Record<string, 'match' | 'skip'>>({});
	let siteMatches = $state<Record<string, number>>({});
	let siteRows = $state<Record<string, Product[]>>({});
	let detail = $state<number | null>(null);
	let rowStatus = $state<Record<number, 'scan' | 'match' | 'skip'>>({});
	let shownRows = $state<Record<string, TraceRow[]>>({});
	let cursor = $state<string | null>(null);
	let steps = $state<Record<StepKey, { s: StepState; v: Val }>>(freshSteps());
	let log = $state<string[]>([]);
	// live detail feed: one card per step in the order they ran; only the current one is open
	let feed = $state<StepKey[]>([]);
	let expanded = $state<StepKey[]>([]);
	let live = $state<MonitorSearchResult | null>(null);
	let kept = $state(0);
	let dropped = $state(0);
	let feedEl = $state<HTMLDivElement>();
	let evaluated = $state(0);
	let replayMs = $state(0);
	let token = 0;
	let treeEl = $state<HTMLDivElement>();
	// during a search the tree folds shut, then matching folders float to the top
	let sorted = $state(false);
	let calm = $state(false);
	const FOLD = 300;
	const matchFirst = <T,>(list: T[], key: (x: T) => string, hits: Record<string, number>) =>
		sorted ? [...list].sort((a, b) => (hits[key(b)] ?? 0) - (hits[key(a)] ?? 0)) : list;
	const siteList = $derived(tree ? matchFirst(tree.sites, (x) => x.code, siteMatches) : []);
	const catList = $derived(tree ? matchFirst(tree.categories, (x) => x.name, catMatches) : []);

	function freshSteps() {
		return Object.fromEntries(STEPS.map((s) => [s.key, { s: 'idle', v: '' }])) as Record<
			StepKey,
			{ s: StepState; v: Val }
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
					: cur === 'GBP'
						? `£${p.toFixed(2)}`
						: cur === 'EUR'
							? `€${p.toFixed(2)}`
							: `${p.toFixed(2)}`;
	const krw = (p: Product) =>
		p.currency === 'KRW' || p.priceKrw == null ? '' : `≈₩${fmt(p.priceKrw)}`;
	const off = (p: Product) =>
		p.listPrice && p.price && p.listPrice > p.price
			? Math.round((1 - p.price / p.listPrice) * 100)
			: 0;
	const day = (iso: string) => iso.slice(0, 10);
	const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
	const flag = (cc: string) =>
		cc.length === 2
			? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)))
			: '';
	const minutesSince = (iso: string | null) =>
		iso ? Math.max(1, (Date.now() - new Date(iso).getTime()) / 60000) : 0;
	const elapsed = (iso: string | null) => {
		const m = Math.round(minutesSince(iso));
		return m >= 60
			? t(`${Math.floor(m / 60)}h ${m % 60}m`, `${Math.floor(m / 60)}시간 ${m % 60}분`)
			: t(`${m}m`, `${m}분`);
	};
	const rate = $derived(
		tree?.collection.since
			? Math.round(tree.totals.products / minutesSince(tree.collection.since))
			: 0
	);
	const maxBucket = $derived(Math.max(1, ...(tree?.collection.buckets.map((b) => b.n) ?? [1])));
	const ago = (iso: string | null) => {
		if (!iso) return t('never', '기록 없음');
		const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
		return m < 60
			? t(`${m}m ago`, `${m}분 전`)
			: m < 1440
				? t(`${Math.round(m / 60)}h ago`, `${Math.round(m / 60)}시간 전`)
				: t(`${Math.round(m / 1440)}d ago`, `${Math.round(m / 1440)}일 전`);
	};

	onMount(async () => {
		calm = reduced();
		try {
			const r = await fetch('/api/monitor/tree');
			if (!r.ok) throw new Error(String(r.status));
			const mt: MonitorTree = await r.json();
			// open the two biggest categories so there is data to look at before any search
			for (const c of mt.categories.slice(0, 2)) open[c.name] = true;
			tree = mt;
		} catch (e) {
			loadError = (e as Error).message;
		}
	});

	const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	async function begin(k: StepKey, v: Val = '') {
		steps[k] = { s: 'on', v };
		if (!feed.includes(k)) feed = [...feed, k];
		expanded = [k];
		await tick();
		feedEl?.scrollTo({ top: feedEl.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' });
	}

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

	async function run(text = q, terms?: string[]) {
		if (!text.trim() || running || !tree) return;
		q = text;
		const my = ++token;
		running = true;
		res = null;
		catStatus = {};
		catMatches = {};
		siteStatus = {};
		siteMatches = {};
		siteRows = {};
		detail = null;
		rowStatus = {};
		shownRows = {};
		steps = freshSteps();
		log = [];
		feed = [];
		expanded = [];
		live = null;
		kept = 0;
		dropped = 0;
		evaluated = 0;
		countSearch();
		// fold every open folder shut and put the tree back in its natural order
		const hadOpen = Object.values(open).some(Boolean);
		open = {};
		sorted = false;
		treeEl?.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
		if (hadOpen && !reduced()) await sleep(FOLD + 80);
		if (my !== token) return;

		await begin('request', `“${text}”`);
		note(`request  search_offers("${text}")`);
		const t0 = performance.now();
		const r = await fetch('/api/monitor/search', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ q: text, terms })
		});
		if (my !== token) return;
		if (!r.ok) {
			steps.request = { s: 'bad', v: () => t(`error ${r.status}`, `오류 ${r.status}`) };
			running = false;
			return;
		}
		const data: MonitorSearchResult = await r.json();
		live = data;
		const animate = !reduced();
		const wait = (ms: number) => (animate ? sleep(ms) : Promise.resolve());
		steps.request = { s: 'done', v: `“${text}”` };
		await wait(500);
		await begin('parse');
		steps.parse = {
			s: data.terms.length ? 'done' : 'bad',
			v: data.terms.length ? data.terms.join(' · ') : () => t('no search terms', '검색어 없음')
		};
		note(`parse    terms = [${data.terms.join(', ')}]`);
		await wait(700);

		// stage 1: which shops have matches
		await begin('index', () => t('scanning sites…', '사이트 스캔 중…'));
		for (const st of data.sites) {
			if (my !== token) return;
			await follow(`site:${st.code}`);
			siteStatus[st.code] = st.matches > 0 ? 'match' : 'skip';
			siteMatches[st.code] = st.matches;
			if (st.rows.length) {
				siteRows[st.code] = st.rows;
				open[`site:${st.code}`] = true;
			}
			evaluated++;
			await wait(st.rows.length ? 380 : 120);
			// fold it again before moving on, so the walk reads as one folder at a time
			open[`site:${st.code}`] = false;
		}
		const hitSites = data.sites.filter((x) => x.matches > 0).length;
		note(`sites    ${hitSites}/${data.sites.length} shops have matches`);

		// stage 2: walk the category folders
		steps.index = { s: 'on', v: () => t('scanning categories…', '카테고리 스캔 중…') };
		for (const c of data.categories) {
			if (my !== token) return;
			await follow(`cat:${c.name}`);
			catStatus[c.name] = c.matches > 0 ? 'match' : 'skip';
			catMatches[c.name] = c.matches;
			evaluated++;
			await wait(70);
		}
		const hitCats = data.categories.filter((c) => c.matches > 0).length;
		// matching folders float to the top
		cursor = null;
		sorted = true;
		await wait(650);
		steps.index = {
			s: 'done',
			v: () =>
				t(
					`${hitSites} of ${data.sites.length} sites · ${hitCats} of ${data.categories.length} categories`,
					`사이트 ${data.sites.length}곳 중 ${hitSites}곳 · 카테고리 ${data.categories.length}개 중 ${hitCats}개`
				)
		};
		note(`index    ${hitCats}/${data.categories.length} categories contain a term`);

		// stage 3: open the busiest matching categories and walk their rows
		await begin('filter', () => t('checking rows…', '상품 확인 중…'));
		const byCat: Record<string, TraceRow[]> = {};
		for (const row of data.rows) (byCat[row.category] ??= []).push(row);
		let prev: string | null = null;
		for (const [cat, rows] of Object.entries(byCat)) {
			if (my !== token) return;
			// accordion: close the folder just walked before opening the next
			if (prev) {
				open[prev] = false;
				await wait(FOLD);
			}
			prev = cat;
			open[cat] = true;
			shownRows[cat] = rows;
			await tick();
			for (const row of rows) {
				if (my !== token) return;
				rowStatus[row.id] = 'scan';
				await follow(`row:${row.id}`);
				await wait(110);
				rowStatus[row.id] = row.result;
				if (row.result === 'match') kept++;
				else dropped++;
				evaluated++;
			}
		}
		// end state: matching shops open with their rows, next to the last folder walked
		for (const st of data.sites) if (st.rows.length) open[`site:${st.code}`] = true;
		steps.filter = {
			s: 'done',
			v: () =>
				t(
					`${fmt(data.total)} matches → top 3 by price`,
					`${fmt(data.total)}건 일치 → 가격순 상위 3개`
				)
		};
		note(`filter   ${fmt(data.total)} rows match, ranked by unit price`);
		await wait(250);

		res = data;
		replayMs = performance.now() - t0;
		await begin('deliver');
		steps.deliver = {
			s: data.top.length ? 'done' : 'bad',
			v: data.top.length
				? () =>
						t(
							`${Math.min(3, data.top.length)} rows · ${data.dataHash.slice(0, 10)}`,
							`${Math.min(3, data.top.length)}개 · ${data.dataHash.slice(0, 10)}`
						)
				: () => t('nothing to deliver', '전달할 결과 없음')
		};
		note(`deliver  ${data.top.length} rows, hash ${data.dataHash}`);
		await wait(900);
		await begin('verify');
		const passed = data.verify.checks.filter((c) => c.listed && c.termInName).length;
		steps.verify = {
			s: data.verify.pass ? 'done' : 'bad',
			v: () =>
				t(
					`${passed}/${data.verify.checks.length} rows pass · code rules, 0 tokens`,
					`${passed}/${data.verify.checks.length}개 통과 · 코드 규칙, 토큰 0`
				)
		};
		note(`verify   ${data.verify.pass ? 'pass' : 'fail'} (${passed}/${data.verify.checks.length})`);
		await wait(900);
		await begin('pay');
		steps.pay = data.verify.pass
			? {
					s: 'done',
					v: () => t('0.02 USDC · x402 (simulated here)', '0.02 USDC · x402 (여기서는 시뮬레이션)')
				}
			: { s: 'bad', v: () => t('refused · 0 USDC', '거절 · 0 USDC') };
		note(
			data.verify.pass
				? 'pay      0.02 USDC settled (simulated)'
				: 'pay      refused, agent re-searches'
		);
		// leave the delivered rows and the payment open at the end
		if (data.top.length) expanded = ['deliver', 'pay'];
		cursor = null;
		running = false;
		await tick();
		feedEl?.scrollTo({ top: feedEl.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' });
	}

	// One search plays everywhere: asking here hands the query to the token race, which runs it
	// and broadcasts demo.lastQuery back; that is what starts the scan replay below.
	let relayed = $state(false);
	let lastSeenId = 0;

	// the click-to-search example: same preset as the race box, run as a free replay
	function askPreset(p: Preset) {
		q = p.question;
		if (demo.raceMounted) {
			relayed = true;
			demo.raceRequest = {
				id: Date.now(),
				label: p.question,
				body: { mode: 'preset', presetId: p.id, lanes: ['catalog', 'web'] }
			};
		} else {
			relayed = false;
			run(p.question);
		}
	}

	function ask(text: string) {
		if (!text.trim()) return;
		q = text;
		if (demo.raceMounted) {
			relayed = true;
			demo.raceRequest = {
				id: Date.now(),
				label: text,
				body: { mode: 'ai', query: text, lanes: ['catalog', 'web'] }
			};
		} else {
			relayed = false;
			run(text);
		}
	}

	$effect(() => {
		const lq = demo.lastQuery;
		if (!lq || lq.id === lastSeenId) return;
		lastSeenId = lq.id;
		untrack(() => {
			q = lq.label;
			// a newer shared search replaces whatever replay is on screen
			token++;
			running = false;
			// same keywords the catalog agent searches with
			run(lq.label, lq.terms);
		});
	});

	function submit(e: SubmitEvent) {
		e.preventDefault();
		ask(q);
	}

	const doneCount = $derived(STEPS.filter((x) => steps[x.key].s === 'done').length);
	const failed = $derived(STEPS.some((x) => steps[x.key].s === 'bad'));
	const current = $derived(STEPS.findIndex((x) => steps[x.key].s === 'on'));
	const progress = $derived(
		current >= 0 ? (current + 0.5) / STEPS.length : doneCount / STEPS.length
	);
	const ok = (b: boolean) => (b ? '✓' : '✕');

	const rank = (id: number) => (res ? res.top.slice(0, 3).findIndex((r) => r.id === id) + 1 : 0);
	const sitesTotal = $derived(tree ? tree.sites.length : 0);
</script>

{#snippet prow(p: Product, depth: string, status?: string, reason?: string)}
	{@const rk = rank(p.id)}
	{@const pct = off(p)}
	<button
		type="button"
		class="row prow {depth} {status ?? ''}"
		class:cur={cursor === `row:${p.id}`}
		data-row={`row:${p.id}`}
		onclick={() => (detail = detail === p.id ? null : p.id)}
	>
		{#if p.image}<img class="thumb" src={p.image} alt="" loading="lazy" />{:else}<span
				class="thumb none"
			></span>{/if}
		{#if rk}<span class="rank">#{rk}</span>{/if}
		<span class="nm prod">{p.name}</span>
		<span class="sb">{p.site}</span>
		<span class="pr">{money(p.price, p.currency)}</span>
		{#if krw(p)}<span class="cv">{krw(p)}</span>{/if}
		{#if pct}<span class="off">-{pct}%</span>{/if}
		{#if status === 'skip' && reason}<span class="cm"># {reason}</span>{/if}
	</button>
	{#if detail === p.id}
		<div class="detail {depth}">
			<div class="dl">
				{#each p.categories.slice(0, 4) as c (c)}<span class="cat">{c}</span>{/each}
			</div>
			<div class="dl mono">
				{t('first seen', '최초 수집')}
				{day(p.firstSeen)} · {t('last seen', '최근 확인')}
				{day(p.lastSeen)}{#if p.listPrice && pct}
					· {t('list', '정가')} {money(p.listPrice, p.currency)}{/if}
				·
				<a href={p.url} target="_blank" rel="noreferrer">{t('open listing ↗', '상품 페이지 ↗')}</a>
			</div>
		</div>
	{/if}
{/snippet}

<div class="mon">
	<div class="chips">
		<span class="chip live"><i></i>{t('Live DB', '실시간 DB')}</span>
		{#if tree}
			<span class="chip"><span><b>{sitesTotal}</b>{t(' sites', '개 사이트')}</span></span>
			<span class="chip"
				><span><b>{fmt(tree.totals.products)}</b>{t(' products', '개 상품')}</span></span
			>
			<span class="chip"
				><span><b>{tree.totals.categories}</b>{t(' categories', '개 카테고리')}</span></span
			>
			<span class="chip">{t('scraped', '최근 수집')} {ago(tree.totals.lastScraped)}</span>
		{:else if loadError}
			<span class="chip bad"
				>{t(
					`Could not read the database (${loadError}).`,
					`데이터베이스를 읽지 못했습니다 (${loadError}).`
				)}</span
			>
		{:else}
			<span class="chip">{t('connecting…', '연결 중…')}</span>
		{/if}
	</div>

	{#if tree}
		<div class="overview">
			<div class="ov sites-ov">
				<div class="ovh">{t('Collected by our team', '우리 팀이 수집한 데이터')}</div>
				<div class="big">
					<b><RollingNumber value={tree.totals.products} /></b>
					{t('products', '개 상품')}
				</div>
				<p class="big-s">
					{#if i18n.lang === 'ko'}
						<b>{elapsed(tree.collection.since)}</b> 동안 {sitesTotal}개 쇼핑몰에서 우리 팀이 수집한
						실제 상품
					{:else}
						Real listings our team collected from {sitesTotal} shops in
						<b>{elapsed(tree.collection.since)}</b>
					{/if}
					{#if rate}<span class="rate"
							>{t(`${fmt(rate)} products / min`, `분당 ${fmt(rate)}개`)}</span
						>{/if}
				</p>
				<div class="spark" aria-hidden="true">
					{#each tree.collection.buckets as b (b.t)}
						<i style:height="{Math.max(4, (b.n / maxBucket) * 100)}%" title={fmt(b.n)}></i>
					{/each}
				</div>
				<div class="spark-l">
					<span>{tree.collection.since ? hhmm(tree.collection.since) : ''}</span><span
						>{t('now', '현재')}</span
					>
				</div>
				<div class="ovh sub">{t('By site', '사이트별')}</div>
				{#each tree.sites as st (st.code)}
					<div class="bar-row">
						<span class="bar-l"
							><span class="flag">{flag(st.country)}</span><b>{st.code}</b>
							<span class="cur">{st.currency}</span></span
						>
						<span class="bar"
							><i style:width="{Math.max(1.5, (st.count / tree.sites[0].count) * 100)}%"></i></span
						>
						<span class="bar-n">{fmt(st.count)}</span>
					</div>
				{/each}
			</div>
			<div class="ov recent-ov">
				<div class="ovh">{t('Live from the index', '인덱스 실시간 샘플')}</div>
				<p class="ovp">
					{t(
						"A random sample of real listings from every source in the database, refreshed every few minutes. Each card is one row the agent can search: photo, price in the shop's own currency, key dimensions read from the product name, and the source site. Hover to pause, click to open the listing.",
						'DB에 있는 모든 출처의 실제 상품을 무작위로 뽑아 몇 분마다 새로 보여줍니다. 카드 하나가 에이전트가 검색할 수 있는 한 줄입니다: 사진, 쇼핑몰 현지 통화 가격, 상품명에서 읽은 주요 치수, 출처 사이트. 마우스를 올리면 멈추고, 클릭하면 상품 페이지가 열립니다.'
					)}
				</p>
				<ProductMarquee embedded />
			</div>
		</div>
	{/if}

	<section class="console">
		<div class="console-h">
			<h3>{t('Ask the index', '인덱스에 물어보기')}</h3>
			<p>
				{t(
					'Type what an agent would ask. The engine walks the live index below, step by step.',
					'에이전트가 물어볼 법한 내용을 입력하세요. 엔진이 아래 실시간 인덱스를 한 단계씩 탐색합니다.'
				)}
			</p>
		</div>
		<form class="ask" class:busy={running} onsubmit={submit}>
			<svg class="ask-ic" viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="11" cy="11" r="7" />
				<path d="m20 20-4-4" />
			</svg>
			<div class="field">
				<input
					bind:value={q}
					aria-label={t('Search the index', '인덱스 검색')}
					disabled={running}
				/>
				{#if !q && !running}<GhostSuggest size={15} onpick={askPreset} />{/if}
			</div>
			<button class="btn btn-primary" disabled={running || !q.trim() || !tree}
				>{running ? t('Running…', '실행 중…') : t('Run', '실행')}</button
			>
		</form>
		<div class="hint">
			<span class="hint-l">{t('Try', '예시')}</span>
			{#each HINTS as h (h)}<button type="button" onclick={() => ask(h)} disabled={running}
					>{h}</button
				>{/each}
			{#if relayed}<span class="relay"
					><i></i>{t('also running in the token race above', '위 토큰 레이스에서도 실행 중')}</span
				>{/if}
		</div>
	</section>

	<div class="grid">
		<div class="term">
			<div class="term-head">
				<span>catalog.db</span>
				<span class="state"
					>{running ? t('scanning', '스캔 중') : res ? t('done', '완료') : t('idle', '대기')}</span
				>
			</div>
			<div class="term-body" bind:this={treeEl}>
				{#if tree}
					<div class="row folder" data-row="root">
						<span class="nm">catalog.db/</span><span class="cm"
							># {t(
								`${sitesTotal} sites · ${fmt(tree.totals.products)} products · prices also in ₩`,
								`사이트 ${sitesTotal}곳 · 상품 ${fmt(tree.totals.products)}개 · 원화 환산가 포함`
							)}</span
						>
					</div>
					<div class="row folder d1"><span class="nm">sites/</span></div>
					{#each siteList as st (st.code)}
						{@const ss = siteStatus[st.code]}
						{@const isOpen = open[`site:${st.code}`]}
						<div class="node" animate:flip={{ duration: calm ? 0 : 560 }}>
							<button
								type="button"
								class="row folder d2 {ss ?? ''}"
								class:cur={cursor === `site:${st.code}`}
								data-row={`site:${st.code}`}
								onclick={() => (open[`site:${st.code}`] = !isOpen)}
							>
								<span class="caret">{isOpen ? '▾' : '▸'}</span><span class="nm site"
									>{st.code}/</span
								><span class="cm"
									># {ss === 'match'
										? t(
												`${fmt(siteMatches[st.code] ?? 0)} match`,
												`${fmt(siteMatches[st.code] ?? 0)}건 일치`
											)
										: ss === 'skip'
											? t('no match', '일치 없음')
											: `${st.name} · ${st.currency} · ${fmt(st.count)}`}</span
								>
							</button>
							{#if isOpen}
								<div class="kids" transition:slide={{ duration: calm ? 0 : FOLD }}>
									{#each siteRows[st.code] ?? st.samples as p (p.id)}
										{@render prow(p, 'd3', siteRows[st.code] ? 'match' : undefined)}
									{/each}
								</div>
							{/if}
						</div>
					{/each}
					<div class="row folder d1">
						<span class="nm">categories/</span><span class="cm"
							># {t(
								`top ${tree.categories.length} of ${tree.totals.categories}`,
								`${tree.totals.categories}개 중 상위 ${tree.categories.length}개`
							)}</span
						>
					</div>
					{#each catList as c (c.name)}
						{@const st = catStatus[c.name]}
						{@const isOpen = open[c.name]}
						<div class="node" animate:flip={{ duration: calm ? 0 : 560 }}>
							<button
								type="button"
								class="row folder d2 {st ?? ''}"
								class:cur={cursor === `cat:${c.name}`}
								data-row={`cat:${c.name}`}
								onclick={() => (open[c.name] = !isOpen)}
							>
								<span class="caret">{isOpen ? '▾' : '▸'}</span><span class="nm">{c.name}/</span
								><span class="cm"
									># {st === 'match'
										? t(
												`${fmt(catMatches[c.name] ?? 0)} match`,
												`${fmt(catMatches[c.name] ?? 0)}건 일치`
											)
										: st === 'skip'
											? t('skipped by index', '인덱스에서 제외')
											: fmt(c.count)}</span
								>
							</button>
							{#if isOpen}
								<div class="kids" transition:slide={{ duration: calm ? 0 : FOLD }}>
									{#if shownRows[c.name]}
										{#each shownRows[c.name] as p (p.id)}
											{@render prow(p, 'd3', rowStatus[p.id], p.reason)}
										{/each}
									{:else}
										{#each c.products as p (p.id)}
											{@render prow(p, 'd3')}
										{/each}
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				{:else}
					<div class="row">
						<span class="cm">{loadError || t('loading…', '불러오는 중…')}</span>
					</div>
				{/if}
			</div>
			<div class="term-foot">
				{#if res}
					{t(
						`real query ${res.realMs} ms · replay ${(replayMs / 1000).toFixed(1)} s · ${evaluated} rows evaluated`,
						`실제 쿼리 ${res.realMs}ms · 재생 ${(replayMs / 1000).toFixed(1)}초 · ${evaluated}개 항목 평가`
					)}
				{:else}
					{t(
						'Click a folder to open it, a row for details. Run a search to watch the engine walk the index.',
						'폴더를 누르면 열리고, 상품 줄을 누르면 상세가 보입니다. 검색을 실행하면 엔진이 인덱스를 탐색하는 과정을 볼 수 있습니다.'
					)}
				{/if}
			</div>
		</div>

		<div class="side">
			<div class="ptree" class:failed>
				<div class="ptrack"><i style:height="{progress * 100}%"></i></div>
				<ol>
					{#each STEPS as st, i (st.key)}
						{@const s = steps[st.key]}
						<li class={s.s} class:now={i === current}>
							<span class="pdot">{s.s === 'done' ? '✓' : s.s === 'bad' ? '✕' : ''}</span>
							<span class="pl">{st.label()}</span>
							{#if s.s !== 'idle'}<span class="pv">{vv(s.v)}</span>{/if}
						</li>
					{/each}
				</ol>
				<div class="pfoot">
					{#if running}
						{t(
							`Step ${Math.max(current, 0) + 1} of ${STEPS.length}`,
							`${STEPS.length}단계 중 ${Math.max(current, 0) + 1}단계`
						)}
					{:else if res}
						{res.verify.pass
							? t('Done · verified and paid', '완료 · 검증 및 결제됨')
							: t('Done · payment refused', '완료 · 결제 거절')}
					{:else}
						{t('Waiting for a search', '검색 대기 중')}
					{/if}
				</div>
			</div>

			<div class="feed" bind:this={feedEl}>
				{#if !feed.length}
					<p class="empty">
						{t(
							"Each step's details stream in here as the search runs: the request payload, parsed terms, sites and categories hit, filters, delivered rows, verification and payment.",
							'검색이 진행되는 동안 단계별 상세가 여기에 표시됩니다: 요청 내용, 해석된 검색어, 일치한 사이트와 카테고리, 필터, 전달된 결과, 검증과 결제.'
						)}
					</p>
				{/if}
				{#each feed as k (k)}
					{@const st = STEPS.find((x) => x.key === k)!}
					{@const s = steps[k]}
					{@const isOpen = expanded.includes(k)}
					<section class="fcard {s.s}" class:open={isOpen}>
						<button
							type="button"
							class="fhead"
							onclick={() =>
								(expanded = isOpen ? expanded.filter((x) => x !== k) : [...expanded, k])}
						>
							<span class="fdot">{s.s === 'done' ? '✓' : s.s === 'bad' ? '✕' : '•'}</span>
							<b>{st.label()}</b>
							<span class="fsum">{vv(s.v)}</span>
						</button>
						{#if isOpen}
							<div class="fbody" transition:slide={{ duration: 260 }}>
								{#if k === 'request'}
									<pre class="code">{JSON.stringify(
											{
												tool: 'search_offers',
												q,
												client: 'demo-agent',
												ts: new Date().toISOString()
											},
											null,
											2
										)}</pre>
								{:else if k === 'parse' && live}
									<div class="chips-s">
										{#each live.terms as term (term)}<span class="tchip">{term}</span>{/each}
									</div>
									<p class="fnote">
										{t(
											'Keyword split, no LLM call: 0 tokens.',
											'키워드 분리만, LLM 호출 없음: 토큰 0.'
										)}
									</p>
								{:else if k === 'index' && live}
									<div class="kv-h">{t('Sites', '사이트')}</div>
									{#each live.sites as x (x.code)}
										<div class="kv" class:dim={siteStatus[x.code] === 'skip'}>
											<span>{x.code}</span>
											<span class="mono"
												>{siteStatus[x.code] ? fmt(siteMatches[x.code] ?? 0) : '…'}</span
											>
										</div>
									{/each}
									<div class="kv-h">{t('Categories', '카테고리')}</div>
									{#each live.categories
										.filter((c) => catStatus[c.name] === 'match')
										.slice(0, 6) as c (c.name)}
										<div class="kv">
											<span>{c.name}</span><span class="mono">{fmt(c.matches)}</span>
										</div>
									{/each}
								{:else if k === 'filter' && live}
									<ul class="rules">
										<li><code>active = true</code></li>
										<li>
											<code>name ILIKE any(</code>{live.terms.join(', ')}<code>)</code>
										</li>
										<li><code>ORDER BY price × fx → KRW</code></li>
									</ul>
									<div class="kd">
										<span class="k">{t('kept', '통과')} <b>{kept}</b></span>
										<span class="d">{t('dropped', '제외')} <b>{dropped}</b></span>
										<span>{t('total matches', '전체 일치')} <b>{fmt(live.total)}</b></span>
									</div>
								{:else if k === 'deliver' && live}
									{#each live.top.slice(0, 3) as r, i (r.id)}
										<a class="drow" href={r.url} target="_blank" rel="noreferrer">
											<span class="n">#{i + 1}</span>
											<span class="name">{r.name}</span>
											<span class="price"
												>{money(
													r.price,
													r.currency
												)}{#if r.currency !== 'KRW' && r.price_krw != null}
													<small>≈₩{fmt(r.price_krw)}</small>{/if}</span
											>
											<span class="meta"
												><span class="sb">{r.site}</span> {t('seen', '확인')} {r.seen}</span
											>
										</a>
									{/each}
									<p class="fnote mono">data_hash {live.dataHash}</p>
								{:else if k === 'verify' && live}
									{#each live.verify.checks as c, i (c.id)}
										<div class="vrow">
											<span class="n">#{i + 1}</span>
											<span class={c.listed ? 'okc' : 'bad'}
												>{ok(c.listed)} {t('price listed', '가격 표시')}</span
											>
											<span class={c.termInName ? 'okc' : 'bad'}
												>{ok(c.termInName)} {t('term in name', '상품명에 검색어')}</span
											>
										</div>
									{/each}
									<p class="fnote">
										{t(
											'Code rules, same input → same answer, 0 tokens.',
											'코드 규칙: 같은 입력이면 같은 결과, 토큰 0.'
										)}
									</p>
								{:else if k === 'pay' && live}
									{#if live.verify.pass}
										<div class="payline">
											<b>0.02 USDC</b> → Agent Catalog · {t(
												'x402 on Base Sepolia',
												'Base Sepolia의 x402'
											)}
										</div>
										<p class="fnote">
											{t(
												'Simulated here; the search dock settles real testnet USDC.',
												'여기서는 시뮬레이션입니다. 검색창에서는 실제 테스트넷 USDC로 결제됩니다.'
											)}
										</p>
									{:else}
										<div class="payline bad">
											{t('Payment refused · 0 USDC', '결제 거절 · 0 USDC')}
										</div>
										<p class="fnote">
											{t(
												'The agent re-searches with new conditions and pays nothing.',
												'에이전트는 조건을 바꿔 다시 검색하고 비용을 내지 않습니다.'
											)}
										</p>
									{/if}
								{/if}
							</div>
						{/if}
					</section>
				{/each}
			</div>
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
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 7px 7px 7px 16px;
		border-radius: 999px;
		background: rgba(6, 10, 24, 0.85);
		border: 1px solid var(--line-strong);
		max-width: 720px;
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}
	.ask:focus-within {
		border-color: var(--brand-line);
		box-shadow:
			0 0 0 4px rgba(61, 107, 255, 0.14),
			0 12px 40px -16px rgba(31, 75, 255, 0.55);
	}
	.ask.busy {
		border-color: rgba(93, 240, 168, 0.45);
	}
	.ask-ic {
		width: 18px;
		height: 18px;
		flex: none;
		fill: none;
		stroke: var(--muted-2);
		stroke-width: 2;
		stroke-linecap: round;
		transition: stroke 0.2s;
	}
	.ask:focus-within .ask-ic {
		stroke: var(--brand-2);
	}
	.field {
		position: relative;
		flex: 1;
		min-width: 0;
		display: flex;
		align-self: stretch;
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
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-size: 13px;
		color: var(--muted-2);
	}
	.hint-l {
		margin-right: 2px;
	}
	.hint button {
		font: 12.5px var(--mono);
		color: var(--ink);
		padding: 5px 12px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--glass);
		cursor: pointer;
		transition:
			border-color 0.15s,
			background 0.15s,
			color 0.15s;
	}
	.hint button:hover:not(:disabled) {
		border-color: var(--brand-line);
		background: rgba(31, 75, 255, 0.16);
		color: #fff;
	}
	.hint button:disabled {
		opacity: 0.45;
		cursor: default;
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
		animation: scanpulse 0.9s ease-in-out infinite;
	}
	/* a folder that just matched flashes once; matched rows slide in */
	.folder.match {
		animation: hit 0.7s ease-out;
	}
	.row.prow.match {
		animation: rowin 0.45s ease-out;
	}
	@keyframes scanpulse {
		50% {
			background: rgba(31, 75, 255, 0.34);
		}
	}
	@keyframes hit {
		0% {
			background: rgba(255, 210, 122, 0.32);
		}
		100% {
			background: transparent;
		}
	}
	@keyframes rowin {
		0% {
			background: rgba(255, 210, 122, 0.22);
			transform: translateX(-6px);
		}
		100% {
			background: transparent;
			transform: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.row.cur,
		.folder.match,
		.row.prow.match {
			animation: none;
		}
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
	.pipe b {
		display: block;
		font-size: 14px;
		font-weight: 600;
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
		display: flex;
		gap: 6px;
		align-items: center;
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
	/* overview: per-site breakdown and recently added */
	.overview {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.6fr);
		gap: 14px;
	}
	.ov {
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		background: var(--glass);
		padding: 14px 16px;
		min-width: 0;
	}
	.ovp {
		font-size: 13px;
		line-height: 1.55;
		color: var(--muted);
		margin: -2px 0 10px;
	}
	.recent-ov {
		min-width: 0;
	}
	.ovh {
		font: 600 11px var(--mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-2);
		margin-bottom: 10px;
	}
	.bar-row {
		display: grid;
		grid-template-columns: 150px minmax(0, 1fr) 64px;
		gap: 10px;
		align-items: center;
		font-size: 12.5px;
		padding: 4px 0;
	}
	.bar-l b {
		font: 600 12.5px var(--mono);
		color: var(--cyan);
	}
	.bar-l .cur {
		font: 11px var(--mono);
		color: var(--muted-2);
	}
	.bar {
		height: 6px;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.06);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		border-radius: 3px;
		background: linear-gradient(90deg, var(--brand), var(--brand-2));
	}
	.bar-n {
		font: 12px var(--mono);
		text-align: right;
		color: var(--muted);
	}
	.sb {
		font: 500 10.5px var(--mono);
		color: var(--cyan);
		border: 1px solid rgba(92, 198, 255, 0.35);
		border-radius: 4px;
		padding: 0 5px;
		line-height: 1.6;
		white-space: nowrap;
		flex: none;
	}
	.cv {
		font: 11px var(--mono);
		color: var(--muted-2);
		white-space: nowrap;
		flex: none;
	}
	/* product rows inside the tree */
	.prow {
		align-items: center;
	}
	.thumb {
		flex: none;
		width: 20px;
		height: 20px;
		border-radius: 4px;
		object-fit: contain;
		background: #fff;
	}
	.thumb.none {
		background: rgba(255, 255, 255, 0.06);
	}
	.pr {
		flex: none;
		color: var(--accent);
	}
	.off {
		flex: none;
		font-size: 11px;
		color: var(--red);
	}
	.prow .cm {
		flex: 1 1 0;
	}
	.detail {
		padding-top: 2px;
		padding-bottom: 8px;
		padding-right: 16px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		color: var(--muted);
		white-space: normal;
		line-height: 1.6;
	}
	.detail a {
		color: var(--brand-2);
	}
	.dl {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.cat {
		font: 11px var(--font);
		padding: 0 8px;
		border-radius: 999px;
		background: rgba(61, 107, 255, 0.14);
		color: var(--ink);
		line-height: 1.8;
	}
	.price small {
		display: block;
		font: 11px var(--mono);
		color: var(--muted-2);
		text-align: right;
	}
	.fx {
		font: 11px var(--mono);
		color: var(--muted-2);
	}
	@media (max-width: 860px) {
		.overview {
			grid-template-columns: 1fr;
		}
		.bar-row {
			grid-template-columns: 110px minmax(0, 1fr) 56px;
		}
	}
	@media (max-width: 560px) {
		.tile {
			flex-basis: 116px;
		}
		.bar-l .cur {
			display: none;
		}
		.prow .sb,
		.prow .cv {
			display: none;
		}
	}
	/* search console: its own block, set apart from the overview */
	.console {
		margin-top: 22px;
		padding: 30px 24px 24px;
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		background:
			radial-gradient(120% 140% at 50% 0%, rgba(31, 75, 255, 0.14), transparent 60%), var(--glass);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 16px;
	}
	.relay {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-left: 4px;
		color: var(--accent);
		font-size: 12.5px;
	}
	.relay i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		animation: blink 1.4s infinite;
	}
	.console-h h3 {
		font: 700 22px var(--font);
		color: var(--ink);
		letter-spacing: -0.01em;
	}
	.console-h p {
		margin-top: 6px;
		color: var(--muted);
		font-size: 14.5px;
	}
	/* overview headline */
	.sites-ov {
		display: flex;
		flex-direction: column;
	}
	.big {
		font-size: 15px;
		color: var(--muted);
	}
	.big b {
		font: 800 clamp(30px, 3.6vw, 40px) var(--font);
		color: var(--ink);
		margin-right: 6px;
	}
	.big-s b {
		color: var(--ink);
	}
	.big-s .rate {
		display: inline-block;
		margin-left: 6px;
		font: 11.5px var(--mono);
		color: var(--accent);
		padding: 1px 8px;
		border-radius: 999px;
		background: rgba(93, 240, 168, 0.1);
	}
	.big-s {
		margin: 4px 0 12px;
		font-size: 13px;
		color: var(--muted);
	}
	.spark {
		display: flex;
		align-items: flex-end;
		gap: 4px;
		height: 54px;
		padding: 4px 0;
		border-bottom: 1px solid var(--line);
	}
	.spark i {
		flex: 1;
		border-radius: 3px 3px 0 0;
		background: linear-gradient(180deg, var(--brand-2), rgba(31, 75, 255, 0.35));
	}
	.spark-l {
		display: flex;
		justify-content: space-between;
		font: 10.5px var(--mono);
		color: var(--muted-2);
		margin: 4px 0 12px;
	}
	.ovh.sub {
		margin: 4px 0 6px;
	}
	.flag {
		margin-right: 6px;
	}
	/* darker terminal */
	.term {
		background: #010205;
		border-color: rgba(61, 107, 255, 0.28);
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.02),
			0 24px 60px -30px rgba(0, 0, 0, 0.9);
	}
	.term-head {
		background: #05070d;
	}
	.term-head > span:first-child::before {
		content: '● ● ●';
		letter-spacing: 2px;
		margin-right: 10px;
		color: #2a3142;
	}
	.term-foot {
		background: #05070d;
	}
	/* compact progress tree */
	.side {
		position: sticky;
		top: 12px;
	}
	.ptree {
		position: relative;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		background: var(--glass);
		padding: 14px 16px 10px 16px;
	}
	.ptree ol {
		list-style: none;
		position: relative;
	}
	.ptrack {
		position: absolute;
		left: 26px;
		top: 24px;
		bottom: 44px;
		width: 2px;
		background: var(--line-strong);
		border-radius: 2px;
	}
	.ptrack i {
		display: block;
		width: 100%;
		border-radius: 2px;
		background: linear-gradient(180deg, var(--brand), var(--accent));
		transition: height 0.5s ease;
	}
	.failed .ptrack i {
		background: linear-gradient(180deg, var(--brand), var(--red));
	}
	.ptree li {
		display: grid;
		grid-template-columns: 22px auto minmax(0, 1fr);
		align-items: center;
		gap: 10px;
		padding: 4px 0;
		font-size: 13.5px;
		color: var(--muted-2);
		position: relative;
	}
	.pdot {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font: 700 11px var(--mono);
		background: #050912;
		border: 2px solid var(--line-strong);
		position: relative;
		z-index: 1;
	}
	.ptree li.done {
		color: var(--ink);
	}
	.ptree li.done .pdot {
		background: var(--brand);
		border-color: var(--brand);
		color: #fff;
	}
	.ptree li.bad .pdot {
		background: var(--red);
		border-color: var(--red);
		color: #fff;
	}
	.ptree li.now {
		color: var(--ink);
		font-weight: 600;
	}
	.ptree li.now .pdot {
		border-color: var(--accent);
		box-shadow: 0 0 0 4px rgba(93, 240, 168, 0.18);
		animation: pulse 1.2s infinite;
	}
	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 7px rgba(93, 240, 168, 0.05);
		}
	}
	.pv {
		font: 11.5px var(--mono);
		color: var(--muted-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 400;
	}
	.pfoot {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--line);
		font: 11.5px var(--mono);
		color: var(--muted-2);
	}
	/* live detail feed */
	.feed {
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		background: #03050b;
		padding: 10px;
		height: 380px;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 6px;
		scroll-behavior: smooth;
	}
	.fcard {
		border: 1px solid var(--line);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.02);
		flex: none;
	}
	.fcard.open {
		border-color: var(--brand-line);
		background: rgba(31, 75, 255, 0.07);
	}
	.fhead {
		display: grid;
		grid-template-columns: 18px auto minmax(0, 1fr);
		gap: 8px;
		align-items: center;
		width: 100%;
		padding: 8px 12px;
		background: none;
		border: 0;
		color: var(--ink);
		font: 13px var(--font);
		text-align: left;
		cursor: pointer;
	}
	.fdot {
		font: 700 11px var(--mono);
		color: var(--brand-2);
	}
	.fcard.done .fdot {
		color: var(--accent);
	}
	.fcard.bad .fdot {
		color: var(--red);
	}
	.fsum {
		font: 11.5px var(--mono);
		color: var(--muted-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fbody {
		padding: 2px 12px 12px 38px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
	}
	.code {
		font: 11.5px/1.6 var(--mono);
		color: var(--cyan);
		background: #010205;
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 8px 10px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.chips-s {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tchip {
		font: 12px var(--mono);
		padding: 2px 10px;
		border-radius: 999px;
		background: rgba(93, 240, 168, 0.12);
		color: var(--accent);
	}
	.fnote {
		font-size: 11.5px;
		color: var(--muted-2);
		overflow-wrap: anywhere;
	}
	.kv-h {
		font: 600 10.5px var(--mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-2);
		margin-top: 4px;
	}
	.kv {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		font-size: 12.5px;
	}
	.kv.dim {
		opacity: 0.4;
	}
	.rules {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 12.5px;
		color: var(--muted);
	}
	.rules code {
		font: 12px var(--mono);
		color: var(--cyan);
	}
	.kd {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		font: 12px var(--mono);
		color: var(--muted);
	}
	.kd .k b {
		color: var(--accent);
	}
	.kd .d b {
		color: var(--red);
	}
	.drow {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 2px 10px;
		padding: 8px 10px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: rgba(0, 0, 0, 0.3);
	}
	.drow:hover {
		border-color: var(--brand-line);
	}
	.drow .n {
		font: 700 12px var(--mono);
		color: var(--brand-2);
		grid-row: span 2;
		align-self: center;
	}
	.drow .name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.drow .price {
		font: 600 13px var(--mono);
		color: var(--accent);
		text-align: right;
	}
	.drow .price small {
		display: block;
		font: 11px var(--mono);
		color: var(--muted-2);
	}
	.drow .meta {
		grid-column: 2 / 4;
		display: flex;
		gap: 6px;
		align-items: center;
		font: 11px var(--mono);
		color: var(--muted-2);
	}
	.vrow {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		font: 12px var(--mono);
	}
	.vrow .n {
		color: var(--brand-2);
	}
	.okc {
		color: var(--accent);
	}
	.vrow .bad {
		color: var(--red);
	}
	.payline {
		font-size: 14px;
		color: var(--ink);
	}
	.payline b {
		color: var(--amber);
		font-family: var(--mono);
	}
	.payline.bad {
		color: var(--red);
	}
	@media (max-width: 1000px) {
		.side {
			position: static;
		}
		.feed {
			height: 340px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ptree li.now .pdot {
			animation: none;
		}
		.ptrack i {
			transition: none;
		}
	}
</style>
