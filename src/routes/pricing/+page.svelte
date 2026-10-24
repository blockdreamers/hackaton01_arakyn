<script lang="ts">
	import '#lib/demo/theme.css';
	import TopNav from '#lib/demo/TopNav.svelte';
	import PricingTiers from '#lib/demo/PricingTiers.svelte';
	import PaySection from '#lib/demo/sections/PaySection.svelte';
	import SiteFooter from '#lib/demo/SiteFooter.svelte';
	import SearchDock from '#lib/demo/SearchDock.svelte';
	import { t } from '#lib/demo/i18n.svelte.ts';
</script>

<svelte:head><title>{t('Pricing', '요금')} · Agent Catalog</title></svelte:head>

<TopNav />

<main class="pricing">
	<header class="head">
		<h1>{t('Free to start. Pay for volume.', '무료로 시작하고, 쓴 만큼만 내세요.')}</h1>
		<p>
			{t(
				'Every agent gets a free monthly quota. Bulk searching beyond it is billed per call, with an API key or with a wallet and x402.',
				'모든 에이전트에게 매월 무료 한도가 주어집니다. 한도를 넘는 대량 검색은 호출당 과금되며, API 키 또는 지갑과 x402로 결제할 수 있습니다.'
			)}
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
