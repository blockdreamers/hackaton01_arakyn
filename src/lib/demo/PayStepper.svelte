<script lang="ts">
	// Verify-then-pay, one stage at a time: a progress track on top, the selected stage explained
	// below (who talks to whom, the messages, the outcome, what has been paid so far). Plays on its
	// own while in view; clicking a stage takes over.
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { t } from './i18n.svelte.ts';

	const STAGE_MS = 5200;

	const stages = $derived([
		{
			short: t('Preview', '미리보기'),
			title: t('Free preview', '무료 미리보기'),
			actors: [t('AI agent', 'AI 에이전트'), 'Agent Catalog API'],
			body: t(
				'The agent searches and gets candidates with their key specs, sources and a data hash. Nothing is paid yet.',
				'에이전트가 검색하면 후보 상품과 핵심 사양, 출처, 데이터 해시를 받습니다. 아직 아무것도 결제하지 않습니다.'
			),
			msgs: [
				['①', t('search_offers · preview (free)', 'search_offers · 미리보기 (무료)'), ''],
				[
					'②',
					t('candidates · key specs · sources + data_hash', '후보 · 핵심 사양 · 출처 + data_hash'),
					'ret'
				]
			],
			outcome: null as null | { ok: string; bad?: string },
			paid: 0
		},
		{
			short: t('Verify', '검증'),
			title: t('Check it against the request', '요청과 대조해 검증'),
			actors: [t('AI agent', 'AI 에이전트')],
			body: t(
				'The agent checks the preview: spec fields match, the equivalent-standard mapping has a source, the data is fresh, the vendor ships to the destination and the MOQ fits.',
				'에이전트가 미리보기를 확인합니다. 사양 항목 일치, 동등 규격 매핑의 출처, 데이터 최신성, 목적지 배송 여부, 최소 주문 수량을 봅니다.'
			),
			msgs: [
				['③', t('verify: spec · equivalent · freshness', '검증: 사양 · 동등 규격 · 최신성'), 'ok']
			],
			outcome: {
				ok: t('Pass → ask for the full data', '통과 → 전체 데이터 요청'),
				bad: t(
					'Fail → re-search with new conditions, pay nothing',
					'실패 → 조건을 바꿔 다시 검색, 결제 없음'
				)
			},
			paid: 0
		},
		{
			short: t('Request', '요청'),
			title: t('Ask for the full data', '전체 데이터 요청'),
			actors: [t('AI agent', 'AI 에이전트'), 'Agent Catalog API'],
			body: t(
				'Only a verified preview moves on. The API answers with an x402 payment request for the call fee.',
				'검증을 통과한 미리보기만 다음 단계로 갑니다. API는 호출 요금에 대한 x402 결제 요청으로 응답합니다.'
			),
			msgs: [
				['④', t('get_offers_full (only if verified)', 'get_offers_full (검증 통과 시에만)'), ''],
				['⑤', t('402 Payment Required · 0.02 USDC', '402 결제 필요 · 0.02 USDC'), 'pay ret']
			],
			outcome: null,
			paid: 0
		},
		{
			short: t('Pay', '결제'),
			title: t('Sign and settle', '서명하고 정산'),
			actors: [
				t('AI agent', 'AI 에이전트'),
				'Agent Catalog API',
				'x402 facilitator',
				'USDC (Base)'
			],
			body: t(
				'The agent signs a USDC authorization and retries. The facilitator checks the signature and settles on Base. The demo uses testnet USDC, so no real money moves.',
				'에이전트가 USDC 결제에 서명해 다시 요청합니다. facilitator가 서명을 확인하고 Base에서 정산합니다. 데모는 테스트넷 USDC라 실제 돈은 오가지 않습니다.'
			),
			msgs: [
				['⑥', t('retry with signed USDC payment', '서명한 USDC 결제로 재요청'), 'pay'],
				['⑦', t('facilitator verifies the signature', 'facilitator가 서명 확인'), 'pay'],
				['⑧', t('settle on Base (tx)', 'Base에서 정산 (tx)'), 'pay']
			],
			outcome: null,
			paid: 0.02
		},
		{
			short: t('Confirm', '확인'),
			title: t('Receive and confirm', '수령하고 확인'),
			actors: ['Agent Catalog API', t('AI agent', 'AI 에이전트')],
			body: t(
				'The full offers arrive with vendor links and the tx hash. The agent confirms the full data hashes to the same value it previewed, so it got exactly what it verified.',
				'판매처 링크와 tx 해시가 담긴 전체 결과가 도착합니다. 에이전트는 전체 데이터의 해시가 미리보기와 같은지 확인해, 검증한 그대로를 받았는지 확인합니다.'
			),
			msgs: [
				[
					'⑨',
					t('full offers + vendor links + tx hash', '전체 결과 + 판매처 링크 + tx 해시'),
					'ret'
				],
				['⑩', t('full data hash = preview hash ②', '전체 데이터 해시 = 미리보기 해시 ②'), 'ok']
			],
			outcome: { ok: t('Done: verified data, paid once', '완료: 검증된 데이터, 한 번만 결제') },
			paid: 0.02
		}
	]);

	let cur = $state(0);
	let auto = $state(true);
	let cycle = $state(0); // restarts the progress fill
	let root = $state<HTMLDivElement>();

	function go(i: number, byUser = false) {
		cur = (i + stages.length) % stages.length;
		cycle++;
		if (byUser) auto = false;
	}

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) auto = false;
		let visible = false;
		const io = new IntersectionObserver((en) => (visible = en[0].isIntersecting), {
			threshold: 0.35
		});
		if (root) io.observe(root);
		const timer = setInterval(() => {
			if (auto && visible) go(cur + 1);
		}, STAGE_MS);
		return () => {
			clearInterval(timer);
			io.disconnect();
		};
	});

	const s = $derived(stages[cur]);
