<script lang="ts">
	// A ready question shown in light grey inside an empty search box; one click runs it. The same
	// preset shows in every box on the page (race, data monitor, dock) and rotates after each use.
	// Presets have matching products in the DB and replay a recorded real run, so a click is free.
	import { demo } from './demo-state.svelte.ts';
	import { t } from './i18n.svelte.ts';
	import { PRESETS, type Preset } from './presets.ts';

	interface Props {
		onpick: (p: Preset) => void;
		multiline?: boolean;
		size?: number;
	}
	let { onpick, multiline = false, size = 16 }: Props = $props();

	const preset = $derived(PRESETS[demo.suggestIdx % PRESETS.length]);
	function pick() {
		const p = preset;
		demo.suggestIdx++;
		onpick(p);
	}
</script>

<button
	type="button"
	class="ghost"
	class:multi={multiline}
	style:font-size="{size}px"
	onclick={pick}
	title={t(
		'Run this example search (replays a recorded real run)',
		'예시 검색 실행 (녹화된 실제 실행을 재생합니다)'
	)}
>
	<span class="ghost-q">{preset.question}</span>
	<span class="ghost-k">{t('click to search ↵', '클릭해서 검색 ↵')}</span>
</button>

<style>
	.ghost {
		position: absolute;
		left: 0;
		top: 50%;
		transform: translateY(-50%);
		max-width: 100%;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 0;
		border: 0;
		background: none;
		font-family: var(--font);
		color: var(--muted-2);
		cursor: pointer;
		text-align: left;
	}
	.ghost-q {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		transition: color 0.15s;
	}
	/* in a textarea: wrap the question and let the chip follow it */
	.ghost.multi {
		top: 12px;
		left: 14px;
		right: 14px;
		transform: none;
		display: block;
		line-height: 1.5;
		color: #9ca3af;
	}
	.multi .ghost-q {
		white-space: normal;
	}
	.multi .ghost-k {
		display: inline-block;
		margin-left: 6px;
		vertical-align: 1px;
	}
	.ghost-k {
		flex: none;
		font: 600 11px var(--mono);
		color: var(--brand-2);
		padding: 3px 8px;
		border-radius: 999px;
		border: 1px solid var(--line-strong);
		opacity: 0.85;
		transition: opacity 0.15s;
	}
	.ghost:hover .ghost-q {
		color: var(--ink);
	}
	.ghost.multi:hover .ghost-q {
		color: #111827;
	}
	.ghost:hover .ghost-k {
		opacity: 1;
	}
</style>
