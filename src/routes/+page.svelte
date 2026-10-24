<script lang="ts">
	import '#lib/demo/theme.css';
	import { page } from '$app/state';
	import LoginModal from '#lib/LoginModal.svelte';
	import { onMount } from 'svelte';
	import RollingNumber from '#lib/demo/RollingNumber.svelte';
	import RaceSection from '#lib/demo/sections/RaceSection.svelte';
	import MonitorSection from '#lib/demo/sections/MonitorSection.svelte';
	import SiteFooter from '#lib/demo/SiteFooter.svelte';
	import SearchDock from '#lib/demo/SearchDock.svelte';
	import EvolutionSlide from '#lib/demo/sections/EvolutionSlide.svelte';

	// Login popup; /account sends signed-out visitors here with ?login=1.
	let loginOpen = $state(page.url.searchParams.get('login') === '1');

	// Live counters from /api/stats: indexed records and searches served so far.
	let live = $state({ products: 0, sites: 0, searches: 0 });
	async function refreshStats() {
		try {
			const r = await fetch('/api/stats');
			if (r.ok) live = await r.json();
		} catch {
			// keep the last values
		}
	}

	const FEATURES_ALL = [
		{
			icon: 'workflow',
			title: 'Normalized specs',
			body: 'Thread, length, material, wattage: every listing mapped to one schema per category, in mm, W and USD per piece.'
		},
		{
			icon: 'analytics',
			title: 'Same part, one entry',
			body: 'DIN 912 and ISO 4762 resolve to the same screw, so agents compare every seller of a part instead of every spelling.'
		},
		{
			icon: 'shield',
			title: 'Verifiable offers',
			body: 'Each value carries its source URL, fetch time and a data hash, so the agent checks the data before it pays.'
		},
		{
			icon: 'bolt',
			title: 'Pay per call with x402',
			body: 'Search previews are free. Full offers cost a few cents in USDC, paid by the agent only when verification passes.'
		},
		{
			icon: 'leads',
			title: 'MCP native',
			body: 'Four tools over MCP or REST: resolve_spec, search_offers, get_offers_full, get_product. Plug in any agent.'
		},
		{
			icon: 'globe',
			title: 'Lightweight answers',
			body: 'Only decision fields: no scripts, reviews or banners. Hundreds of tokens instead of a hundred thousand.'
		}
	];
	const FEATURES = FEATURES_ALL.filter((f) =>
		['Normalized specs', 'Verifiable offers', 'Pay per call with x402'].includes(f.title)
	);

	onMount(() => {
		refreshStats();
		const statsTimer = setInterval(refreshStats, 5000);
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const els = document.querySelectorAll<HTMLElement>('[data-reveal]');
		let io: IntersectionObserver | undefined;
		if (reduce) els.forEach((e) => e.classList.add('in'));
		else {
			io = new IntersectionObserver(
				(entries) => {
					for (const en of entries) {
						if (en.isIntersecting) {
							en.target.classList.add('in');
							io?.unobserve(en.target);
						}
					}
				},
				{ threshold: 0.18, rootMargin: '0px 0px -8% 0px' }
			);
			els.forEach((e) => io!.observe(e));
		}

		return () => {
			clearInterval(statsTimer);
			io?.disconnect();
		};
	});
</script>

<svelte:head>
	<title>Agent Catalog · Source Smarter, Not Harder</title>
	<meta
		name="description"
		content="A catalog of buyable, standardized parts that AI agents can read, verify and pay for."
	/>
</svelte:head>

