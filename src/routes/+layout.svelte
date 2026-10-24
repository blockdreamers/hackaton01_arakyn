<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import GoogleSignIn from '#lib/GoogleSignIn.svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';
	import { onMount } from 'svelte';
	import { initLang } from '#lib/demo/i18n.svelte.ts';

	let { data, children }: LayoutProps = $props();

	// The one-page demo and the account page draw their own full-bleed chrome.
	const DEMO_ROUTES = new Set(['/', '/race', '/monitor', '/pay', '/pricing', '/account']);
	const demo = $derived(DEMO_ROUTES.has(page.route.id ?? ''));

	// apply the saved EN / 한국어 choice
	onMount(initLang);
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
			{#if data.isAdmin}<a href={resolve('/nimda')}>관리자</a>{/if}
			<form method="POST" action="/auth/logout"><button>로그아웃</button></form>
		{:else}
			<GoogleSignIn />
		{/if}
	</header>

	<main>
		{@render children()}
	</main>
{/if}
