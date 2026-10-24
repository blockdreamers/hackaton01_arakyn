<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import GoogleSignIn from '#lib/GoogleSignIn.svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// The four demo screens draw their own full-bleed chrome.
	const DEMO_ROUTES = new Set(['/', '/race', '/monitor', '/pay', '/account']);
	const demo = $derived(DEMO_ROUTES.has(page.route.id ?? ''));
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/brand/icon-blue.png" />
</svelte:head>

{#if demo}
	{@render children()}
{:else}
	<header>
		<a href={resolve('/')}><img src={favicon} alt="Agent Catalog" width="32" height="32" /></a>
		{#if data.user}
			<span>{data.user.name ?? data.user.email}</span>
			<form method="POST" action="/auth/logout"><button>로그아웃</button></form>
		{:else}
			<GoogleSignIn />
		{/if}
	</header>

	<main>
		{@render children()}
	</main>
{/if}
