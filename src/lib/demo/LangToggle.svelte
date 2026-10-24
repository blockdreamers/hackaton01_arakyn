<script lang="ts">
	// EN / 한국어 switch for the top-right of every public header.
	import { i18n, setLang, type Lang } from './i18n.svelte.ts';

	const OPTIONS: [Lang, string][] = [
		['en', 'EN'],
		['ko', '한국어']
	];
</script>

<div class="lang" role="group" aria-label="Language">
	{#each OPTIONS as [code, label] (code)}
		<button
			type="button"
			class:on={i18n.lang === code}
			aria-pressed={i18n.lang === code}
			onclick={() => setLang(code)}>{label}</button
		>
	{/each}
</div>

<style>
	.lang {
		display: inline-flex;
		padding: 3px;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(8, 12, 28, 0.55);
		backdrop-filter: blur(12px);
	}
	button {
		border: 0;
		background: none;
		color: #9aa6c4;
		font: 600 12px var(--font);
		padding: 5px 11px;
		border-radius: 999px;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}
	button:hover {
		color: #fff;
	}
	button.on {
		background: var(--brand);
		color: #fff;
	}
</style>
