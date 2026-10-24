<script lang="ts">
	// Two diagrams, side by side. Before: the user's agent hops across shop sites one by one, so the
	// clock and token meter keep climbing. After: our crawlers keep reading the sources into one DB
	// ahead of time, and the user's agent asks the DB once. Timings and token counts are
	// illustrative (80,000 tokens per page, ~1,000 per catalog lookup, as in the slides above);
	// the token race below shows real runs.
	import { onMount } from 'svelte';
	import { t } from './i18n.svelte.ts';

	const fav = (d: string) => `https://www.google.com/s2/favicons?domain=${d}&sz=64`;

	// before: the open web
	const WEB = [
		{ name: 'Google', d: 'google.com' },
		{ name: 'Amazon', d: 'amazon.com' },
		{ name: 'Taobao', d: 'taobao.com' },
		{ name: 'AliExpress', d: 'aliexpress.com' },
		{ name: 'eBay', d: 'ebay.com' },
		{ name: 'Coupang', d: 'coupang.com' },
		{ name: 'Naver', d: 'naver.com' }
	];
	const WX = (i: number) => 54 + i * 82;
	const WY = 352;
	// the agent goes back and forth, comparing
	const VISITS = [0, 1, 2, 0, 3, 4, 5, 1, 6];
	const PAGE_TOKENS = 80_000;

	// after: the shops we collect from
	const SOURCES = [
		{ name: 'Amazon', d: 'amazon.com' },
		{ name: 'Uline', d: 'uline.com' },
		{ name: 'Toolstation', d: 'toolstation.com' },
		{ name: 'Hoffmann', d: 'hoffmann-group.com' },
		{ name: 'Office Depot', d: 'officedepot.co.kr' },
		{ name: '다이소', d: 'daisomall.co.kr' },
		{ name: 'DAISO JP', d: 'jp.daisonet.com' },
		{ name: '나비엠알오', d: 'navimro.com' },
		{ name: '이안과학', d: 'iaansci.co.kr' }
	];
	const SY = (i: number) => 48 + i * 43;
	const CRAWL = { x: 258, y: 236 };
	const DB = { x: 430, y: 236 };
	const AG = { x: 540, y: 112 };

	let root = $state<HTMLDivElement>();
	let calm = $state(false);

	// before state
	let bPaths = $state<SVGPathElement[]>([]);
	let bUser = $state<SVGPathElement>();
	let bDot = $state<{ x: number; y: number } | null>(null);
	let bSite = $state<number | null>(null);
	let bTokens = $state(0);
	let bTime = $state(0);
	let bDone = $state(false);

	// after state
	let aUser = $state<SVGPathElement>();
	let aLink = $state<SVGPathElement>();
	let aDot = $state<{ x: number; y: number } | null>(null);
	let aHit = $state(false);
	let aTokens = $state(0);
	let aTime = $state(0);
	let aDone = $state(false);

	let alive = true;
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
	const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

	function travel(
		path: SVGPathElement | undefined,
		ms: number,
		set: (p: { x: number; y: number }) => void,
		back = false
	) {
		return new Promise<void>((done) => {
			if (!path) return done();
			const len = path.getTotalLength();
			const start = performance.now();
			const step = (now: number) => {
				if (!alive) return done();
				const k = Math.min(1, (now - start) / ms);
				const p = path.getPointAtLength((back ? 1 - ease(k) : ease(k)) * len);
				set({ x: p.x, y: p.y });
				if (k < 1) requestAnimationFrame(step);
				else done();
			};
			requestAnimationFrame(step);
		});
	}

	function ramp(from: number, to: number, ms: number, set: (v: number) => void) {
		return new Promise<void>((done) => {
			const start = performance.now();
			const step = (now: number) => {
				if (!alive) return done();
				const k = Math.min(1, (now - start) / ms);
				set(Math.round(from + (to - from) * k));
				if (k < 1) requestAnimationFrame(step);
				else done();
			};
			requestAnimationFrame(step);
		});
	}

	// a clock that runs while fn runs
	async function timed(set: (s: number) => void, fn: () => Promise<void>) {
		const t0 = performance.now();
		let on = true;
		const tick = () => {
			if (!on || !alive) return;
			set((performance.now() - t0) / 1000);
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
		await fn();
		on = false;
		set((performance.now() - t0) / 1000);
	}

	async function loopBefore() {
		while (alive) {
			bTokens = 0;
			bTime = 0;
			bDone = false;
			bSite = null;
			await timed(
				(s) => (bTime = s),
				async () => {
					const put = (p: { x: number; y: number }) => (bDot = p);
					await travel(bUser, 450, put);
					for (const i of VISITS) {
						if (!alive) return;
						await travel(bPaths[i], 700, put);
						bSite = i;
						await ramp(bTokens, bTokens + PAGE_TOKENS, 650, (v) => (bTokens = v));
						bSite = null;
						await travel(bPaths[i], 600, put, true);
					}
				}
			);
			bDot = null;
			bDone = true;
			await sleep(3200);
		}
	}

	async function loopAfter() {
		await sleep(900);
		while (alive) {
			aTokens = 0;
			aTime = 0;
			aDone = false;
			await timed(
				(s) => (aTime = s),
				async () => {
					const put = (p: { x: number; y: number }) => (aDot = p);
					await travel(aUser, 380, put);
					await travel(aLink, 360, put);
					aHit = true;
					await ramp(0, 1_000, 220, (v) => (aTokens = v));
					aHit = false;
					await travel(aLink, 360, put, true);
				}
			);
			aDot = null;
			aDone = true;
			await sleep(4200);
		}
	}

	onMount(() => {
		calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (calm) {
			bTokens = VISITS.length * PAGE_TOKENS;
			bTime = 13;
			bDone = true;
			aTokens = 1_000;
			aTime = 1.1;
			aDone = true;
			return;
		}
		// start once the slide scrolls into view
		const io = new IntersectionObserver(
			(en) => {
				if (en.some((e) => e.isIntersecting)) {
					io.disconnect();
					loopBefore();
					loopAfter();
				}
			},
			{ threshold: 0.25 }
		);
		if (root) io.observe(root);
		return () => {
			alive = false;
			io.disconnect();
		};
	});

	const fmt = (n: number) => n.toLocaleString('en-US');
</script>

<div class="flow" bind:this={root}>
	<!-- BEFORE -->
	<article class="card before">
		<header class="ch">
			<div>
				<span class="tag">{t('Today', '지금은')}</span>
				<h3>
					{t('Your agent browses every shop itself', '에이전트가 모든 쇼핑몰을 직접 돌아다닙니다')}
				</h3>
			</div>
			<div class="stats">
				<span class="stat"><i>{t('time', '시간')}</i><b>{bTime.toFixed(1)}s</b></span>
				<span class="stat"><i>{t('tokens', '토큰')}</i><b>{fmt(bTokens)}</b></span>
			</div>
		</header>
		<svg
			viewBox="0 0 600 420"
			class="dia"
			role="img"
			aria-label={t(
				'Agent visiting many websites one by one',
				'에이전트가 여러 웹사이트를 하나씩 방문하는 모습'
			)}
		>
			<!-- user -> agent -->
			<g class="node user">
				<rect x="262" y="14" width="76" height="30" rx="15" />
				<text x="300" y="34">{t('User', '사용자')}</text>
			</g>
			<path bind:this={bUser} class="edge" d="M300 44 L300 92" />
			<path class="arrow" d="M294 86 L300 94 L306 86" />
			<g class="node agent" class:done={bDone}>
				<circle cx="300" cy="128" r="32" />
				<text x="300" y="133">{t('Agent', '에이전트')}</text>
			</g>

			<!-- agent -> every site -->
			{#each WEB as s, i (s.d)}
				<path
					bind:this={bPaths[i]}
					class="edge web"
					class:on={bSite === i}
					d={`M300 160 C 300 250, ${WX(i)} 250, ${WX(i)} ${WY - 24}`}
				/>
			{/each}
			{#each WEB as s, i (s.d)}
				<g class="site" class:on={bSite === i}>
					<circle cx={WX(i)} cy={WY} r="23" />
					<image href={fav(s.d)} x={WX(i) - 11} y={WY - 11} width="22" height="22" />
					<text x={WX(i)} y={WY + 42}>{s.name}</text>
					{#if bSite === i}
						<text class="reading" x={WX(i)} y={WY - 34}
							>{t('reading page…', '페이지 읽는 중…')}</text
						>
					{/if}
				</g>
			{/each}
			<text class="etc" x="300" y="414"
				>{t(
					'… and every other site the agent can think of',
					'… 그 밖에 에이전트가 떠올릴 수 있는 모든 사이트'
				)}</text
			>

			{#if bDot}<circle class="dot web" cx={bDot.x} cy={bDot.y} r="6" />{/if}
		</svg>
		<footer class="cf">
			<span class="pt bad"
				><b>{t('Slow', '느림')}</b>
				{t('one site at a time, back and forth', '사이트를 하나씩, 왔다 갔다')}</span
			>
			<span class="pt bad"
				><b>{t('Token-heavy', '토큰 과다')}</b>
				{t('~80,000 tokens of HTML per page', '페이지마다 HTML 약 80,000토큰')}</span
			>
		</footer>
	</article>

	<!-- AFTER -->
	<article class="card after">
		<header class="ch">
			<div>
				<span class="tag">{t('With Agent Catalog', 'Agent Catalog를 쓰면')}</span>
				<h3>
					{t('Your agent looks it up in one call', '에이전트가 한 번의 호출로 바로 찾습니다')}
				</h3>
			</div>
			<div class="stats">
				<span class="stat"><i>{t('time', '시간')}</i><b>{aTime.toFixed(1)}s</b></span>
				<span class="stat"><i>{t('tokens', '토큰')}</i><b>{fmt(aTokens)}</b></span>
			</div>
		</header>
		<svg
			viewBox="0 0 600 420"
			class="dia"
			role="img"
			aria-label={t(
				'Crawlers fill a database; the agent queries it once',
				'크롤러가 DB를 채우고, 에이전트는 한 번만 조회합니다'
			)}
		>
			<defs>
				<linearGradient id="fc-db" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stop-color="#3d6bff" />
					<stop offset="1" stop-color="#1f4bff" />
				</linearGradient>
			</defs>

			<!-- source rail -->
			<rect class="rail" x="12" y="18" width="156" height="392" rx="16" />
			{#each SOURCES as s, i (s.d)}
				<path
					id={`fc-src-${i}`}
					class="edge src"
					d={`M168 ${SY(i)} C 205 ${SY(i)}, 200 ${CRAWL.y}, ${CRAWL.x - 58} ${CRAWL.y}`}
				/>
				<image href={fav(s.d)} x="26" y={SY(i) - 9} width="18" height="18" />
				<text class="src-n" x="52" y={SY(i) + 5}>{s.name}</text>
			{/each}

			<!-- crawler -> DB -->
			<path
				id="fc-ingest"
				class="edge src"
				d={`M${CRAWL.x + 58} ${CRAWL.y} L${DB.x - 40} ${DB.y}`}
			/>
			<g class="node crawler">
				<rect x={CRAWL.x - 58} y={CRAWL.y - 30} width="116" height="60" rx="12" />
				<text x={CRAWL.x} y={CRAWL.y - 3}>{t('Bot & agent', '수집 에이전트')}</text>
				<text class="sub" x={CRAWL.x} y={CRAWL.y + 15}
					>{t('scrape · normalize', '수집 · 정규화')}</text
				>
			</g>
			<g class="db" class:hit={aHit}>
				<path d={`M${DB.x - 40} ${DB.y - 26} v52 a40 11 0 0 0 80 0 v-52`} fill="url(#fc-db)" />
				<ellipse cx={DB.x} cy={DB.y - 26} rx="40" ry="11" class="lid" />
				<text x={DB.x} y={DB.y + 10}>DB</text>
				<text class="db-l" x={DB.x} y={DB.y + 60}>{t('always fresh', '항상 최신 상태')}</text>
			</g>

			<!-- user -> agent, agent <-> DB -->
			<g class="node user">
				<rect x={AG.x - 38} y="14" width="76" height="30" rx="15" />
				<text x={AG.x} y="34">{t('User', '사용자')}</text>
			</g>
			<path bind:this={aUser} class="edge" d={`M${AG.x} 44 L${AG.x} ${AG.y - 34}`} />
			<path
				class="arrow"
				d={`M${AG.x - 6} ${AG.y - 40} L${AG.x} ${AG.y - 32} L${AG.x + 6} ${AG.y - 40}`}
			/>
			<path
				bind:this={aLink}
				class="edge link"
				class:on={aDot !== null}
				d={`M${AG.x} ${AG.y + 30} C ${AG.x} ${DB.y - 40}, ${DB.x + 70} ${DB.y}, ${DB.x + 42} ${DB.y}`}
			/>
			<g class="node agent" class:done={aDone}>
				<circle cx={AG.x} cy={AG.y} r="30" />
				<text x={AG.x} y={AG.y + 5}>{t('Agent', '에이전트')}</text>
			</g>

			<!-- data streaming in along the solid lines, all the time -->
			{#if !calm}
				{#each SOURCES as s, i (s.d)}
					<circle class="flowdot" r="3.2">
						<animateMotion dur="2.6s" begin={`${(i * 0.29).toFixed(2)}s`} repeatCount="indefinite">
							<mpath href={`#fc-src-${i}`} />
						</animateMotion>
					</circle>
				{/each}
				{#each [0, 0.65, 1.3] as b (b)}
					<circle class="flowdot" r="3.2">
						<animateMotion dur="1.95s" begin={`${b}s`} repeatCount="indefinite">
							<mpath href="#fc-ingest" />
						</animateMotion>
					</circle>
				{/each}
			{/if}
			{#if aDot}<circle class="dot cat" cx={aDot.x} cy={aDot.y} r="6" />{/if}
		</svg>
		<footer class="cf">
			<span class="pt good"
				><b>{t('Faster', '더 빠르게')}</b>
				{t('the shops are read ahead of time', '쇼핑몰은 미리 읽어둡니다')}</span
			>
			<span class="pt good"
				><b>{t('Fewer tokens', '더 적은 토큰')}</b>
				{t('~1,000 tokens of clean rows', '정리된 데이터 약 1,000토큰')}</span
			>
		</footer>
	</article>
	<p class="note">
		{t(
			'Illustrative timing. The token race below runs both for real.',
			'시간은 예시입니다. 아래 토큰 레이스에서 두 방식을 실제로 돌려볼 수 있습니다.'
		)}
	</p>
</div>

<style>
	.flow {
		max-width: 1240px;
		margin: 0 auto;
		padding: 0 20px;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px;
	}
	.card {
		border-radius: var(--radius-lg);
		border: 1px solid var(--line);
		background: var(--glass);
		padding: 22px 22px 18px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.card.before {
		border-color: rgba(255, 138, 92, 0.28);
		background:
			radial-gradient(120% 90% at 50% 100%, rgba(255, 138, 92, 0.08), transparent 60%), var(--glass);
	}
	.card.after {
		border-color: var(--brand-line);
		background:
			radial-gradient(120% 90% at 50% 100%, rgba(31, 75, 255, 0.16), transparent 60%),
			var(--glass-2);
		box-shadow: 0 24px 60px -30px rgba(31, 75, 255, 0.8);
	}
	.ch {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		flex-wrap: wrap;
	}
	.tag {
		font: 600 11px var(--mono);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--web);
	}
	.after .tag {
		color: var(--brand-2);
	}
	h3 {
		margin-top: 4px;
		font-size: 19px;
		font-weight: 700;
		letter-spacing: -0.01em;
	}
	.stats {
		display: flex;
		gap: 8px;
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		padding: 6px 12px;
		border-radius: 10px;
		background: rgba(4, 6, 15, 0.6);
		border: 1px solid var(--line);
		min-width: 92px;
	}
	.stat i {
		font: 10px var(--mono);
		font-style: normal;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--muted-2);
	}
	.stat b {
		font: 700 18px var(--mono);
		font-variant-numeric: tabular-nums;
	}
	.before .stat b {
		color: var(--web);
	}
	.after .stat b {
		color: #8fabff;
	}

	.dia {
		width: 100%;
		height: auto;
		display: block;
		overflow: visible;
	}
	.dia text {
		font: 600 13px var(--font);
		fill: var(--ink);
		text-anchor: middle;
	}
	.edge {
		fill: none;
		stroke: rgba(154, 166, 196, 0.35);
		stroke-width: 1.6;
		transition:
			stroke 0.2s,
			stroke-width 0.2s;
	}
	.edge.web.on {
		stroke: var(--web);
		stroke-width: 2.4;
	}
	.edge.src {
		stroke: rgba(61, 107, 255, 0.55);
	}
	.edge.link {
		stroke: rgba(143, 171, 255, 0.6);
		stroke-dasharray: 5 6;
	}
	.edge.link.on {
		stroke: #8fabff;
		stroke-width: 2.4;
	}
	.arrow {
		fill: none;
		stroke: rgba(154, 166, 196, 0.6);
		stroke-width: 1.6;
	}
	.node rect,
	.node circle {
		fill: rgba(16, 24, 48, 0.95);
		stroke: var(--line-strong);
		stroke-width: 1.4;
	}
	.node.user rect {
		stroke: rgba(255, 255, 255, 0.35);
	}
	.node.agent circle {
		stroke: rgba(255, 255, 255, 0.5);
		transition:
			stroke 0.3s,
			fill 0.3s;
	}
	.before .node.agent.done circle {
		stroke: var(--web);
	}
	.after .node.agent.done circle {
		stroke: var(--brand-2);
		fill: rgba(31, 75, 255, 0.3);
	}
	.node.crawler rect {
		stroke: var(--brand-line);
	}
	.dia .sub,
	.dia .db-l {
		font: 11px var(--mono);
		fill: var(--muted);
	}
	.site circle {
		fill: #fff;
		stroke: rgba(255, 255, 255, 0.2);
		stroke-width: 2;
		transition: stroke 0.2s;
	}
	.site.on circle {
		stroke: var(--web);
		stroke-width: 3;
	}
	.site text {
		font-size: 12px;
		fill: var(--muted);
	}
	.dia .reading {
		font: 11px var(--mono);
		fill: var(--web);
	}
	.dia .etc {
		font: 12px var(--font);
		fill: var(--muted-2);
	}
	.rail {
		fill: rgba(4, 6, 15, 0.55);
		stroke: var(--line);
	}
	.dia .src-n {
		text-anchor: start;
		font-size: 12.5px;
		font-weight: 500;
		fill: #d6dcef;
	}
	.db .lid {
		fill: #6f93ff;
	}
	.db path,
	.db .lid {
		transition: filter 0.2s;
	}
	.db.hit path,
	.db.hit .lid {
		filter: drop-shadow(0 0 14px rgba(93, 140, 255, 0.95));
	}
	.dia .db text:not(.db-l) {
		font: 700 15px var(--mono);
		fill: #fff;
	}
	.flowdot {
		fill: #8fabff;
		filter: drop-shadow(0 0 4px rgba(93, 140, 255, 0.9));
	}
	.dot.web {
		fill: var(--web);
		filter: drop-shadow(0 0 6px rgba(255, 138, 92, 0.9));
	}
	.dot.cat {
		fill: #fff;
		filter: drop-shadow(0 0 8px rgba(93, 140, 255, 1));
	}

	.cf {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.pt {
		font-size: 13px;
		color: var(--muted);
		padding: 6px 12px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: rgba(4, 6, 15, 0.5);
	}
	.pt b {
		margin-right: 6px;
	}
	.pt.bad b {
		color: var(--web);
	}
	.pt.good b {
		color: #8fabff;
	}
	.note {
		grid-column: 1 / -1;
		text-align: center;
		font-size: 12.5px;
		color: var(--muted-2);
	}
	@media (max-width: 980px) {
		.flow {
			grid-template-columns: 1fr;
		}
	}
</style>
