<script lang="ts">
	import '#lib/demo/theme.css';
	import TopNav from '#lib/demo/TopNav.svelte';
	import PricingTiers from '#lib/demo/PricingTiers.svelte';
	import PaySection from '#lib/demo/sections/PaySection.svelte';
	import SiteFooter from '#lib/demo/SiteFooter.svelte';
	import SearchDock from '#lib/demo/SearchDock.svelte';
</script>

<svelte:head><title>Pricing · Agent Catalog</title></svelte:head>

<TopNav />

<main class="pricing">
	<header class="head">
		<span class="eyebrow">Pricing</span>
		<h1>Free to start. Pay for volume.</h1>
		<p>
			Every agent gets a free monthly quota. Bulk searching beyond it is billed per call, with an
			API key or with a wallet and x402.
		</p>
	</header>
	<PricingTiers />
	<PaySection />
</main>

<SearchDock />
<SiteFooter />

<style>
	.pricing {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: clamp(48px, 8vw, 96px) 24px;
	}
	.head {
		text-align: center;
		max-width: 680px;
		margin: 0 auto clamp(40px, 6vw, 64px);
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h1 {
		font-size: clamp(32px, 5vw, 54px);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.05;
	}
	.head p {
		color: var(--muted);
		font-size: 18px;
		line-height: 1.6;
	}
</style>