</script>

<div class="stepper" bind:this={root} style:--ms="{STAGE_MS}ms">
	<ol class="track">
		{#each stages as st, i (i)}
			<li class:done={i < cur} class:on={i === cur}>
				<button
					type="button"
					onclick={() => go(i, true)}
					aria-current={i === cur ? 'step' : undefined}
				>
					<span class="dot">{i < cur ? '✓' : i + 1}</span>
					<span class="lbl">{st.short}</span>
				</button>
				{#if i < stages.length - 1}
					<span class="seg">
						{#if i < cur}<i class="full"></i>{:else if i === cur && auto}{#key cycle}<i class="run"
								></i>{/key}{/if}
					</span>
				{/if}
			</li>
		{/each}
	</ol>

	{#key cur}
		<div class="panel" in:fade={{ duration: 260 }}>
			<div class="left">
				<span class="kicker"
					>{t('Step', '단계')}
					{cur + 1} / {stages.length}
					<span class="paid" class:on={s.paid > 0}
						>{t('paid so far', '지금까지 결제')} · {s.paid.toFixed(2)} USDC</span
					></span
				>
				<h3>{s.title}</h3>
				<div class="actors">
					{#each s.actors as a, i (i)}
						{#if i}<span class="arr">→</span>{/if}<span class="actor">{a}</span>
					{/each}
				</div>
				<p>{s.body}</p>
			</div>
			<div class="right">
				<ul class="msgs">
					{#each s.msgs as [n, text, cls], i (i)}
						<li class={cls} style:animation-delay="{120 + i * 140}ms">
							<span class="n">{n}</span><span>{text}</span>
						</li>
					{/each}
				</ul>
				{#if s.outcome}
					<div class="outcome">
						<span class="ok">✓ {s.outcome.ok}</span>
						{#if s.outcome.bad}<span class="bad">✕ {s.outcome.bad}</span>{/if}
					</div>
				{/if}
			</div>
		</div>
	{/key}

	<div class="nav">
		<button type="button" onclick={() => go(cur - 1, true)}>← {t('Back', '이전')}</button>
		<button type="button" class="play" onclick={() => (auto = !auto)}
			>{auto ? t('Pause', '일시정지') : t('Play', '자동 재생')}</button
		>
		<button type="button" onclick={() => go(cur + 1, true)}>{t('Next', '다음')} →</button>
	</div>
</div>

<style>
	.stepper {
		border: 1px solid var(--brand-line);
		border-radius: var(--radius-lg);
		background:
			radial-gradient(120% 80% at 50% 0%, rgba(31, 75, 255, 0.14), transparent 60%), var(--glass-2);
		padding: clamp(18px, 3vw, 30px);
		display: flex;
		flex-direction: column;
		gap: 22px;
		box-shadow: 0 24px 60px -30px rgba(31, 75, 255, 0.7);
	}
	.track {
		list-style: none;
		display: flex;
		margin: 0;
		padding: 0;
	}
	.track li {
		flex: 1;
		display: flex;
		align-items: flex-start;
		min-width: 0;
	}
	.track li:last-child {
		flex: none;
	}
	.track button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		border: 0;
		background: none;
		padding: 0;
		cursor: pointer;
		color: var(--muted-2);
		flex: none;
		width: 72px;
	}
	.dot {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font: 700 14px var(--mono);
		border: 2px solid var(--line-strong);
		background: rgba(4, 6, 15, 0.8);
		color: var(--muted);
		transition:
			background 0.3s,
			border-color 0.3s,
			box-shadow 0.3s,
			color 0.3s;
	}
	.lbl {
		font: 600 13px var(--font);
		white-space: nowrap;
		transition: color 0.3s;
	}
	.done .dot {
		background: rgba(61, 107, 255, 0.25);
		border-color: var(--brand-2);
		color: #cfdcff;
	}
	.done .lbl {
		color: var(--muted);
	}
	.on .dot {
		background: var(--brand);
		border-color: #8fabff;
		color: #fff;
		box-shadow:
			0 0 0 6px rgba(61, 107, 255, 0.18),
			0 0 26px rgba(61, 107, 255, 0.7);
	}
	.on .lbl {
		color: var(--ink);
	}
	.seg {
		flex: 1;
		height: 4px;
		margin: 17px 4px 0 -16px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		overflow: hidden;
		position: relative;
	}
	.track li .seg {
		margin-left: -14px;
		margin-right: -14px;
	}
	.seg i {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--brand), #8fabff);
	}
	.seg i.run {
		transform-origin: left;
		animation: fill var(--ms) linear forwards;
	}
	@keyframes fill {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}

	.panel {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: 22px;
		min-height: 230px;
		padding: 22px;
		border-radius: var(--radius);
		background: rgba(4, 6, 15, 0.55);
		border: 1px solid var(--line);
	}
	.left {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.kicker {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		font: 600 11px var(--mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brand-2);
	}
	.paid {
		letter-spacing: 0.04em;
		text-transform: none;
		color: var(--muted-2);
		padding: 3px 9px;
		border-radius: 999px;
		border: 1px solid var(--line);
	}
	.paid.on {
		color: var(--amber);
		border-color: rgba(255, 210, 122, 0.4);
	}
	h3 {
		font-size: clamp(20px, 2.4vw, 26px);
		font-weight: 800;
		letter-spacing: -0.01em;
	}
	.actors {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.actor {
		font: 600 12px var(--font);
		padding: 5px 10px;
		border-radius: 8px;
		background: rgba(61, 107, 255, 0.14);
		border: 1px solid var(--line-strong);
		color: #cfdcff;
	}
	.arr {
		color: var(--muted-2);
		font-family: var(--mono);
	}
	.left p {
		color: var(--muted);
		font-size: 15px;
		line-height: 1.65;
	}
	.right {
		display: flex;
		flex-direction: column;
		gap: 12px;
		justify-content: center;
	}
	.msgs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.msgs li {
		display: flex;
		gap: 10px;
		align-items: baseline;
		padding: 10px 12px;
		border-radius: 10px;
		font: 13px var(--mono);
		color: var(--ink);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--line);
		border-left: 3px solid var(--brand-2);
		animation: msg-in 0.4s ease-out both;
	}
	.msgs li.ret {
		border-left-style: dashed;
	}
	.msgs li.pay {
		border-left-color: var(--amber);
		color: #ffe2a8;
	}
	.msgs li.ok {
		border-left-color: #8fabff;
		color: #cfdcff;
	}
	.msgs .n {
		color: var(--muted-2);
		flex: none;
	}
	@keyframes msg-in {
		from {
			opacity: 0;
			transform: translateX(-8px);
		}
	}
	.outcome {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13.5px;
	}
	.outcome .ok {
		color: #8fabff;
	}
	.outcome .bad {
		color: #ff8a93;
	}
	.nav {
		display: flex;
		justify-content: space-between;
		gap: 10px;
	}
	.nav button {
		border: 1px solid var(--line-strong);
		background: rgba(4, 6, 15, 0.6);
		color: var(--ink);
		font: 600 13px var(--font);
		padding: 8px 14px;
		border-radius: 999px;
		cursor: pointer;
	}
	.nav button:hover {
		border-color: var(--brand-line);
	}
	.nav .play {
		color: var(--muted);
	}
	@media (max-width: 760px) {
		.panel {
			grid-template-columns: 1fr;
		}
		.track button {
			width: 52px;
		}
		.lbl {
			font-size: 11px;
		}
		.dot {
			width: 32px;
			height: 32px;
		}
		.seg {
			margin-top: 14px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.msgs li {
			animation: none;
		}
	}
</style>
