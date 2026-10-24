<script lang="ts">
	import { goto } from '$app/navigation';
	import { GOOGLE_CLIENT_ID } from '$app/env/public';

	let { next = '/account' }: { next?: string } = $props();

	let button = $state<HTMLDivElement>();
	let loaded = $state(typeof window !== 'undefined' && 'google' in window);

	async function onCredential({ credential }: google.accounts.id.CredentialResponse) {
		const res = await fetch('/auth/google', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ credential })
		});
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		if (res.ok) await goto(next, { invalidateAll: true });
		else alert('로그인에 실패했습니다.');
	}

	$effect(() => {
		if (!loaded || !button || !GOOGLE_CLIENT_ID) return;
		google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onCredential });
		google.accounts.id.renderButton(button, {
			type: 'standard',
			size: 'large',
			theme: 'filled_black',
			shape: 'pill',
			width: 280
		});
	});
</script>

<svelte:head>
	<script
		src="https://accounts.google.com/gsi/client"
		async
		onload={() => (loaded = true)}
	></script>
</svelte:head>

{#if GOOGLE_CLIENT_ID}
	<div bind:this={button}></div>
{:else}
	<span>GOOGLE_CLIENT_ID not set</span>
{/if}
