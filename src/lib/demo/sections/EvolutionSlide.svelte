<script lang="ts">
	// One-slide story for the intro: how search moved from people to agents to domain engines.
	const STEPS = [
		{
			era: 'Search for people',
			name: 'Google',
			what: 'Ten blue links. A person reads the pages and decides.',
			cost: '~80,000 tokens per product page',
			tone: 'past'
		},
		{
			era: 'Search for agents',
			name: 'Exa-style index',
			what: 'Clean text from the whole web. The agent still has to read, compare and convert units.',
			cost: '~10,000s of tokens per answer',
			tone: 'mid'
		},
		{
			era: 'Search for a domain',
			name: 'Agent Catalog',
			what: 'Only buyable, standardized parts. Specs normalized, sellers compared, data verifiable before paying.',
			cost: '~1,000 tokens per answer',
			tone: 'now'
		}
	];
</script>

<div class="evo" data-reveal>
	<div class="evo-head">
		<span class="eyebrow">Where search is going</span>
		<h3>From pages for people, to answers for agents, to <em>engines for each domain</em></h3>
	</div>
	<ol class="evo-steps">
		{#each STEPS as s, i (s.name)}
			<li class="step {s.tone}">
				<span class="n">0{i + 1}</span>
				<span class="era">{s.era}</span>
				<strong class="name">{s.name}</strong>
				<p>{s.what}</p>
				<span class="cost">{s.cost}</span>
			</li>
			{#if i < STEPS.length - 1}
				<li class="arrow" aria-hidden="true">→</li>
			{/if}
		{/each}
	</ol>
	<div class="evo-bar" aria-hidden="true">
		<span>General</span>
		<i></i>
		<span>Specialized</span>
	</div>
	<p class="evo-note">Token figures are estimates until the race measures them.</p>
</div>

<style>
	.evo {
		margin-top: clamp(40px, 6vw, 64px);
		padding: clamp(24px, 4vw, 40px);
		border-radius: var(--radius-lg);
		background:
			radial-gradient(90% 120% at 100% 0%, rgba(31, 75, 255, 0.18), transparent 55%),
			var(--glass-2);
		border: 1px solid var(--line-strong);
	}
	.evo-head {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 28px;
	}
	.evo-head h3 {
		font-size: clamp(22px, 3vw, 32px);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.15;
		max-width: 26ch;
	}
	.evo-head em {
		font-style: normal;
		color: var(--brand-2);
	}
	.evo-steps {
		list-style: none;
		display: grid;
		grid-template-columns: 1fr auto 1fr auto 1fr;
		gap: 14px;
		align-items: stretch;
	}
	.step {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 22px;
		border-radius: var(--radius);
		border: 1px solid var(--line);
		background: rgba(0, 0, 0, 0.25);
	}
	.step.past {
		opacity: 0.7;
	}
	.step.now {
		border-color: var(--brand-line);
		background: radial-gradient(120% 120% at 0% 0%, rgba(31, 75, 255, 0.22), transparent 60%),
			rgba(0, 0, 0, 0.3);
		box-shadow: 0 20px 50px -24px rgba(31, 75, 255, 0.7);
	}
	.n {
		font: 600 12px var(--mono);
		color: var(--muted-2);
	}
	.era {
		font: 600 11px var(--mono);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.now .era {
		color: var(--brand-2);
	}
	.name {
		font-size: 22px;
		font-weight: 800;
	}
	.step p {
		color: var(--muted);
		font-size: 14.5px;
		line-height: 1.55;
		flex: 1;
	}
	.cost {
		font: 500 12.5px var(--mono);
		color: var(--muted-2);
	}
	.past .cost {
		color: var(--web);
	}
	.now .cost {
		color: var(--accent);
	}
	.arrow {
		align-self: center;
		font-size: 22px;
		color: var(--brand-2);
	}
	.evo-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 22px;
		font: 500 11px var(--mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-2);
	}
	.evo-bar i {
		flex: 1;
		height: 2px;
		border-radius: 2px;
		background: linear-gradient(90deg, rgba(150, 175, 230, 0.2), var(--brand-2));
	}
	.evo-note {
		margin-top: 12px;
		font-size: 12px;
		color: var(--muted-2);
	}
	@media (max-width: 860px) {
		.evo-steps {
			grid-template-columns: 1fr;
		}
		.arrow {
			transform: rotate(90deg);
			justify-self: center;
		}
	}
</style>
