<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import GoogleSignIn from '#lib/GoogleSignIn.svelte';
	import { resolve } from '$app/paths';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

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
