<script lang="ts">
	import GoogleSignIn from '#lib/GoogleSignIn.svelte';
	import { t } from '#lib/demo/i18n.svelte.ts';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	let dialog = $state<HTMLDialogElement>();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	class="login"
	onclose={() => (open = false)}
	onclick={(e) => {
		if (e.target === dialog) open = false;
	}}
>
	<div class="box">
		<button class="x" type="button" aria-label={t('Close', '닫기')} onclick={() => (open = false)}
			>×</button
		>
		<img src="/brand/logo-white.png" alt="Agent Catalog" width="168" height="28" />
		<h2>{t('Sign in to Agent Catalog', 'Agent Catalog에 로그인')}</h2>
		<p>
			{t(
				'Get an API key, connect an agent wallet and see every call your agents make.',
				'API 키를 발급받고, 에이전트 지갑을 연결하고, 에이전트의 모든 호출을 확인하세요.'
			)}
		</p>
		{#if open}
			<div class="gsi"><GoogleSignIn next="/account" /></div>
		{/if}
		<ul>
			<li>{t('Free quota: 1,000 calls / month (example)', '무료 한도: 월 1,000회 (예시)')}</li>
			<li>
				{t('No account needed for wallet + x402 calls', '지갑 + x402 호출은 계정 없이 사용 가능')}
			</li>
		</ul>
	</div>
</dialog>

<style>
	.login {
		margin: auto;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--ink);
		max-width: calc(100vw - 32px);
	}
	.login::backdrop {
		background: rgba(2, 4, 12, 0.72);
		backdrop-filter: blur(6px);
	}
	.box {
		position: relative;
		width: 400px;
		max-width: 100%;
		padding: 36px 32px 28px;
		border-radius: var(--radius-lg);
		background:
			radial-gradient(120% 120% at 50% 0%, rgba(31, 75, 255, 0.18), transparent 55%), var(--bg-2);
		border: 1px solid var(--line-strong);
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 14px;
	}
	.box img {
		height: 26px;
		width: auto;
	}
	h2 {
		font-size: 22px;
		font-weight: 700;
		margin-top: 8px;
	}
	p {
		color: var(--muted);
		font-size: 14.5px;
		line-height: 1.55;
	}
	.gsi {
		min-height: 44px;
		margin: 6px 0;
		display: flex;
		justify-content: center;
	}
	ul {
		list-style: none;
		font-size: 12.5px;
		color: var(--muted-2);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.x {
		position: absolute;
		top: 12px;
		right: 14px;
		background: none;
		border: 0;
		color: var(--muted);
		font-size: 22px;
		cursor: pointer;
	}
	.x:hover {
		color: var(--ink);
	}
</style>
