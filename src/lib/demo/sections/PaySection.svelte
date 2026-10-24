<script lang="ts">
	import '#lib/demo/theme.css';
	import { t } from '#lib/demo/i18n.svelte.ts';
	import PayStepper from '#lib/demo/PayStepper.svelte';

	const LANES = $derived([
		{ x: 100, label: t('AI agent', 'AI 에이전트'), cls: '' },
		{ x: 320, label: 'Agent Catalog API', cls: 'acc' },
		{ x: 540, label: 'x402 facilitator', cls: '' },
		{ x: 730, label: 'USDC (Base)', cls: 'pay' }
	]);

	// [y, x1, x2, text, textX, style]
	const MSGS: [number, number, number, string, number, string][] = $derived([
		[82, 100, 320, t('① search_offers preview (free)', '① search_offers 미리보기 (무료)'), 110, ''],
		[
			122,
			320,
			100,
			t('② candidates · key specs · sources + data_hash', '② 후보 · 핵심 사양 · 출처 + data_hash'),
			110,
			'ret'
		],
		[
			196,
			100,
			320,
			t('④ only if verified: get_offers_full', '④ 검증 통과 시에만: get_offers_full'),
			110,
			''
		],
		[
			236,
			320,
			100,
			t('⑤ 402 Payment Required · 0.02 USDC', '⑤ 402 결제 필요 · 0.02 USDC'),
			110,
			'pay ret'
		],
		[
			290,
			100,
			320,
			t('⑥ retry with signed USDC payment', '⑥ 서명한 USDC 결제로 재요청'),
			110,
			'pay'
		],
		[330, 320, 540, t('⑦ verify signature', '⑦ 서명 확인'), 330, 'pay'],
		[370, 540, 730, t('⑧ settle (tx)', '⑧ 정산 (tx)'), 550, 'pay'],
		[
			420,
			320,
			100,
			t('⑨ full offers + vendor links + tx hash', '⑨ 전체 결과 + 판매처 링크 + tx 해시'),
			110,
			'ret'
		]
	]);
</script>

