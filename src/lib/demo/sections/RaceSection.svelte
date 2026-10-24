<script lang="ts">
	import '#lib/demo/theme.css';
	import Odometer from '#lib/demo/Odometer.svelte';
	import { demo, scrollToSection } from '#lib/demo/demo-state.svelte.ts';
	import { onMount, untrack } from 'svelte';
	import { PRESETS } from '#lib/demo/presets.ts';

	// Real race: the question goes to /api/agent-search, which runs two Claude agents (web search vs
	// Agent Catalog on the live DB) and streams their real token usage.
	type Lane = 'web' | 'catalog';
	interface Step {
		t: number;
		label: string;
		inputTokens: number;
		tone?: 'ok' | 'bad' | 'pay';
		url?: string;
	}
	interface Result {
		name: string;
		price: number | null;
		currency: string;
		site: string;
		url: string;
	}
	interface LaneState {
		input: number;
		real: number;
		est: number;
		output: number;
		calls: number;
		elapsed: number;
		cost: number;
		log: Step[];
		done: boolean;
		answer: string;
		results: Result[];
		verify: string | null;
		paymentUrl: string | null;
	}

	const empty = (): LaneState => ({
		input: 0,
		real: 0,
		est: 0,
		output: 0,
		calls: 0,
		elapsed: 0,
		cost: 0,
		log: [],
		done: false,
		answer: '',
		results: [],
		verify: null,
		paymentUrl: null
	});

	let asked = $state('');
	let freeText = $state('');
	let lanes = $state<Record<Lane, LaneState>>({ web: empty(), catalog: empty() });
	let spec = $state<{
		summary?: string;
		category?: string;
		search_terms_ko?: string[];
		search_terms_en?: string[];
		attributes?: { field: string; value: string }[];
		max_unit_price?: number | null;
		currency?: string | null;
		qty?: number | null;
		ambiguities?: string[];
	} | null>(null);
	let showTerms = $state(false);
	const terms = $derived([
		...new Set([...(spec?.search_terms_ko ?? []), ...(spec?.search_terms_en ?? [])])
	]);
	let running = $state(false);
	let finished = $state(false);
	let errorMsg = $state('');
	let replayed = $state(false);
	let abort: AbortController | null = null;
	let clock: ReturnType<typeof setInterval> | null = null;

	// What the counters show: they chase the real totals in small steps, so the odometers keep
	// rolling upward instead of jumping once per tool call.
	let shown = $state<Record<Lane, number>>({ web: 0, catalog: 0 });
	function chase() {
		for (const lane of ['web', 'catalog'] as Lane[]) {
			const target = lanes[lane].input;
			const d = target - shown[lane];
			if (d === 0) continue;
			shown[lane] = Math.abs(d) < 40 ? target : Math.round(shown[lane] + d * 0.28);
		}
	}

	// Live multiplier: climbs while the web agent keeps reading pages and the catalog agent stays small.
	const ratio = $derived(shown.catalog > 0 ? shown.web / shown.catalog : 0);
	const ratioShown = $derived(ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10);
	// 0..1 on a log scale up to 300×, drives the meter, size and glow
	const heat = $derived(ratio > 1 ? Math.min(1, Math.log10(ratio) / Math.log10(300)) : 0);

	function reset() {
		abort?.abort();
		abort = null;
		if (clock) clearInterval(clock);
		clock = null;
		lanes = { web: empty(), catalog: empty() };
		shown = { web: 0, catalog: 0 };
		spec = null;
		running = false;
		finished = false;
		errorMsg = '';
		replayed = false;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function onEvent(e: any) {
		if (e.type === 'spec') spec = e.spec;
		else if (e.type === 'step') {
			const l = lanes[e.lane as Lane];
			// The web agent's server-side searches report usage only when its turn ends, so while
			// it works we add a rough estimate per search/fetch; exact usage replaces it at the end.
			if (e.inputTokens > 0) l.real += e.inputTokens;
			else if (e.lane === 'web') l.est += estimate(e.label);
			l.input = Math.max(l.real, l.est);
			l.output += e.outputTokens;
			if (e.kind === 'tool') l.calls += 1;
			l.log.push({ t: e.t, label: e.label, inputTokens: e.inputTokens, tone: e.tone, url: e.url });
		} else if (e.type === 'lane_done') {
			const l = lanes[e.lane as Lane];
			Object.assign(l, {
				done: true,
				input: e.inputTokens,
				output: e.outputTokens,
				cost: e.costUsd,
				calls: Math.max(l.calls, e.calls ?? 0),
				elapsed: e.t,
				answer: e.aborted ? `Stopped: ${e.aborted}` : e.answer,
				results: e.results ?? [],
				verify: e.verify ?? null,
				paymentUrl: e.paymentUrl ?? null
			});
		} else if (e.type === 'summary') replayed = e.replayed;
		else if (e.type === 'error') errorMsg = e.message;
	}

	const estimate = (label: string) =>
		label.startsWith('web_fetch')
			? 9000
			: label.startsWith('search returned')
				? 2500
				: label.startsWith('code_execution')
					? 700
					: 0;

	// A ready question shown in light grey inside the empty box. Its parts are in our DB and a click
	// replays a recorded real run (no API cost); it rotates to the next preset each time.
	let suggestIdx = $state(0);
	const suggestion = $derived(PRESETS[suggestIdx % PRESETS.length]);
	function runSuggestion() {
		const p = suggestion;
		suggestIdx++;
		freeText = p.question;
		start(p.question, { mode: 'preset', presetId: p.id, lanes: ['catalog', 'web'] });
	}

	async function race(ev: SubmitEvent) {
		ev.preventDefault();
		if (running || !freeText.trim()) return;
		await start(freeText.trim(), { mode: 'ai', query: freeText.trim(), lanes: ['catalog', 'web'] });
	}

	// Searches started from the floating dock run here, in the big split view.
	$effect(() => {
		const req = demo.raceRequest;
		if (!req) return;
		untrack(() => {
			demo.raceRequest = null;
			freeText = req.label;
			start(req.label, req.body);
		});
	});
	$effect(() => {
		demo.raceRunning = running;
	});

	async function start(label: string, body: Record<string, unknown>) {
		if (running) return;
		reset();
		asked = label;
		running = true;
		demo.lastQuery = { id: Date.now(), label };
		abort = new AbortController();
		const started = performance.now();
		clock = setInterval(() => {
			const t = (performance.now() - started) / 1000;
			for (const lane of ['web', 'catalog'] as Lane[])
				if (!lanes[lane].done) lanes[lane].elapsed = t;
		}, 100);
		try {
			const res = await fetch('/api/agent-search', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
				signal: abort.signal
			});
			if (!res.ok || !res.body) throw new Error(await res.text());
			const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
			let buf = '';
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				buf += value;
				let i;
				while ((i = buf.indexOf('\n\n')) >= 0) {
					const chunk = buf.slice(0, i);
					buf = buf.slice(i + 2);
					if (chunk.startsWith('data: ')) onEvent(JSON.parse(chunk.slice(6)));
				}
			}
		} catch (e) {
			if ((e as Error).name !== 'AbortError') errorMsg = (e as Error).message;
		} finally {
			if (clock) clearInterval(clock);
			clock = null;
			running = false;
			finished = !errorMsg;
		}
	}

	function clearAll() {
		reset();
		asked = '';
		freeText = '';
	}

	onMount(() => {
		demo.raceMounted = true;
		const chaser = setInterval(chase, 110);
		return () => {
			clearInterval(chaser);
			demo.raceMounted = false;
			reset();
		};
	});

	const usd = (v: number) => (v < 0.1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);
	const money = (r: Result) =>
		r.price == null
			? '–'
			: `${r.currency === 'KRW' ? '₩' : r.currency === 'USD' ? '$' : r.currency === 'JPY' ? '¥' : ''}${r.price.toLocaleString()}`;
