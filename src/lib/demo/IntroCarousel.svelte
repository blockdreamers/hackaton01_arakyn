<script lang="ts">
	// The "why" in one compact strip: drag (mouse or touch) or use the arrows to move between
	// one-idea slides. The neighbouring slides peek in so it reads as something to drag.
	const SLIDES = [
		{
			tag: 'The problem',
			big: '80,000',
			unit: 'tokens',
			title: 'One shopping page, mostly noise',
			body: 'Scripts, reviews and banners. The spec an agent needs is a few lines.',
			tone: 'web'
		},
		{
			tag: '01 · Search for people',
			big: 'Google',
			unit: '',
			title: 'Ten blue links',
			body: 'A person opens the pages, reads them and decides.',
			tone: 'past'
		},
		{
			tag: '02 · Search for agents',
			big: 'Exa',
			unit: 'index',
			title: 'Clean text from the whole web',
			body: 'Better, but the agent still compares sellers and converts units itself.',
			tone: 'mid'
		},
		{
			tag: '03 · Search for a domain',
			big: 'Agent Catalog',
			unit: '',
			title: 'Only what you can buy',
			body: 'Standard parts, one schema, every seller compared. Answers in about 1,000 tokens.',
			tone: 'now'
		},
		{
			tag: 'Same part, one entry',
			big: 'DIN 912 = ISO 4762',
			unit: '',
			title: 'Specs normalized',
			body: 'Every spelling of the same screw resolves to one product, in mm, W and price per piece.',
			tone: 'now'
		},
		{
			tag: 'Verify, then pay',
			big: '0.02',
			unit: 'USDC',
			title: 'The agent pays only when the data matches',
			body: 'Free preview with a data hash, then an x402 payment on Base for the full offers.',
			tone: 'pay'
		}
	];

	let index = $state(0);
	let dragX = $state(0);
	let dragging = $state(false);
	let viewport = $state<HTMLDivElement>();
	let startX = 0;
	let moved = false;

	const go = (i: number) => (index = Math.max(0, Math.min(SLIDES.length - 1, i)));

	function down(e: PointerEvent) {
		dragging = true;
		moved = false;
		startX = e.clientX;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!dragging) return;
		dragX = e.clientX - startX;
		if (Math.abs(dragX) > 4) moved = true;
	}
	function up() {
		if (!dragging) return;
		const w = viewport?.clientWidth ?? 800;
		if (dragX < -w * 0.12) go(index + 1);
		else if (dragX > w * 0.12) go(index - 1);
		dragging = false;
		dragX = 0;
	}
	function key(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') go(index + 1);
		if (e.key === 'ArrowLeft') go(index - 1);
	}
</script>

<div class="carousel" role="region" aria-roledescription="carousel" aria-label="Why Agent Catalog">
	<div
		class="viewport"
		bind:this={viewport}
		class:dragging
		role="slider"
		tabindex="0"
		aria-valuemin={1}
		aria-valuemax={SLIDES.length}
		aria-valuenow={index + 1}
		aria-valuetext={SLIDES[index].title}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
		onkeydown={key}
		onclickcapture={(e) => moved && e.preventDefault()}
	>
		<div class="track" style:--i={index} style:--dx="{dragX}px">
			{#each SLIDES as s, i (i)}
				<article
					class="slide {s.tone}"
					class:active={i === index}
					aria-hidden={i !== index}
					aria-label="{i + 1} of {SLIDES.length}"
				>
					<span class="tag">{s.tag}</span>
					<div class="big">
						{s.big}{#if s.unit}<small>{s.unit}</small>{/if}
					</div>
					<h3>{s.title}</h3>
					<p>{s.body}</p>
				</article>
			{/each}
		</div>
	</div>
	<div class="controls">
		<button type="button" aria-label="Previous" disabled={index === 0} onclick={() => go(index - 1)}
			>←</button
		>
		<div class="dots">
			{#each SLIDES as slide, i (i)}
				<button
					type="button"
					class:on={i === index}
					aria-label="Slide {i + 1}: {slide.title}"
					onclick={() => go(i)}
				></button>
			{/each}
		</div>
		<button
			type="button"
			aria-label="Next"
			disabled={index === SLIDES.length - 1}
			onclick={() => go(index + 1)}>→</button
		>
		<span class="hint">Drag to explore</span>
	</div>
</div>

<style>
	.carousel {
		--w: min(620px, 82vw);
		--gap: 18px;
	}
	.viewport {
		overflow: hidden;
		cursor: grab;
		touch-action: pan-y;
		user-select: none;
		padding: 8px 0 4px;
		mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
	}
	.viewport.dragging {
		cursor: grabbing;
	}
	.viewport:focus-visible {
		outline: none;
	}
	.track {
		display: flex;
		gap: var(--gap);
		/* centre the active slide, follow the pointer while dragging */
		transform: translateX(
			calc(50% - var(--w) / 2 - var(--i) * (var(--w) + var(--gap)) + var(--dx))
		);
		transition: transform 0.55s cubic-bezier(0.2, 0.8, 0.2, 1);
		width: 100%;
	}
	.dragging .track {
		transition: none;
	}
	.slide {
		flex: none;
		width: var(--w);
		min-height: 260px;
		padding: clamp(24px, 3.4vw, 36px);
		border-radius: var(--radius-lg);
		border: 1px solid var(--line);
		background: var(--glass);
		display: flex;
		flex-direction: column;
		gap: 10px;
		opacity: 0.35;
		transform: scale(0.94);
		transition:
			opacity 0.45s,
			transform 0.45s,
			border-color 0.45s;
	}
	.slide.active {
		opacity: 1;
		transform: none;
		border-color: var(--line-strong);
	}
	.slide.now.active {
		border-color: var(--brand-line);
		background:
			radial-gradient(120% 120% at 0% 0%, rgba(31, 75, 255, 0.22), transparent 60%), var(--glass-2);
		box-shadow: 0 24px 60px -30px rgba(31, 75, 255, 0.8);
	}
	.tag {
		font: 600 11px var(--mono);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.now .tag {
		color: var(--brand-2);
	}
	.big {
		font-size: clamp(36px, 6vw, 64px);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		margin: 6px 0 4px;
	}
	.big small {
		font-size: 0.4em;
		font-weight: 600;
		margin-left: 10px;
		color: var(--muted);
		letter-spacing: 0;
	}
	.web .big {
		color: var(--web);
	}
	.now .big {
		color: var(--ink);
	}
	.pay .big {
		color: var(--amber);
	}
	.past .big,
	.mid .big {
		color: var(--muted);
	}
	h3 {
		font-size: 20px;
		font-weight: 700;
	}
	.slide p {
		color: var(--muted);
		font-size: 15.5px;
		line-height: 1.55;
	}
	.controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 14px;
		margin-top: 18px;
	}
	.controls > button {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		border: 1px solid var(--line-strong);
		background: var(--glass);
		color: var(--ink);
		font-size: 16px;
		cursor: pointer;
	}
	.controls > button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.dots {
		display: flex;
		gap: 8px;
	}
	.dots button {
		width: 8px;
		height: 8px;
		padding: 0;
		border-radius: 999px;
		border: 0;
		background: var(--line-strong);
		cursor: pointer;
		transition:
			width 0.3s,
			background 0.3s;
	}
	.dots button.on {
		width: 24px;
		background: var(--brand-2);
	}
	.hint {
		font: 500 11px var(--mono);
		color: var(--muted-2);
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}
	@media (prefers-reduced-motion: reduce) {
		.track,
		.slide {
			transition: none;
		}
	}
</style>
