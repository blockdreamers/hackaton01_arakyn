<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { GOOGLE_CLIENT_ID } from '$app/env/public';

	let button = $state<HTMLDivElement>();
	let loaded = $state(typeof window !== 'undefined' && 'google' in window);

	async function onCredential({ credential }: google.accounts.id.CredentialResponse) {
		const res = await fetch('/auth/google', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ credential })
		});
		if (res.ok) await goto(resolve('/dashboard'), { invalidateAll: true });
		else alert('로그인에 실패했습니다.');
	}

	$effect(() => {
		if (!loaded || !button || !GOOGLE_CLIENT_ID) return;
		google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onCredential });
		google.accounts.id.renderButton(button, { type: 'standard', size: 'medium' });
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