<div class="wrap">
	<section class="head">
		<h2 class="big">{t('Two ways to pay', '결제 방법은 두 가지')}</h2>
	</section>
	<div class="routes">
		<article class="route">
			<span class="rn">{t('Route 1 · account', '방법 1 · 계정')}</span>
			<h3>{t('Google sign-in → API key', 'Google 로그인 → API 키')}</h3>
			<ol>
				<li>{t('Sign in with Google.', 'Google로 로그인합니다.')}</li>
				<li>{t('Issue an API key from the dashboard.', '대시보드에서 API 키를 발급합니다.')}</li>
				<li>
					{t(
						'Send it with every call; usage counts against the free quota, then bills per call.',
						'호출할 때마다 키를 함께 보냅니다. 무료 한도를 먼저 쓰고, 이후에는 호출당 과금됩니다.'
					)}
				</li>
			</ol>
			<code>Authorization: Bearer ac_live_…</code>
			<a class="btn btn-outline" href="/account"
				>{t('Sign in and get a key', '로그인하고 키 받기')}</a
			>
		</article>
		<article class="route acc">
			<span class="rn">{t('Route 2 · no account', '방법 2 · 계정 없이')}</span>
			<h3>{t('Wallet + x402, verify then pay', '지갑 + x402, 검증 후 결제')}</h3>
			<ol>
				<li>{t('Connect a wallet and sign the request.', '지갑을 연결하고 요청에 서명합니다.')}</li>
				<li>
					{t(
						'Receive the free preview with its data hash and verify it.',
						'데이터 해시가 담긴 무료 미리보기를 받아 검증합니다.'
					)}
				</li>
				<li>
					{t(
						'Only on a match, the payment contract releases USDC and the full data is delivered.',
						'조건이 맞을 때만 결제 컨트랙트가 USDC를 지급하고 전체 데이터가 전달됩니다.'
					)}
				</li>
			</ol>
			<code>X-PAYMENT: &lt;signed USDC authorization&gt;</code>
			<span class="note"
				>{t('The sequence below is this route.', '아래 흐름도가 이 방법입니다.')}</span
			>
		</article>
	</div>

	<section class="head">
		<h2>
			{t('The agent only pays when the data is right', '에이전트는 데이터가 맞을 때만 결제합니다')}
		</h2>
		<p>
			{t(
				'The fee is for the Agent Catalog data call, not the parts themselves. x402 normally pays first and responds after, so we split it into a free preview and a paid full response. The agent checks the preview against its request, signs a payment only when it matches, and confirms the full data hashes to the same value it previewed.',
				'요금은 부품 값이 아니라 Agent Catalog 데이터 호출에 대한 것입니다. x402는 보통 먼저 결제하고 나중에 응답하기 때문에, 저희는 이를 무료 미리보기와 유료 전체 응답으로 나눴습니다. 에이전트는 미리보기를 요청과 대조해 맞을 때만 결제에 서명하고, 전체 데이터의 해시가 미리보기와 같은지 확인합니다.'
			)}
		</p>
	</section>

	<PayStepper />

	<details class="seq-d">
		<summary>{t('Show the full sequence diagram', '전체 시퀀스 다이어그램 보기')}</summary>
		<div class="seq">
			<svg
				viewBox="0 0 820 540"
				role="img"
				aria-label={t('Verify-then-pay sequence', '검증 후 결제 흐름')}
			>
				<defs>
					<marker
						id="ar2"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="7"
						markerHeight="7"
						orient="auto-start-reverse"
					>
						<path d="M0 0L10 5L0 10z" fill="context-stroke" />
					</marker>
				</defs>
				{#each LANES as l (l.x)}
					<rect class="lane {l.cls}" x={l.x - 75} y="14" width="150" height="34" rx="8" />
					<text class="lt {l.cls}" x={l.x} y="36" text-anchor="middle">{l.label}</text>
					<path class="life" d="M{l.x} 48V528" />
				{/each}
				{#each MSGS as [y, x1, x2, , , cls] (y)}
					<path
						class="msg {cls}"
						d="M{x1} {y}H{x2 > x1 ? x2 - 4 : x2 + 4}"
						marker-end="url(#ar2)"
					/>
				{/each}
				<rect class="check" x="60" y="140" width="250" height="36" rx="8" />
				<rect class="check" x="60" y="440" width="250" height="36" rx="8" />
				{#each MSGS as [y, , , text, tx, cls] (y)}
					<text class="mt {cls}" x={tx} y={y - 7}>{text}</text>
				{/each}
				<text class="mt ok" x="72" y="163"
					>{t(
						'③ verify: spec · equivalent · freshness?',
						'③ 검증: 사양 · 동등 규격 · 최신성?'
					)}</text
				>
				<text class="mt ok" x="72" y="463"
					>{t('⑩ full data hash = preview hash ②', '⑩ 전체 데이터 해시 = 미리보기 해시 ②')}</text
				>
				<text class="mt dim" x="30" y="514"
					>{t(
						'If ③ fails, nothing after ④ happens: the agent re-searches with new conditions and pays nothing.',
						'③에서 실패하면 ④ 이후는 진행되지 않습니다. 에이전트는 조건을 바꿔 다시 검색하고 아무것도 결제하지 않습니다.'
					)}</text
				>
			</svg>
		</div>
	</details>

	<div class="cards">
		<div class="card">
			<h3>{t('What gets checked', '검증하는 항목')}</h3>
			<p>
				{t(
					'Requested spec fields match, the equivalent-standard mapping has a source, fetch time is within the allowed window, the vendor ships to the destination, and MOQ fits the order.',
					'요청한 사양 항목이 일치하는지, 동등 규격 매핑에 출처가 있는지, 수집 시점이 허용 범위 안인지, 판매처가 목적지로 배송하는지, 최소 주문 수량이 주문에 맞는지 확인합니다.'
				)}
			</p>
		</div>
		<div class="card">
			<h3>{t('In the demo', '데모에서는')}</h3>
			<p>
				{t(
					'Payments use testnet USDC on Base, so no real money moves. Each payment and transaction shows up line by line in the token race and the data monitor.',
					'Base 테스트넷 USDC로 결제하므로 실제 돈은 오가지 않습니다. 결제와 트랜잭션은 토큰 경주와 데이터 모니터에 한 줄씩 표시됩니다.'
				)}
			</p>
		</div>
		<div class="card">
			<h3>{t('Call fee', '호출 요금')}</h3>
			<p>
				{t(
					'0.02 USDC as an example. It has to be clearly below the tokens an agent burns searching the web itself; we set the final price after measuring the race.',
					'예시로 0.02 USDC입니다. 에이전트가 직접 웹을 검색하며 쓰는 토큰 비용보다 확실히 낮아야 하며, 최종 가격은 경주 결과를 측정한 뒤 정합니다.'
				)}
			</p>
		</div>
	</div>

	<section class="head">
		<h2>
			{t(
				'Companies pay by card, agents pay in USDC',
				'회사는 카드로, 에이전트는 USDC로 결제합니다'
			)}
		</h2>
		<p>
			{t(
				"Managing a USDC wallet is a chore for a company. Later, with Circle, a company tops up by card or bank transfer, it converts to USDC in the agent's wallet, and the agent spends within a set limit, only when verification passes.",
				'회사가 USDC 지갑을 직접 관리하기는 번거롭습니다. 앞으로는 Circle을 통해 회사가 카드나 계좌이체로 충전하면 에이전트 지갑에 USDC로 전환되고, 에이전트는 정해진 한도 안에서 검증을 통과했을 때만 사용합니다.'
			)}
		</p>
	</section>
	<ol class="later">
		{#each [t('Company · card / bank top-up', '회사 · 카드 / 계좌 충전'), t('Circle · convert to USDC', 'Circle · USDC로 전환'), t('Agent wallet · monthly limit', '에이전트 지갑 · 월 한도'), t('Agent Catalog · x402 after verify', 'Agent Catalog · 검증 후 x402')] as label, i (i)}
			<li class:acc={i === 3}><span class="ln">{i + 1}</span>{label}</li>
		{/each}
	</ol>
</div>

<style>
	.routes {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}
	.route {
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: flex-start;
		padding: 24px;
		border-radius: var(--radius);
		background: var(--glass);
		border: 1px solid var(--line);
	}
	.route.acc {
		border-color: var(--brand-line);
	}
	.rn {
		font: 600 11px var(--mono);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brand-2);
	}
	.route h3 {
		font-size: 20px;
	}
	/* numbered steps joined by a line */
	.route ol {
		list-style: none;
		counter-reset: st;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
		color: var(--muted);
		font-size: 15px;
		line-height: 1.55;
	}
	.route li {
		counter-increment: st;
		position: relative;
		padding-left: 40px;
		min-height: 28px;
	}
	.route li::before {
		content: counter(st);
		position: absolute;
		left: 0;
		top: -2px;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font: 700 13px var(--mono);
		color: #fff;
		background: rgba(61, 107, 255, 0.3);
		border: 1px solid var(--brand-2);
	}
	.route li:not(:last-child)::after {
		content: '';
		position: absolute;
		left: 13.5px;
		top: 28px;
		bottom: -14px;
		width: 1px;
		background: var(--line-strong);
	}
	.route.acc li::before {
		background: var(--brand);
	}
	.route code {
		font: 12.5px var(--mono);
		color: var(--cyan);
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 8px 12px;
		max-width: 100%;
		overflow-wrap: anywhere;
	}
	.route .note {
		font-size: 13px;
		color: var(--muted-2);
	}
	@media (max-width: 760px) {
		.routes {
			grid-template-columns: 1fr;
		}
	}
	.wrap {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 40px 16px 80px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.big {
		font-size: clamp(28px, 4vw, 44px);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.08;
	}
	h2 {
		font-size: clamp(22px, 3vw, 32px);
		font-weight: 800;
		letter-spacing: -0.01em;
	}
	.head p {
		color: var(--muted);
		font-size: 16px;
		line-height: 1.65;
		max-width: 72ch;
	}
	.seq {
		background: var(--glass);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 12px;
		overflow-x: auto;
	}
	svg {
		display: block;
		min-width: 760px;
		width: 100%;
		height: auto;
	}
	.lane {
		fill: rgba(12, 18, 38, 0.9);
		stroke: var(--line-strong);
	}
	.lane.acc {
		stroke: var(--accent);
		fill: rgba(93, 240, 168, 0.1);
	}
	.lane.pay {
		stroke: var(--amber);
		fill: rgba(255, 210, 122, 0.08);
	}
	.lt {
		font: 600 12.5px var(--font);
		fill: var(--ink);
	}
	.lt.acc {
		fill: var(--accent);
	}
	.lt.pay {
		fill: var(--amber);
	}
	.life {
		stroke: var(--line-strong);
		stroke-dasharray: 4 4;
	}
	.msg {
		fill: none;
		stroke: var(--muted);
		stroke-width: 1.3;
	}
	.msg.ret {
		stroke-dasharray: 5 3;
	}
	.msg.pay {
		stroke: var(--amber);
	}
	.check {
		fill: rgba(93, 240, 168, 0.1);
		stroke: var(--accent);
	}
	.mt {
		font: 12px var(--font);
		fill: var(--ink);
	}
	.mt.pay {
		fill: var(--amber);
	}
	.mt.ok {
		fill: var(--accent);
	}
	.mt.dim {
		fill: var(--muted-2);
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}
	.card {
		background: var(--glass);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 22px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.card h3 {
		font-size: 17px;
	}
	.card p {
		color: var(--muted);
		font-size: 14px;
		line-height: 1.6;
	}
	.later {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0;
		font-size: 14px;
	}
	.later li {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		text-align: center;
		padding: 0 8px;
		color: var(--ink);
	}
	.later li:not(:last-child)::after {
		content: '';
		position: absolute;
		top: 16px;
		left: calc(50% + 22px);
		right: calc(-50% + 22px);
		height: 2px;
		background: linear-gradient(90deg, var(--brand-2), rgba(61, 107, 255, 0.25));
	}
	.ln {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font: 700 14px var(--mono);
		background: rgba(4, 6, 15, 0.8);
		border: 2px solid var(--brand-2);
		color: #cfdcff;
	}
	.later li.acc .ln {
		background: var(--brand);
		color: #fff;
		box-shadow: 0 0 22px rgba(61, 107, 255, 0.7);
	}
	.later li.acc {
		color: #cfdcff;
		font-weight: 600;
	}
	.seq-d summary {
		cursor: pointer;
		color: var(--muted);
		font-size: 14px;
		padding: 4px 0;
	}
	.seq-d summary:hover {
		color: var(--ink);
	}
	.seq-d .seq {
		margin-top: 12px;
	}
	@media (max-width: 860px) {
		.cards {
			grid-template-columns: minmax(0, 1fr);
		}
		.later {
			grid-template-columns: 1fr;
			gap: 14px;
		}
		.later li {
			flex-direction: row;
			text-align: left;
		}
		.later li::after {
			display: none;
		}
	}
</style>
