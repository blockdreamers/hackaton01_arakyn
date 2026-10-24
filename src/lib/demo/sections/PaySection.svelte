<script lang="ts">
	import '#lib/demo/theme.css';

	const LANES = [
		{ x: 100, label: 'AI agent', cls: '' },
		{ x: 320, label: 'Agent Catalog API', cls: 'acc' },
		{ x: 540, label: 'x402 facilitator', cls: '' },
		{ x: 730, label: 'USDC (Base)', cls: 'pay' }
	];

	// [y, x1, x2, text, textX, style]
	const MSGS: [number, number, number, string, number, string][] = [
		[82, 100, 320, '① search_offers preview (free)', 110, ''],
		[122, 320, 100, '② candidates · key specs · sources + data_hash', 110, 'ret'],
		[196, 100, 320, '④ only if verified: get_offers_full', 110, ''],
		[236, 320, 100, '⑤ 402 Payment Required · 0.02 USDC', 110, 'pay ret'],
		[290, 100, 320, '⑥ retry with signed USDC payment', 110, 'pay'],
		[330, 320, 540, '⑦ verify signature', 330, 'pay'],
		[370, 540, 730, '⑧ settle (tx)', 550, 'pay'],
		[420, 320, 100, '⑨ full offers + vendor links + tx hash', 110, 'ret']
	];
</script>

<div class="wrap">
	<section class="head">
		<span class="eyebrow">Payment routes</span>
		<h2 class="big">Two ways to pay</h2>
	</section>
	<div class="routes">
		<article class="route">
			<span class="rn">Route 1 · account</span>
			<h3>Google sign-in → API key</h3>
			<ol>
				<li>Sign in with Google.</li>
				<li>Issue an API key from the dashboard.</li>
				<li>Send it with every call; usage counts against the free quota, then bills per call.</li>
			</ol>
			<code>Authorization: Bearer ac_live_…</code>
			<a class="btn btn-outline" href="/dashboard">Sign in and get a key</a>
		</article>
		<article class="route acc">
			<span class="rn">Route 2 · no account</span>
			<h3>Wallet + x402, verify then pay</h3>
			<ol>
				<li>Connect a wallet and sign the request.</li>
				<li>Receive the free preview with its data hash and verify it.</li>
				<li>Only on a match, the payment contract releases USDC and the full data is delivered.</li>
			</ol>
			<code>X-PAYMENT: &lt;signed USDC authorization&gt;</code>
			<span class="note">The sequence below is this route.</span>
		</article>
	</div>

	<section class="head">
		<span class="eyebrow">Route 2 · verify, then pay</span>
		<h2>The agent only pays when the data is right</h2>
		<p>
			The fee is for the Agent Catalog data call, not the parts themselves. x402 normally pays first
			and responds after, so we split it into a free preview and a paid full response. The agent
			checks the preview against its request, signs a payment only when it matches, and confirms the
			full data hashes to the same value it previewed.
		</p>
	</section>

	<div class="seq">
		<svg viewBox="0 0 820 540" role="img" aria-label="Verify-then-pay sequence">
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
			{#each LANES as l (l.label)}
				<rect class="lane {l.cls}" x={l.x - 75} y="14" width="150" height="34" rx="8" />
				<text class="lt {l.cls}" x={l.x} y="36" text-anchor="middle">{l.label}</text>
				<path class="life" d="M{l.x} 48V528" />
			{/each}
			{#each MSGS as [y, x1, x2, , , cls] (y)}
				<path class="msg {cls}" d="M{x1} {y}H{x2 > x1 ? x2 - 4 : x2 + 4}" marker-end="url(#ar2)" />
			{/each}
			<rect class="check" x="60" y="140" width="250" height="36" rx="8" />
			<rect class="check" x="60" y="440" width="250" height="36" rx="8" />
			{#each MSGS as [y, , , text, tx, cls] (y)}
				<text class="mt {cls}" x={tx} y={y - 7}>{text}</text>
			{/each}
			<text class="mt ok" x="72" y="163">③ verify: spec · equivalent · freshness?</text>
			<text class="mt ok" x="72" y="463">⑩ full data hash = preview hash ②</text>
			<text class="mt dim" x="30" y="514"
				>If ③ fails, nothing after ④ happens: the agent re-searches with new conditions and pays
				nothing.</text
			>
		</svg>
	</div>

	<div class="cards">
		<div class="card">
			<h3>What gets checked</h3>
			<p>
				Requested spec fields match, the equivalent-standard mapping has a source, fetch time is
				within the allowed window, the vendor ships to the destination, and MOQ fits the order.
			</p>
		</div>
		<div class="card">
			<h3>In the demo</h3>
			<p>
				Payments use testnet USDC on Base, so no real money moves. Each payment and transaction
				shows up line by line in the token race and the data monitor.
			</p>
		</div>
		<div class="card">
			<h3>Call fee</h3>
			<p>
				0.02 USDC as an example. It has to be clearly below the tokens an agent burns searching the
				web itself; we set the final price after measuring the race.
			</p>
		</div>
	</div>

	<section class="head">
		<span class="eyebrow">Next</span>
		<h2>Companies pay by card, agents pay in USDC</h2>
		<p>
			Managing a USDC wallet is a chore for a company. Later, with Circle, a company tops up by card
			or bank transfer, it converts to USDC in the agent's wallet, and the agent spends within a set
			limit, only when verification passes.
		</p>
	</section>
	<div class="later">
		<span class="node">Company · card / bank top-up</span><span class="arr">→</span>
		<span class="node">Circle · convert to USDC</span><span class="arr">→</span>
		<span class="node">Agent wallet · monthly limit</span><span class="arr">→</span>
		<span class="node acc">Agent Catalog · x402 after verify</span>
	</div>
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
		color: var(--accent);
	}
	.route h3 {
		font-size: 20px;
	}
	.route ol {
		margin-left: 18px;
		color: var(--muted);
		font-size: 15px;
		line-height: 1.8;
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
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		font-size: 14px;
	}
	.node {
		background: var(--glass);
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		padding: 10px 14px;
	}
	.node.acc {
		border-color: var(--brand-line);
		color: var(--accent);
	}
	.arr {
		color: var(--muted-2);
		font-family: var(--mono);
	}
	@media (max-width: 860px) {
		.cards {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
