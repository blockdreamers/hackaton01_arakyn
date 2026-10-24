<script lang="ts">
	import { demo, scrollToSection } from '#lib/demo/demo-state.svelte.ts';
	// Floating agent search (bottom right). Two entry points: a preset question, or free text that
	// Claude turns into a spec. Both run the web agent and the Agent Catalog agent side by side and
	// stream their real token usage from /api/agent-search.
	import Odometer from './Odometer.svelte';
	import { PRESETS, type PresetId } from './presets.ts';
	import type { Spec } from './spec.ts';

	type Lane = 'web' | 'catalog';
	interface Step {
		label: string;
		inputTokens: number;
		outputTokens: number;
		t: number;
		tone?: 'ok' | 'bad' | 'pay';
		url?: string;
	}
	interface LaneState {
		input: number;
		output: number;
		cost: number;
		calls: number;
		steps: Step[];
		answer: string;
		results: { name: string; price: number | null; currency: string; site: string; url: string }[];
		done: boolean;
		verify?: string;
		aborted?: string;
	}
	const empty = (): LaneState => ({
		input: 0,
		output: 0,
		cost: 0,
		calls: 0,
		steps: [],
		answer: '',
		results: [],
		done: false
	});

	// Always docked bottom-right; the user can minimize it to the launcher pill (remembered per browser).
	const KEY = 'agent-catalog-dock-minimized';
	let open = $state(true);
	$effect(() => {
		try {
			const saved = localStorage.getItem(KEY);
			// on phones start minimized so the panel doesn't cover the hero
			if (saved === '1' || (saved === null && innerWidth < 640)) open = false;
		} catch {
			// storage unavailable: stay open
		}
	});
	function setOpen(v: boolean) {
		open = v;
		try {
			localStorage.setItem(KEY, v ? '0' : '1');
		} catch {
			// not remembered
		}
	}
	let exampleIdx = 0;
	let query = $state('');
	let handedOff = $state(false);
	let withWeb = $state(true);
	let running = $state(false);
	let spec = $state<Spec | null>(null);
	let specCost = $state(0);
	let lanes = $state<Record<Lane, LaneState>>({ web: empty(), catalog: empty() });
	let activeLanes = $state<Lane[]>(['web', 'catalog']);
	let ratio = $state<number | null>(null);
	let replayed = $state(false);
	let spent = $state<number | null>(null);
	let errorMsg = $state('');

	async function loadBudget() {
		try {
			const r = await fetch('/api/agent-search');
			if (r.ok) spent = (await r.json()).spentUsd;
		} catch {
			// budget line stays hidden
		}
	}

	$effect(() => {
		if (open && spent === null) loadBudget();
	});

	async function run(body: Record<string, unknown>) {
		if (running) return;
		// On the home page the big left/right race runs the search, so it isn't run twice.
		if (demo.raceMounted) {
			if (demo.raceRunning) return;
			demo.raceRequest = { id: Date.now(), label: String(body.query ?? query), body };
			handedOff = true;
			scrollToSection('race');
			return;
		}
		handedOff = false;
		running = true;
		spec = null;
		specCost = 0;
		ratio = null;
		replayed = false;
		errorMsg = '';
		lanes = { web: empty(), catalog: empty() };
		activeLanes = body.lanes as Lane[];
		try {
			const res = await fetch('/api/agent-search', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
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
			errorMsg = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function onEvent(e: any) {
		if (e.type === 'spec') {
			spec = e.spec;
			specCost = e.costUsd ?? 0;
		} else if (e.type === 'step') {
			const l = lanes[e.lane as Lane];
			l.input += e.inputTokens;
			l.output += e.outputTokens;
			l.steps.push({
				label: e.label,
				inputTokens: e.inputTokens,
				outputTokens: e.outputTokens,
				t: e.t,
				tone: e.tone,
				url: e.url
			});
		} else if (e.type === 'lane_done') {
			const l = lanes[e.lane as Lane];
			l.done = true;
			l.input = e.inputTokens;
			l.output = e.outputTokens;
			l.cost = e.costUsd;
			l.calls = e.calls;
			l.answer = e.answer;
			l.results = e.results ?? [];
			l.verify = e.verify;
			l.aborted = e.aborted;
		} else if (e.type === 'summary') {
			ratio = e.ratio;
			replayed = e.replayed;
			spent = e.spentUsd;
		} else if (e.type === 'error') {
			errorMsg = e.message;
		}
	}

	const usd = (v: number) => '$' + v.toFixed(v < 0.1 ? 4 : 2);
	const LABEL: Record<Lane, string> = { web: 'Web AI search', catalog: 'Agent Catalog' };
</script>

<div class="dock" class:open>
	{#if open}
		<section class="panel" aria-label="Agent search">
			<header class="ph">
				<div>
					<b><img src="/brand/icon-blue.png" alt="" width="18" height="20" />Ask an agent</b>
					<span class="sub">Real Claude runs · web search vs Agent Catalog</span>
				</div>
				<button
					class="x"
					type="button"
					aria-label="Minimize"
					title="Minimize"
					onclick={() => setOpen(false)}>–</button
				>
			</header>

			<form
				class="forms"
				onsubmit={(e) => {
					e.preventDefault();
					if (query.trim())
						run({ mode: 'ai', query, lanes: withWeb ? ['catalog', 'web'] : ['catalog'] });
				}}
			>
				<textarea
					bind:value={query}
					rows="3"
					placeholder="Describe the part and spec you need, e.g. 5mm 빨간 LED 200개, 개당 200원 이하"
					aria-label="Describe the part you need"
					disabled={running}
					onkeydown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
							e.preventDefault();
							e.currentTarget.form?.requestSubmit();
						}
					}}></textarea>
				<div class="row">
					<!-- Example search: fills a sample question and replays a recorded real run (no API cost) -->
					<button
						class="btn-s alt"
						type="button"
						disabled={running}
						onclick={() => {
							const p = PRESETS[exampleIdx++ % PRESETS.length];
							query = p.question;
							run({ mode: 'preset', presetId: p.id as PresetId, lanes: ['catalog', 'web'] });
						}}>예시 검색</button
					>
					<button class="btn-s" type="submit" disabled={running || !query.trim()}>실제 검색</button>
				</div>
				<label class="toggle"
					><input type="checkbox" bind:checked={withWeb} disabled={running} /> Include live web search
					(≈$0.3–1 per run)</label
				>
			</form>

			<div class="body">
				{#if handedOff && demo.raceMounted}
					<p class="handoff">
						{demo.raceRunning
							? 'Running in the token race above, left vs right.'
							: 'Results are in the token race above.'}
						<button type="button" onclick={() => scrollToSection('race')}>Show ↑</button>
					</p>
				{/if}
				{#if errorMsg}<p class="err">{errorMsg}</p>{/if}
				{#if running && !spec}<p class="muted">Reading the request…</p>{/if}

				{#if spec}
					<div class="spec">
						<div class="sh">
							Extracted spec {#if specCost}<span class="muted">· {usd(specCost)}</span>{/if}
						</div>
						<p>{spec.summary}</p>
						<div class="chips">
							{#each [...spec.search_terms_ko, ...spec.search_terms_en] as t, i (i)}<span
									class="chip">{t}</span
								>{/each}
							{#each spec.attributes as a, i (i)}<span class="chip a">{a.field}: {a.value}</span
								>{/each}
							{#if spec.qty}<span class="chip a">qty {spec.qty}</span>{/if}
							{#if spec.max_unit_price}<span class="chip a"
									>≤ {spec.max_unit_price.toLocaleString()} {spec.currency ?? ''}</span
								>{/if}
						</div>
						{#if spec.ambiguities.length}
							<ul class="amb">
								{#each spec.ambiguities as q, i (i)}<li>{q}</li>{/each}
							</ul>
						{/if}
					</div>

					<div class="lanes" class:single={activeLanes.length === 1}>
						{#each (['web', 'catalog'] as Lane[]).filter( (l) => activeLanes.includes(l) ) as lane (lane)}
							{@const l = lanes[lane]}
							<div class="lane {lane}">
								<div class="lh">{LABEL[lane]}</div>
								<div class="tok"><Odometer value={l.input} duration={700} /></div>
								<div class="meta">
									input tokens · {l.output.toLocaleString()} out · {l.calls} tool calls{#if l.done}
										· {usd(l.cost)}{/if}
								</div>
								<ol class="steps">
									{#each l.steps as s, i (i)}
										<li class={s.tone ?? ''}>
											<span class="t">{s.t.toFixed(1)}s</span><span
												>{s.label}{#if s.url}
													<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
													<a href={s.url} target="_blank" rel="noreferrer">view tx ↗</a>{/if}</span
											>{#if s.inputTokens}<span class="d">+{s.inputTokens.toLocaleString()}</span
												>{/if}
										</li>
									{/each}
									{#if !l.done && running}<li class="wait">working…</li>{/if}
								</ol>
								{#if l.done}
									{#if l.results.length}
										<table>
											<tbody>
												{#each l.results as r, i (i)}
													<tr>
														<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
														<td><a href={r.url} target="_blank" rel="noreferrer">{r.name}</a></td>
														<td class="n">{r.price?.toLocaleString() ?? '–'} {r.currency}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									{/if}
									<details>
										<summary
											>Agent answer{#if l.aborted}
												· {l.aborted}{/if}</summary
										>
										<pre>{l.answer}</pre>
									</details>
								{/if}
							</div>
						{/each}
					</div>
					{#if ratio}
						<div class="ratio">
							<Odometer value={ratio} decimals={1} suffix="×" duration={1200} />
							<span
								>more input tokens on the web{#if replayed}
									· replay of a recorded real run{/if}</span
							>
						</div>
					{/if}
				{/if}
			</div>
			{#if spent !== null}<footer class="pf">API budget used: {usd(spent)} of $500</footer>{/if}
		</section>
	{/if}
	{#if !open}
		<button class="launch" type="button" onclick={() => setOpen(true)} aria-expanded="false">
			<img src="/brand/icon-white.png" alt="" width="22" height="22" />
			Ask an agent{#if running}<span class="dot"></span>{/if}
		</button>
	{/if}
</div>

<style>
	/* White panel docked bottom-right, logo-blue borders. */
	.dock {
		--d-ink: #111827;
		--d-muted: #6b7280;
		--d-line: #e5e7eb;
		--d-soft: #f3f4f6;
		--d-web: #ea580c;
		--d-cat: var(--brand);
		position: fixed;
		right: 20px;
		bottom: 20px;
		z-index: 50;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-family: var(--font);
		color: var(--d-ink);
	}
	.launch {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 12px 18px;
		border-radius: 999px;
		border: 1px solid var(--brand-line);
		background: var(--brand);
		color: #fff;
		font: 600 14px var(--font);
		cursor: pointer;
		box-shadow: 0 14px 40px -10px rgba(31, 75, 255, 0.7);
	}
	.launch img {
		height: 20px;
		width: auto;
	}
	.launch .dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #fff;
		animation: pulse 1s infinite alternate;
	}
	@keyframes pulse {
		to {
			opacity: 0.3;
		}
	}
	.handoff {
		font-size: 13px;
		color: var(--d-ink);
		background: #eef2ff;
		border: 1px solid #c7d2fe;
		border-radius: 10px;
		padding: 10px 12px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.handoff button {
		border: 0;
		background: none;
		color: var(--brand);
		font: 600 13px var(--font);
		cursor: pointer;
	}
	.panel {
		width: min(380px, calc(100vw - 40px));
		max-height: min(80vh, 820px);
		display: flex;
		flex-direction: column;
		border-radius: 18px;
		/* gradient ring + raised, slightly puffy look */
		border: 2px solid transparent;
		background:
			linear-gradient(#fff, #fff) padding-box,
			linear-gradient(135deg, #5df0a8 0%, #3d6bff 45%, #8b5cf6 100%) border-box;
		box-shadow:
			0 28px 60px -18px rgba(31, 75, 255, 0.55),
			0 10px 22px -12px rgba(15, 23, 42, 0.5),
			inset 0 2px 0 rgba(255, 255, 255, 0.9),
			inset 0 -3px 8px rgba(31, 75, 255, 0.08);
		transform: translateY(-2px);
		overflow: hidden;
	}
	.ph {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 12px 14px 10px;
		border-bottom: 1px solid var(--d-line);
	}
	.ph b {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 15px;
	}
	.ph b img {
		height: 18px;
		width: auto;
	}
	.sub,
	.muted,
	.hint,
	.meta {
		color: var(--d-muted);
		font-size: 12px;
	}
	.x {
		background: none;
		border: 1px solid var(--d-line);
		border-radius: 8px;
		width: 28px;
		height: 28px;
		color: var(--d-muted);
		font-size: 18px;
		cursor: pointer;
		line-height: 1;
	}
	.x:hover {
		border-color: var(--brand);
		color: var(--brand);
	}
	.forms {
		padding: 10px 14px;
		display: flex;
		flex-direction: column;
		gap: 7px;
		border-bottom: 1px solid var(--d-line);
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.row .btn-s {
		flex: 1;
		padding: 11px 12px;
		font-size: 14px;
	}
	.forms textarea {
		width: 100%;
		min-height: 92px;
		resize: vertical;
		background: #fff;
		border: 1px solid #d1d5db;
		border-radius: 12px;
		color: var(--d-ink);
		font: 15px/1.5 var(--font);
		padding: 12px 14px;
		box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.08);
	}
	.forms textarea:focus {
		outline: none;
		border-color: var(--brand);
		box-shadow: 0 0 0 3px rgba(31, 75, 255, 0.15);
	}
	.btn-s {
		flex: none;
		border: 0;
		border-radius: 9px;
		padding: 8px 12px;
		font: 600 13px var(--font);
		color: #fff;
		background: var(--brand);
		cursor: pointer;
	}
	.btn-s.alt {
		background: #fff;
		color: var(--brand);
		border: 1px solid var(--brand);
	}
	.btn-s:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.toggle {
		font-size: 12px;
		color: var(--d-muted);
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.toggle input {
		accent-color: var(--brand);
	}
	.body {
		padding: 10px 14px;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.err {
		color: #dc2626;
		font-size: 12.5px;
		overflow-wrap: anywhere;
	}
	.spec {
		border: 1px solid rgba(31, 75, 255, 0.35);
		background: rgba(31, 75, 255, 0.04);
		border-radius: 10px;
		padding: 9px 10px;
		font-size: 13px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.sh {
		font: 600 10.5px var(--mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brand);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.chip {
		font: 11px var(--mono);
		padding: 2px 7px;
		border-radius: 999px;
		border: 1px solid rgba(31, 75, 255, 0.3);
		color: var(--brand);
		background: #fff;
	}
	.chip.a {
		color: #92400e;
		border-color: #fcd34d;
		background: #fffbeb;
	}
	.amb {
		margin-left: 16px;
		color: #92400e;
		font-size: 12px;
	}
	.lanes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.lanes.single {
		grid-template-columns: 1fr;
	}
	.lane {
		border: 1px solid var(--d-line);
		border-radius: 10px;
		padding: 8px 9px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.lane.web {
		border-top: 3px solid var(--d-web);
	}
	.lane.catalog {
		border-top: 3px solid var(--d-cat);
	}
	.lh {
		font-weight: 700;
		font-size: 12.5px;
	}
	.tok {
		font: 700 22px var(--mono);
	}
	.lane.web .tok {
		color: var(--d-web);
	}
	.lane.catalog .tok {
		color: var(--d-cat);
	}
	.meta {
		font-size: 11px;
	}
	.steps {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 3px;
		max-height: 160px;
		overflow: auto;
		font: 10.5px var(--mono);
	}
	.steps li {
		display: grid;
		grid-template-columns: 34px 1fr auto;
		gap: 4px;
		padding: 3px 5px;
		border-radius: 5px;
		background: var(--d-soft);
	}
	.steps li span:nth-child(2) {
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.steps .t,
	.steps .d {
		color: #9ca3af;
	}
	.steps li.ok {
		color: #047857;
		background: #ecfdf5;
	}
	.steps li.bad {
		color: #b91c1c;
		background: #fef2f2;
	}
	.steps li.pay {
		color: #92400e;
		background: #fffbeb;
	}
	.steps li a {
		color: var(--brand);
		text-decoration: underline;
		margin-left: 4px;
	}
	.steps li.wait {
		display: block;
		color: var(--d-muted);
		background: none;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 11.5px;
	}
	td {
		padding: 4px 2px;
		border-bottom: 1px solid var(--d-line);
	}
	td a {
		color: var(--d-ink);
		text-decoration: underline;
		text-decoration-color: #d1d5db;
	}
	td.n {
		text-align: right;
		font-family: var(--mono);
		white-space: nowrap;
	}
	details summary {
		cursor: pointer;
		font-size: 11.5px;
		color: var(--d-muted);
	}
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font: 11.5px/1.5 var(--font);
		color: var(--d-ink);
		margin-top: 6px;
	}
	.ratio {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
		padding: 8px 10px;
		border-radius: 10px;
		background: rgba(31, 75, 255, 0.06);
		border: 1px solid rgba(31, 75, 255, 0.35);
		font-size: 12.5px;
	}
	.ratio :global(.odo) {
		font: 700 22px var(--mono);
		color: var(--brand);
	}
	.pf {
		padding: 7px 14px;
		border-top: 1px solid var(--d-line);
		font-size: 11.5px;
		color: var(--d-muted);
	}
	@media (max-width: 600px) {
		.dock {
			right: 12px;
			bottom: 12px;
			left: 12px;
		}
		.panel {
			width: 100%;
			max-height: 75vh;
		}
	}
</style>
