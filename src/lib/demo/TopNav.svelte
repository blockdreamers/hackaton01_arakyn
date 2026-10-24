<script lang="ts">
	// Header for pages other than the home hero (pricing, account).
	import { page } from '$app/state';

	const LINKS = [
		['/#race', 'Token race'],
		['/#monitor', 'Data monitor'],
		['/pricing', 'Pricing']
	];
</script>

<nav class="top">
	<a class="brand" href="/"
		><img src="/brand/logo-white.png" alt="Agent Catalog" width="150" height="25" /></a
	>
	<div class="links">
		{#each LINKS as [href, label] (href)}
			<a {href} aria-current={page.url.pathname === href ? 'page' : undefined}>{label}</a>
		{/each}
	</div>
	<a class="cta" href={page.data.user ? '/account' : '/?login=1'}
		>{page.data.user ? 'My account' : 'Log in'}</a
	>
</nav>

<style>
	.top {
		position: sticky;
		top: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px clamp(16px, 4vw, 40px);
		background: rgba(4, 6, 15, 0.85);
		backdrop-filter: blur(14px);
		border-bottom: 1px solid var(--line);
	}
	.brand img {
		display: block;
		height: 25px;
		width: auto;
	}
	.links {
		display: flex;
		gap: 28px;
		font-size: 14px;
		color: #d1d5db;
	}
	.links a:hover,
	.links a[aria-current='page'] {
		color: #fff;
	}
	.links a[aria-current='page'] {
		box-shadow: 0 2px 0 var(--brand-2);
	}
	.cta {
		font-size: 14px;
		font-weight: 500;
		padding: 9px 18px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
	}
	.cta:hover {
		background: rgba(255, 255, 255, 0.1);
	}
	@media (max-width: 640px) {
		.links {
			display: none;
		}
	}
</style>