</script>

<div class="race">
	<header class="head">
		<h1>Search for the part you want to buy</h1>
		<div class="versus">
			<span class="vs-side web"><i></i>AI Web Search</span>
			<span class="vs-mid">vs</span>
			<span class="vs-side cat"><i></i>Agent Catalog</span>
		</div>
	</header>

	<form class="ask" onsubmit={race}>
		<div class="field">
			<input bind:value={freeText} disabled={running} aria-label="Part request" />
			{#if !freeText && !running}
				<button
					type="button"
					class="ghost"
					onclick={runSuggestion}
					title="Run this example search (replays a recorded real run)"
				>
					<span class="ghost-q">{suggestion.question}</span>
					<span class="ghost-k">click to search ↵</span>
				</button>
			{/if}
		</div>
		<button class="btn btn-primary" type="submit" disabled={running || !freeText.trim()}>
			{running ? 'Racing…' : 'Race'}
		</button>
	</form>
	<p class="hint">
		Two real Claude agents get your exact words and the same model. Only the tools differ. A live
		race costs about $0.3–1 in API usage.
	</p>

	{#if errorMsg}
		<div class="missing"><b>Search failed.</b> {errorMsg}</div>
	{/if}
	{#if !running && !finished}
		<div class="split idle" aria-hidden="true">
			<div class="mult wait"><span class="mv">?×</span><span class="ml">token gap</span></div>
			{#each ['web', 'catalog'] as const as lane (lane)}
				<section class="lane {lane}">
					<h2>{lane === 'web' ? 'AI Web Search' : 'Agent Catalog'}</h2>
					<div class="tok">
						<div class="k">Input tokens</div>
						<div class="tokv plain">0</div>
					</div>
					<p class="idle-note">
						{lane === 'web'
							? 'Searches shops and opens product pages itself'
							: 'Asks the Agent Catalog index on the live DB'}
					</p>
				</section>
			{/each}
		</div>
		<p class="hint">Ask above, or use the search box at the bottom right. Both run here.</p>
	{/if}
	{#if running || finished}
		<div class="asked">
			{#if finished}<button class="clear" type="button" onclick={clearAll}>New search</button>{/if}
		</div>
		{#if spec}
			<div class="spec">
				<div class="spec-main">
					<span class="k">Understood as</span>
					<p class="sum">{spec.summary ?? asked}</p>
					<div class="fields">
						{#if spec.category}<span><em>category</em>{spec.category}</span>{/if}
						{#if spec.qty}<span><em>qty</em>{spec.qty.toLocaleString()}</span>{/if}
						{#if spec.max_unit_price}<span
								><em>max / pc</em>{spec.max_unit_price.toLocaleString()}
								{spec.currency ?? ''}</span
							>{/if}
						{#each spec.attributes ?? [] as at, i (i)}<span><em>{at.field}</em>{at.value}</span
							>{/each}
					</div>
					<div class="terms">
						<em>searching for</em>
						{#each showTerms ? terms : terms.slice(0, 3) as t, i (i)}<span class="chip">{t}</span
							>{/each}
						{#if terms.length > 3}<button
								type="button"
								class="more"
								onclick={() => (showTerms = !showTerms)}
								>{showTerms ? 'less' : `+${terms.length - 3}`}</button
							>{/if}
					</div>
				</div>
				{#if spec.ambiguities?.length}
					<div class="spec-q">
						<span class="k">Would sharpen the search</span>
						<ol>
							{#each spec.ambiguities.slice(0, 3) as q, i (i)}<li>{q}</li>{/each}
						</ol>
						<span class="note">The agents continue with their best guess.</span>
					</div>
				{/if}
			</div>
		{/if}
		<div class="split">
			<div class="mult" class:final={finished} style:--heat={heat} aria-hidden="true">
				<span class="mv"
					>{#if ratio > 0}<Odometer
							value={ratioShown}
							decimals={ratioShown < 10 ? 1 : 0}
							suffix="×"
							duration={finished ? 1400 : 600}
						/>{:else}…{/if}</span
				>
				<span class="ml">{finished ? 'more tokens browsing the web' : 'web ÷ catalog tokens'}</span>
			</div>
			{#each ['web', 'catalog'] as const as lane (lane)}
				{@const l = lanes[lane]}
				<section class="lane {lane}">
					<h2>
						{lane === 'web' ? 'AI Web Search' : 'Agent Catalog'}
						<span class="badge">{lane === 'web' ? 'web_search · web_fetch' : 'live DB · x402'}</span
						>
					</h2>
					<div class="tok">
						<div class="k">Cumulative input tokens</div>
						<div class="tokv"><Odometer value={shown[lane]} duration={700} /></div>
					</div>
					<div class="kv">
						<div><span class="k">Tool calls</span><span class="v">{l.calls}</span></div>
						<div><span class="k">Elapsed</span><span class="v">{l.elapsed.toFixed(1)}s</span></div>
						<div>
							<span class="k">Cost</span>
							<span class="v">{l.done ? usd(l.cost) : '…'}</span>
						</div>
					</div>
					<ol class="log">
						{#each l.log as e, i (i)}
							<li class={e.tone ?? ''}>
								<span class="t">{e.t.toFixed(1)}s</span>
								<span class="msg"
									>{e.label}{#if e.url}
										<a href={e.url} target="_blank" rel="noreferrer">view tx ↗</a>{/if}</span
								>
								<span class="d">{e.inputTokens ? '+' + e.inputTokens.toLocaleString() : ''}</span>
							</li>
						{/each}
					</ol>
					{#if l.done}
						<div class="answer">
							{#if lane === 'catalog' && l.results.length}
								<b
									>Delivered results {#if l.verify}<span class="badge {l.verify}">{l.verify}</span
										>{/if}</b
								>
								<ol class="results">
									{#each l.results as r, i (i)}
										<li>
											<a href={r.url} target="_blank" rel="noreferrer">{r.name}</a>
											<span class="mono">{money(r)} · {r.site}</span>
										</li>
									{/each}
								</ol>
								{#if l.paymentUrl}<a
										class="paylink"
										href={l.paymentUrl}
										target="_blank"
										rel="noreferrer">0.02 USDC paid on Base Sepolia ↗</a
									>{/if}
							{:else}
								<b>Agent answer</b>
								<p class="ans">{l.answer}</p>
							{/if}
						</div>
					{/if}
				</section>
			{/each}
		</div>

		<div class="ratiobar" class:live={running} style:--heat={heat}>
			<span class="rl">{finished ? 'Web search used' : 'Web search is using'}</span>
			<span class="rv">
				{#if ratio > 0}<Odometer
						value={ratioShown}
						decimals={ratioShown < 10 ? 1 : 0}
						suffix="×"
						duration={running ? 700 : 1600}
					/>{:else}–{/if}
			</span>
			<span class="rl">more tokens</span>
			<div class="meter" aria-hidden="true">
				<i style:width={`${Math.max(2, heat * 100)}%`}></i>
				<span style:left="0%">1×</span><span style:left="40.4%">10×</span><span style:left="80.7%"
					>100×</span
				>
			</div>
			{#if finished}
				<span class="note">
					{lanes.web.input.toLocaleString()} vs {lanes.catalog.input.toLocaleString()} input tokens ·
					{usd(lanes.web.cost)} vs {usd(lanes.catalog.cost)}{#if replayed}
						· replay of a recorded run{/if}
				</span>
				<button class="btn btn-primary" type="button" onclick={() => scrollToSection('monitor')}
					>See it in the data monitor ↓</button
				>
			{/if}
		</div>
	{/if}
</div>

<style>
	.race {
		/* web = red, catalog = blue (overrides the site orange / green inside the race) */
		--web: #ff5d6c;
		--accent: #6f93ff;
		--accent-ink: #050b24;
		--g-web: linear-gradient(180deg, #ffd0cb 0%, #ff7a7f 50%, #ff3b55 100%);
		--g-cat: linear-gradient(180deg, #dbe6ff 0%, #8fabff 50%, #3d6bff 100%);
		max-width: 1280px;
		margin: 0 auto;
		padding: 32px 20px 80px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		background:
			radial-gradient(90% 50% at 50% -10%, rgba(61, 107, 255, 0.09), transparent 60%), var(--bg);
	}
	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 10px;
	}
	h1 {
		font-size: clamp(28px, 4vw, 44px);
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.versus {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
		justify-content: center;
		margin-top: 6px;
	}
	.vs-side {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 600;
		padding: 8px 14px;
		border-radius: 999px;
		border: 1px solid var(--line-strong);
		background: var(--glass);
	}
	.vs-side i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.vs-side.web i {
		background: var(--web);
	}
	.vs-side.cat i {
		background: var(--brand-2);
	}
	.vs-mid {
		font: 600 12px var(--mono);
		color: var(--muted-2);
		text-transform: uppercase;
	}
	.ask {
		display: flex;
		gap: 10px;
		width: 100%;
		max-width: 760px;
		margin: 8px auto 0;
		padding: 8px 8px 8px 20px;
		border-radius: 999px;
		background: var(--glass-2);
		border: 1px solid var(--brand-line);
		box-shadow: 0 20px 50px -28px rgba(31, 75, 255, 0.8);
	}
	.field {
		position: relative;
		flex: 1;
		min-width: 0;
		display: flex;
	}
	.ghost {
		position: absolute;
		left: 0;
		top: 50%;
		transform: translateY(-50%);
		max-width: 100%;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 0;
		border: 0;
		background: none;
		font: 16px var(--font);
		color: var(--muted-2);
		cursor: pointer;
		text-align: left;
	}
	.ghost-q {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		transition: color 0.15s;
	}
	.ghost-k {
		flex: none;
		font: 600 11px var(--mono);
		color: var(--brand-2);
		padding: 3px 8px;
		border-radius: 999px;
		border: 1px solid var(--line-strong);
		opacity: 0.8;
		transition: opacity 0.15s;
	}
	.ghost:hover .ghost-q {
		color: var(--ink);
	}
	.ghost:hover .ghost-k {
		opacity: 1;
	}
	.ask input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: 0;
		outline: 0;
		color: var(--ink);
		font: 16px var(--font);
	}
	.ask input::placeholder {
		color: var(--muted-2);
	}
	.hint {
		text-align: center;
		font-size: 13px;
		color: var(--muted-2);
	}
	.asked {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 12px;
		font-size: 14px;
		color: var(--muted);
		overflow-wrap: anywhere;
	}
	.clear {
		font: 600 13px var(--font);
		color: var(--brand-2);
		background: none;
		border: 0;
		cursor: pointer;
		white-space: nowrap;
	}
	.missing {
		background: var(--glass);
		border: 1px solid rgba(255, 107, 91, 0.4);
		border-radius: var(--radius);
		padding: 18px;
		color: var(--muted);
	}
	.missing b {
		color: var(--red);
		margin-right: 6px;
	}
	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		overflow: hidden;
		background: var(--glass-2);
	}
	.lane {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.lane.web {
		border-right: 1px solid var(--line);
		border-top: 3px solid var(--web);
	}
	.lane.catalog {
		border-top: 3px solid var(--brand-2);
	}
	.lane h2 {
		font-size: 17px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.tok .k,
	.kv .k {
		font-size: 12px;
		color: var(--muted-2);
		display: block;
	}
	.tokv {
		font: 600 clamp(40px, 5.6vw, 68px) var(--mono);
		letter-spacing: -0.02em;
		margin-top: 4px;
	}
	/* bright gradient digits; set per glyph because the reels move on transforms */
	.tokv :global(.reel span),
	.tokv :global(.fix) {
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.web .tokv :global(.reel span),
	.web .tokv :global(.fix),
	.web .tokv.plain {
		background-image: var(--g-web);
	}
	.catalog .tokv :global(.reel span),
	.catalog .tokv :global(.fix),
	.catalog .tokv.plain {
		background-image: var(--g-cat);
	}
	.tokv.plain {
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.web .tokv {
		filter: drop-shadow(0 4px 20px rgba(255, 70, 90, 0.35));
	}
	.catalog .tokv {
		filter: drop-shadow(0 4px 20px rgba(61, 107, 255, 0.45));
	}
	/* catalog counter hugs the right edge so the centre is free for the multiplier */
	.catalog .tok {
		text-align: right;
	}
	.mult {
		position: absolute;
		left: 50%;
		top: 116px;
		z-index: 3;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 12px 22px 10px;
		border-radius: 22px;
		background: rgba(4, 6, 15, 0.72);
		border: 1px solid var(--line-strong);
		backdrop-filter: blur(10px);
		box-shadow: 0 0 calc(12px + var(--heat, 0) * 60px)
			rgba(255, 93, 108, calc(0.12 + var(--heat, 0) * 0.35));
		pointer-events: none;
		transition:
			box-shadow 0.6s,
			padding 0.6s;
	}
	.mv {
		/* grows with the gap; at the end it outsizes the token counters */
		font: 800 calc(26px + var(--heat, 0) * 30px) var(--mono);
		letter-spacing: -0.03em;
		line-height: 1;
		transition: font-size 0.7s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.mult.final .mv {
		font-size: clamp(56px, 7.4vw, 92px);
	}
	.mult.final {
		padding: 16px 28px 12px;
		border-color: rgba(255, 93, 108, 0.5);
	}
	.mv :global(.reel span),
	.mv :global(.fix) {
		background-image: linear-gradient(90deg, #ff8a93, #ff5d6c 45%, #8fabff);
		background-size: 200% 100%;
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.ml {
		font: 600 10.5px var(--mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
		white-space: nowrap;
	}
	.mult.final .ml {
		color: #ffb3b9;
	}
	.mult.wait .mv {
		color: var(--muted-2);
		font-size: 26px;
	}
	.mult.wait {
		box-shadow: none;
		border-color: var(--line);
	}
	.kv {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.kv > div {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 8px 10px;
		min-width: 0;
	}
	.kv .v {
		font: 500 15px var(--mono);
		font-variant-numeric: tabular-nums;
	}
	.log {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-height: 260px;
		font-size: 13px;
	}
	.log li {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr) auto;
		gap: 8px;
		padding: 7px 9px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.03);
		animation: in 0.3s ease;
	}
	.log .t,
	.log .d {
		font: 11.5px var(--mono);
		color: var(--muted-2);
	}
	.log .d {
		text-align: right;
		white-space: nowrap;
	}
	.web .log .d {
		color: var(--web);
	}
	.log .msg {
		overflow-wrap: anywhere;
	}
	.log li.ok {
		color: var(--accent);
	}
	.log li.pay {
		color: var(--amber);
	}
	.log li.bad {
		color: var(--red);
	}
	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}
	.answer {
		border-top: 1px dashed var(--line-strong);
		padding-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 13.5px;
	}
	.ratiobar {
		margin-top: -20px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		flex-wrap: wrap;
		text-align: center;
		padding: 16px;
		border: 1px solid var(--line-strong);
		border-top: 0;
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
		background: linear-gradient(180deg, rgba(255, 93, 108, 0.1), rgba(61, 107, 255, 0.04));
	}
	.rl {
		font-size: 15px;
		color: var(--muted);
	}
	.rv {
		font: 800 clamp(34px, 5vw, 56px) var(--mono);
		color: var(--accent);
		display: inline-block;
		transform: scale(calc(0.85 + var(--heat, 0) * 0.45));
		text-shadow: 0 0 calc(var(--heat, 0) * 36px) rgba(255, 93, 108, calc(var(--heat, 0) * 0.8));
		transition:
			transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1),
			text-shadow 0.6s;
	}
	.ratiobar.live .rv {
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			filter: brightness(1.25);
		}
	}
	.meter {
		position: relative;
		flex-basis: 100%;
		max-width: 560px;
		height: 8px;
		margin: 6px auto 14px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid var(--line);
	}
	.meter i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--brand-2), var(--web));
		box-shadow: 0 0 calc(var(--heat, 0) * 18px) rgba(255, 93, 108, 0.7);
		transition: width 0.7s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.meter span {
		position: absolute;
		top: 12px;
		transform: translateX(-50%);
		font: 500 10.5px var(--mono);
		color: var(--muted-2);
	}
	.meter span:first-of-type {
		transform: none;
	}
	.split {
		position: relative;
	}
	.split.idle {
		opacity: 0.55;
	}
	.idle-note {
		font-size: 13.5px;
		color: var(--muted);
	}
	.spec {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		gap: 14px;
		padding: 16px 18px;
		border-radius: var(--radius);
		border: 1px solid var(--line-strong);
		background: var(--glass);
	}
	.spec .k {
		display: block;
		font: 600 11px var(--mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-2);
		margin-bottom: 6px;
	}
	.sum {
		font-size: 15.5px;
		font-weight: 600;
		line-height: 1.45;
	}
	.fields,
	.terms {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 10px;
		font-size: 12.5px;
		align-items: center;
	}
	.fields span {
		padding: 3px 9px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--line);
	}
	.fields em,
	.terms em {
		font: 500 10.5px var(--mono);
		font-style: normal;
		color: var(--muted-2);
		margin-right: 6px;
		text-transform: uppercase;
	}
	.chip {
		padding: 2px 9px;
		border-radius: 999px;
		border: 1px solid var(--brand-line);
		color: var(--ink);
	}
	.more {
		border: 0;
		background: none;
		color: var(--brand-2);
		font: 600 12px var(--font);
		cursor: pointer;
	}
	.spec-q {
		border-left: 1px solid var(--line);
		padding-left: 14px;
	}
	.spec-q ol {
		margin: 0 0 6px 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
		line-height: 1.45;
		color: var(--amber);
	}
	.spec-q .note {
		font-size: 12px;
		color: var(--muted-2);
	}
	@media (max-width: 760px) {
		.spec {
			grid-template-columns: 1fr;
		}
		.spec-q {
			border-left: 0;
			padding-left: 0;
		}
	}
	.results {
		margin: 8px 0 0 18px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13.5px;
	}
	.results a {
		color: var(--ink);
		text-decoration: underline;
		text-decoration-color: var(--line-strong);
	}
	.results .mono {
		display: block;
		font-size: 12px;
		color: var(--muted);
	}
	.paylink {
		display: inline-block;
		margin-top: 10px;
		font-size: 13px;
		color: var(--amber);
	}
	.ans {
		margin-top: 6px;
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--muted);
		white-space: pre-wrap;
		max-height: 220px;
		overflow: auto;
	}
	.badge.pass {
		color: var(--accent);
		border-color: var(--accent);
	}
	.badge.fail {
		color: var(--red);
		border-color: var(--red);
	}
	@media (max-width: 860px) {
		.mult {
			position: static;
			transform: none;
			margin: 14px auto 0;
			width: fit-content;
			grid-column: 1 / -1;
		}
		.catalog .tok {
			text-align: left;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ratiobar.live .rv {
			animation: none;
		}
	}
	@media (max-width: 860px) {
		.split {
			grid-template-columns: 1fr;
		}
		.lane.web {
			border-right: 0;
		}
		.log {
			min-height: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.log li {
			animation: none;
		}
	}
</style>
