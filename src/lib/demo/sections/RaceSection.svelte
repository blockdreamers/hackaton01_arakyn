<script lang="ts">
	import '#lib/demo/theme.css';
	import Odometer from '#lib/demo/Odometer.svelte';
	import { scrollToSection } from '#lib/demo/demo-state.svelte.ts';
	import { onMount } from 'svelte';

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
		search_terms_ko?: string[];
		search_terms_en?: string[];
		ambiguities?: string[];
	} | null>(null);
	let running = $state(false);
	let finished = $state(false);
	let errorMsg = $state('');
	let replayed = $state(false);
	let abort: AbortController | null = null;
	let clock: ReturnType<typeof setInterval> | null = null;

	// Live multiplier: climbs while the web agent keeps reading pages and the catalog agent stays small.
	const ratio = $derived(lanes.catalog.input > 0 ? lanes.web.input / lanes.catalog.input : 0);
	const ratioShown = $derived(ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10);
	// 0..1 on a log scale up to 300×, drives the meter, size and glow
	const heat = $derived(ratio > 1 ? Math.min(1, Math.log10(ratio) / Math.log10(300)) : 0);

	function reset() {
		abort?.abort();
		abort = null;
		if (clock) clearInterval(clock);
		clock = null;
		lanes = { web: empty(), catalog: empty() };
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
			l.input += e.inputTokens;
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

	async function race(ev: SubmitEvent) {
		ev.preventDefault();
		if (running || !freeText.trim()) return;
		reset();
		asked = freeText.trim();
		running = true;
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
				body: JSON.stringify({ mode: 'ai', query: asked, lanes: ['catalog', 'web'] }),
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

	onMount(() => reset);

	const usd = (v: number) => (v < 0.1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);
	const money = (r: Result) =>
		r.price == null
			? '–'
			: `${r.currency === 'KRW' ? '₩' : r.currency === 'USD' ? '$' : r.currency === 'JPY' ? '¥' : ''}${r.price.toLocaleString()}`;
</script>

<div class="race">
	<header class="head">
		<span class="eyebrow">Live demo</span>
		<h1>Same question. How many tokens?</h1>
		<div class="versus">
			<span class="vs-side web"><i></i>Agent + web search</span>
			<span class="vs-mid">vs</span>
			<span class="vs-side cat"><i></i>Agent + Agent Catalog</span>
		</div>
	</header>

	<form class="ask" onsubmit={race}>
		<input
			bind:value={freeText}
			placeholder="Describe the part you need, e.g. stainless M4 screws, 500 pcs"
			disabled={running}
			aria-label="Part request"
		/>
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
	{#if running || finished}
		<div class="asked">
			<span class="mono">“{asked}”</span>
			{#if finished}<button class="clear" type="button" onclick={clearAll}>New search</button>{/if}
		</div>
		{#if spec}
			<div class="spec">
				<span class="k">Parsed spec</span>
				{#each [...(spec.search_terms_ko ?? []), ...(spec.search_terms_en ?? [])] as term, i (i)}<span
						class="chip">{term}</span
					>{/each}
				{#each spec.ambiguities ?? [] as a, i (i)}<span class="amb">? {a}</span>{/each}
			</div>
		{/if}
		<div class="split">
			{#if ratio > 0}
				<div class="seam" style:--heat={heat} aria-hidden="true">
					<Odometer
						value={ratioShown}
						decimals={ratioShown < 10 ? 1 : 0}
						suffix="×"
						duration={700}
					/>
				</div>
			{/if}
			{#each ['web', 'catalog'] as const as lane (lane)}
				{@const l = lanes[lane]}
				<section class="lane {lane}">
					<h2>
						{lane === 'web' ? 'Agent + web search' : 'Agent + Agent Catalog'}
						<span class="badge">{lane === 'web' ? 'web_search · web_fetch' : 'live DB · x402'}</span
						>
					</h2>
					<div class="tok">
						<div class="k">Cumulative input tokens</div>
						<div class="tokv"><Odometer value={l.input} /></div>
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
		max-width: 1280px;
		margin: 0 auto;
		padding: 32px 20px 80px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		background:
			radial-gradient(90% 50% at 50% -10%, rgba(93, 240, 168, 0.07), transparent 60%), var(--bg);
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
		justify-content: space-between;
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
	.web .tokv {
		color: var(--web);
	}
	.catalog .tokv {
		color: var(--accent);
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
		background: linear-gradient(180deg, rgba(93, 240, 168, 0.1), rgba(93, 240, 168, 0.03));
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
		text-shadow: 0 0 calc(var(--heat, 0) * 36px) rgba(93, 240, 168, calc(var(--heat, 0) * 0.8));
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
		background: linear-gradient(90deg, var(--brand-2), var(--accent));
		box-shadow: 0 0 calc(var(--heat, 0) * 18px) rgba(93, 240, 168, 0.7);
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
	.spec {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		font-size: 13px;
	}
	.spec .k {
		font: 600 11px var(--mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-2);
		margin-right: 4px;
	}
	.chip {
		padding: 3px 10px;
		border-radius: 999px;
		border: 1px solid var(--brand-line);
		color: var(--ink);
	}
	.amb {
		color: var(--amber);
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
	.seam {
		position: absolute;
		z-index: 2;
		left: 50%;
		top: -22px;
		transform: translateX(-50%) scale(calc(0.9 + var(--heat, 0) * 0.5));
		padding: 8px 14px;
		border-radius: 999px;
		font: 800 20px var(--mono);
		color: var(--accent-ink);
		background: var(--accent);
		box-shadow: 0 0 calc(10px + var(--heat, 0) * 40px)
			rgba(93, 240, 168, calc(0.3 + var(--heat, 0) * 0.5));
		transition:
			transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1),
			box-shadow 0.6s;
	}
	@media (max-width: 860px) {
		.seam {
			display: none;
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