{#snippet icon(name: string)}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		{#if name === 'workflow'}
			<rect x="3" y="3" width="6" height="6" rx="1.5" /><rect
				x="15"
				y="15"
				width="6"
				height="6"
				rx="1.5"
			/><path d="M6 9v3a3 3 0 0 0 3 3h3" />
		{:else if name === 'analytics'}
			<path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16v-4" /><path d="M13 16V8" /><path
				d="M18 16v-7"
			/>
		{:else if name === 'leads'}
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path
				d="M22 21v-2a4 4 0 0 0-3-3.87"
			/><path d="M16 3.13a4 4 0 0 1 0 7.75" />
		{:else if name === 'shield'}
			<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" />
		{:else if name === 'bolt'}
			<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
		{:else if name === 'globe'}
			<circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path
				d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z"
			/>
		{:else if name === 'arrow'}
			<path d="M5 12h14" style="stroke-width:2" /><path d="m12 5 7 7-7 7" style="stroke-width:2" />
		{:else if name === 'search'}
			<circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
		{/if}
	</svg>
{/snippet}

{#snippet roll(text: string)}
	<span class="roll"
		><span class="roll-a">{text}</span><span class="roll-b" aria-hidden="true">{text}</span></span
	>
{/snippet}

<LoginModal bind:open={loginOpen} />

<div class="page" id="top">
	<header class="hero">
		<video
			class="hero-video"
			src="https://cdn.jiro.build/BG%20effect%20for%20Tanvir/bg-video.mp4"
			autoplay
			loop
			muted
			playsinline
			aria-hidden="true"
		></video>
		<div class="hero-content">
			<nav class="nav">
				<a class="brand" href="#top"
					><img src="/brand/logo-white.png" alt="Agent Catalog" width="168" height="28" /></a
				>
				<div class="nav-links">
					{#each [['#race', 'Token race'], ['#monitor', 'Data monitor'], ['/pricing', 'Pricing']] as [href, label] (href)}
						<a class="roll-host" {href}>{@render roll(label)}</a>
					{/each}
				</div>
				<div class="auth">
					{#if page.data.user}
						<a class="roll-host nav-cta" href="/account">{@render roll('My account')}</a>
					{:else}
						<button class="roll-host login" type="button" onclick={() => (loginOpen = true)}
							>{@render roll('Log in')}</button
						>
						<button class="roll-host nav-cta" type="button" onclick={() => (loginOpen = true)}
							>{@render roll('Get API key')}</button
						>
					{/if}
				</div>
			</nav>
			<div class="hero-main">
				<div class="pill"><span class="dot"></span>Domain search for AI agents</div>
				<h1 class="hero-title">The Search Engine<br />Built for Agents</h1>
				<p class="hero-sub">
					A domain-specific search engine for AI agents. Find the right part fast, and spend a
					fraction of the tokens.
				</p>
				<div class="hero-actions">
					<a class="roll-host cta-primary" href="#race">{@render roll('Try a live search')}</a>
					<a class="roll-host cta-secondary" href="#monitor"
						>{@render roll('See the data monitor')} {@render icon('arrow')}</a
					>
				</div>
				<div class="counters">
					<div class="counter">
						<span class="cv"><RollingNumber value={live.products} /></span>
						<span class="cl"
							>products indexed · {live.sites} {live.sites === 1 ? 'source' : 'sources'}</span
						>
					</div>
					<div class="counter">
						<span class="cv"><RollingNumber value={live.searches} delay={150} /></span>
						<span class="cl">agent searches served</span>
					</div>
				</div>
			</div>
		</div>
	</header>

	<section class="section features" id="features">
		<div class="section-head">
			<span class="eyebrow" data-reveal>Search index for agents</span>
			<h2 data-reveal style="--rd:80ms">
				Web search is built for people. This is built for agents.
			</h2>
			<p data-reveal style="--rd:160ms">
				Shopping pages are made for people: scripts, reviews, banners and a different spelling of
				the same screw on every site. Agent Catalog keeps only what a buying decision needs.
			</p>
		</div>
		<div class="feature-grid">
			{#each FEATURES as f, i (f.title)}
				<article class="card" data-reveal style="--rd:{i * 90}ms">
					<div class="card-icon">{@render icon(f.icon)}</div>
					<h3>{f.title}</h3>
					<p>{f.body}</p>
				</article>
			{/each}
		</div>
		<EvolutionSlide />
	</section>

	<section class="demo-section" id="race">
		<RaceSection />
	</section>

	<section class="demo-section" id="monitor">
		<div class="demo-head">
			<span class="eyebrow">Data monitor</span>
			<h2>What happens inside the index when an agent searches</h2>
		</div>
		<MonitorSection />
	</section>

	<SearchDock />

	<SiteFooter />
</div>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
	:global([data-reveal]) {
		opacity: 0;
		transform: translateY(26px);
		transition:
			opacity 0.7s cubic-bezier(0.22, 0.7, 0.2, 1),
			transform 0.7s cubic-bezier(0.22, 0.7, 0.2, 1);
		transition-delay: var(--rd, 0ms);
		will-change: opacity, transform;
	}
	:global([data-reveal].in) {
		opacity: 1;
		transform: none;
	}
	.page {
		position: relative;
		z-index: 1;
		transition: opacity 0.6s ease;
	}
	.section {
		position: relative;
		z-index: 1;
		max-width: var(--maxw);
		margin: 0 auto;
		padding: clamp(80px, 12vw, 160px) 24px;
	}
	.eyebrow {
		margin-bottom: 18px;
	}
	.section-head {
		max-width: 680px;
		margin: 0 auto clamp(48px, 6vw, 80px);
		text-align: center;
	}
	.section-head h2,
	.demo-head h2 {
		font-size: clamp(30px, 4.4vw, 50px);
		font-weight: 800;
		line-height: 1.05;
		letter-spacing: -0.02em;
		text-shadow: 0 2px 40px rgba(0, 0, 0, 0.6);
	}
	.section-head p {
		margin-top: 18px;
		color: var(--muted);
		font-size: 18px;
		line-height: 1.65;
		text-shadow: 0 1px 24px rgba(0, 0, 0, 0.55);
	}
	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* Hero: looping video background with roll-up hover labels (ZiroBuild style). */
	.hero {
		position: relative;
		min-height: 100vh;
		width: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: #000;
	}
	.hero-video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: 0;
	}
	.hero-content {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}
	.nav {
		width: 100%;
		max-width: 1000px;
		margin: 0 auto;
		padding: 24px 32px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
	}
	.brand {
		font-size: 22px;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.nav-links {
		display: flex;
		gap: 32px;
		font-size: 14px;
		font-weight: 500;
		color: #d1d5db;
	}
	.auth {
		display: flex;
		align-items: center;
		gap: 24px;
		font-size: 14px;
		font-weight: 500;
	}
	.login {
		color: #d1d5db;
	}
	.nav-links a:hover,
	.login:hover {
		color: #fff;
	}
	.auth button {
		background: none;
		border: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	.auth button.login {
		color: #d1d5db;
	}
	.auth button.login:hover {
		color: #fff;
	}
	.auth button.nav-cta {
		border: 1px solid rgba(255, 255, 255, 0.2);
	}
	.nav-cta {
		padding: 10px 20px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		transition: background 0.2s;
	}
	.nav-cta:hover {
		background: rgba(255, 255, 255, 0.1);
	}
	.roll-host {
		transition: color 0.2s;
	}
	.roll {
		position: relative;
		overflow: hidden;
		display: inline-flex;
	}
	.roll-a,
	.roll-b {
		white-space: nowrap;
		transition: transform 0.5s ease-in-out;
	}
	.roll-b {
		position: absolute;
		inset: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		transform: translateY(120%);
	}
	.roll-host:hover .roll-a {
		transform: translateY(-120%);
	}
	.roll-host:hover .roll-b {
		transform: translateY(0);
	}
	.hero-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		width: 100%;
		max-width: 1024px;
		margin: 0 auto;
		padding: 0 16px 64px 17px;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(12px);
		font-size: 12px;
		font-weight: 500;
		color: #e5e7eb;
		margin-bottom: 24px;
	}
	.pill .dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
	}
	.hero-title {
		font-size: clamp(40px, 6.6vw, 80px);
		line-height: 1.1;
		font-weight: 500;
		letter-spacing: -0.03em;
		margin-bottom: 20px;
	}
	.hero-sub {
		text-shadow: 0 1px 18px rgba(0, 0, 0, 0.75);
		font-size: 18px;
		line-height: 26px;
		font-weight: 300;
		color: #d1d5db;
		max-width: 672px;
		margin-bottom: 32px;
	}
	.hero-actions {
		display: flex;
		gap: 16px;
		justify-content: center;
		flex-wrap: wrap;
	}
	.cta-primary,
	.cta-secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 16px 32px;
		border-radius: 8px;
		font-size: 15px;
		transition: background 0.2s;
	}
	.cta-primary {
		background: #fff;
		color: #000;
		font-weight: 600;
	}
	.cta-primary:hover {
		background: #f3f4f6;
	}
	.cta-secondary {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.3);
		backdrop-filter: blur(12px);
		font-weight: 500;
	}
	.cta-secondary:hover {
		background: rgba(255, 255, 255, 0.2);
	}
	.cta-secondary svg {
		width: 16px;
		height: 16px;
	}
	.counters {
		display: flex;
		justify-content: center;
		gap: clamp(16px, 4vw, 40px);
		flex-wrap: wrap;
		margin-top: 48px;
	}
	.counter {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 14px 26px;
		border-radius: var(--radius);
		background: var(--glass);
		border: 1px solid var(--line);
		backdrop-filter: blur(14px);
	}
	.cv {
		font: 700 clamp(26px, 3.4vw, 38px) var(--mono);
		color: var(--accent);
	}
	.cl {
		font-size: 13px;
		color: var(--muted);
	}

	.demo-section {
		position: relative;
		z-index: 1;
		scroll-margin-top: 0;
		padding-top: clamp(40px, 6vw, 72px);
		border-top: 1px solid var(--line);
	}
	.demo-head {
		max-width: 1280px;
		margin: 0 auto 8px;
		padding: 0 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.feature-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 18px;
	}
	.card {
		position: relative;
		padding: 30px;
		border-radius: var(--radius);
		background: var(--glass);
		border: 1px solid var(--line);
		backdrop-filter: blur(14px);
		overflow: hidden;
		transition:
			transform 0.25s,
			border-color 0.25s,
			background 0.25s,
			opacity 0.7s cubic-bezier(0.22, 0.7, 0.2, 1);
	}
	.card::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(120% 120% at 0% 0%, rgba(93, 240, 168, 0.08), transparent 45%);
		opacity: 0;
		transition: opacity 0.3s;
		pointer-events: none;
	}
	.card:hover {
		transform: translateY(-4px);
		border-color: var(--line-strong);
		background: var(--glass-2);
	}
	.card:hover::before {
		opacity: 1;
	}
	.card-icon {
		width: 46px;
		height: 46px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		color: var(--accent);
		background: rgba(93, 240, 168, 0.1);
		border: 1px solid var(--line-strong);
		margin-bottom: 20px;
	}
	.card-icon svg {
		width: 22px;
		height: 22px;
	}
	.card h3 {
		font-size: 19px;
		font-weight: 700;
		margin-bottom: 10px;
	}
	.card p {
		font-size: 15px;
		line-height: 1.6;
		color: var(--muted);
	}

	.brand img {
		display: block;
		height: 28px;
		width: auto;
	}

	/* sit above the visual centre so the copy clears the bright ring */
	@media (min-width: 721px) {
		.hero-main {
			transform: translateY(-9vh);
		}
	}
	@media (max-width: 980px) {
		.feature-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 720px) {
		.nav-links {
			display: none;
		}
		.nav {
			padding: 18px 20px;
		}
		.section {
			padding: clamp(64px, 16vw, 110px) 20px;
		}
	}
	@media (max-width: 560px) {
		.feature-grid {
			grid-template-columns: 1fr;
		}
		.hero-actions {
			flex-direction: column;
			width: 100%;
		}
		.auth .login {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(html) {
			scroll-behavior: auto;
		}
		:global([data-reveal]) {
			transition: none;
		}
	}
</style>
