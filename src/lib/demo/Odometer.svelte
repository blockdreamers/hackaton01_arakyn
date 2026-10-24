<script lang="ts">
	import { untrack } from 'svelte';

	// Rolling odometer: every digit is a vertical 0-9 reel. When the value changes, lower digits
	// spin through extra full turns so they move faster and further than the higher ones.

	interface Props {
		value: number;
		decimals?: number;
		prefix?: string;
		suffix?: string;
		separator?: boolean;
		duration?: number;
	}

	let {
		value,
		decimals = 0,
		prefix = '',
		suffix = '',
		separator = true,
		duration = 900
	}: Props = $props();

	const text = $derived.by(() => {
		const fixed = Math.max(0, value).toFixed(decimals);
		if (!separator) return fixed;
		const [int, frac] = fixed.split('.');
		const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		return frac ? `${withSep}.${frac}` : withSep;
	});

	// Reel position per character (0-29). Lower digits land on a later lap of the reel than the
	// one they left, so they visibly spin through more numbers.
	let turns = $state<number[]>([]);
	let prev = '';

	$effect(() => {
		const chars = text.split('');
		const turnsNow = untrack(() => turns);
		const digitsTotal = chars.filter((c) => /\d/.test(c)).length;
		const next: number[] = [];
		let di = 0;
		chars.forEach((c, i) => {
			if (!/\d/.test(c)) {
				next.push(0);
				return;
			}
			const fromRight = digitsTotal - 1 - di++;
			const old = turnsNow[i] ?? Number(c);
			const changed = prev[i] !== c || prev.length !== text.length;
			if (!changed) {
				next.push(old);
				return;
			}
			const lap = Math.floor(old / 10);
			const spin = fromRight <= 1 ? 2 : fromRight <= 3 ? 1 : 0;
			// alternate between laps so the reel always travels at least `spin` laps
			const targetLap = spin === 0 ? lap : lap >= 1 ? 0 : spin;
			next.push(targetLap * 10 + Number(c));
		});
		turns = next;
		prev = text;
	});

	const reduce =
		typeof window !== 'undefined' &&
		window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
</script>

<span class="odo" aria-label={`${prefix}${text}${suffix}`}>
	{#if prefix}<span class="fix" aria-hidden="true">{prefix}</span>{/if}
	{#each text.split('') as c, i (i + ':' + text.length)}
		{#if /\d/.test(c)}
			<span class="cell" aria-hidden="true">
				<span
					class="reel"
					style:transform={`translateY(${(-(turns[i] ?? Number(c)) * 100) / 30}%)`}
					style:transition-duration={reduce ? '0ms' : `${duration + (text.length - i) * 40}ms`}
				>
					{#each Array(30) as _, k (k)}<span>{k % 10}</span>{/each}
				</span>
			</span>
		{:else}
			<span class="fix" aria-hidden="true">{c}</span>
		{/if}
	{/each}
	{#if suffix}<span class="fix" aria-hidden="true">{suffix}</span>{/if}
</span>

<style>
	.odo {
		display: inline-flex;
		align-items: baseline;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	.cell {
		display: inline-block;
		height: 1em;
		overflow: hidden;
		position: relative;
		width: 0.62em;
	}
	.reel {
		display: flex;
		flex-direction: column;
		transition-property: transform;
		transition-timing-function: cubic-bezier(0.16, 0.84, 0.24, 1);
	}
	.reel span {
		height: 1em;
		line-height: 1;
		text-align: center;
	}
	.fix {
		display: inline-block;
	}
</style>
