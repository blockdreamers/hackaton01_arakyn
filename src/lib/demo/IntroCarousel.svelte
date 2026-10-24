<script lang="ts">
	// The "why" in one compact strip: drag (mouse or touch) or use the arrows to move between
	// one-idea slides. The neighbouring slides peek in so it reads as something to drag.
	import { t } from './i18n.svelte.ts';

	const SLIDES = $derived([
		{
			tag: t('The problem', '문제'),
			big: '80,000',
			unit: t('tokens / page', '토큰 / 페이지'),
			title: t('Websites are built for people', '웹사이트는 사람을 위해 만들어졌습니다'),
			body: t(
				'When an AI reads a shop page, it pays for images, CSS, scripts and banners. The spec it needs is a few lines.',
				'AI가 쇼핑몰 페이지를 읽으면 이미지, CSS, 스크립트, 배너까지 모두 토큰으로 냅니다. 정작 필요한 스펙은 몇 줄뿐인데요.'
			),
			tone: 'web'
		},
		{
			tag: '01',
			big: 'Google',
			unit: '',
			title: t('A search engine for people', '사람을 위한 검색엔진'),
			body: t(
				'Links to pages. A person reads them and decides.',
				'페이지 링크를 보여주고, 읽고 판단하는 건 사람의 몫입니다.'
			),
			tone: 'past'
		},
		{
			tag: '02',
			big: 'Exa',
			unit: t('index', '인덱스'),
			title: t('A search engine for agents', '에이전트를 위한 검색엔진'),
			body: t(
				'Clean text from the whole web. Agents still read, compare and convert units themselves.',
				'웹 전체에서 깔끔한 텍스트를 가져옵니다. 하지만 읽고, 비교하고, 단위를 맞추는 일은 여전히 에이전트가 직접 해야 합니다.'
			),
			tone: 'mid'
		},
		{
			tag: '03',
			big: 'Agent Catalog',
			unit: '',
			title: t('A search engine for one domain', '하나의 도메인을 위한 검색엔진'),
			body: t(
				'Standard manufacturing parts and commodities, normalized and compared across sellers. Agents find the right part in about 1,000 tokens.',
				'표준 제조 부품과 소모품을 판매처별로 정규화해 비교합니다. 에이전트는 약 1,000토큰이면 맞는 부품을 찾습니다.'
			),
			tone: 'now'
		}
	]);

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

<div
	class="carousel"
	role="region"
	aria-roledescription="carousel"
	aria-label={t('Why Agent Catalog', '왜 Agent Catalog인가')}
>
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
					aria-label={t(`${i + 1} of ${SLIDES.length}`, `${SLIDES.length}개 중 ${i + 1}번째`)}
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
		<button
			type="button"
			aria-label={t('Previous', '이전')}
			disabled={index === 0}
			onclick={() => go(index - 1)}>←</button
		>
		<div class="dots">
			{#each SLIDES as slide, i (i)}
				<button
					type="button"
					class:on={i === index}
					aria-label={t(`Slide ${i + 1}: ${slide.title}`, `${i + 1}번 슬라이드: ${slide.title}`)}
					onclick={() => go(i)}
				></button>
			{/each}
		</div>
		<button
			type="button"
			aria-label={t('Next', '다음')}
			disabled={index === SLIDES.length - 1}
			onclick={() => go(index + 1)}>→</button
		>
		<span class="hint">{t('Drag to explore', '드래그해서 넘겨보세요')}</span>
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
