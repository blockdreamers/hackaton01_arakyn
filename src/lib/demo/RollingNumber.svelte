<script lang="ts">
	// Slot-machine counter for the landing page: every digit reel spins from 0 and decelerates
	// into place, lower digits spinning more laps and settling last. Starts when scrolled into view
	// and re-rolls whenever the value changes.

	interface Props {
		value: string | number;
		duration?: number;
		delay?: number;
	}

	let { value, duration = 2600, delay = 0 }: Props = $props();

	const LAPS = 8;
	const text = $derived(typeof value === 'number' ? value.toLocaleString('en-US') : value);

	let el = $state<HTMLSpanElement>();
	let visible = $state(false);
	let rolled = $state(false);
	let animate = $state(false);

	$effect(() => {
		if (!el) return;
		const io = new IntersectionObserver(
			([e]) => {
				if (e.isIntersecting) {
					visible = true;
					io.disconnect();
				}
			},
			{ threshold: 0.4 }
		);
		io.observe(el);
		return () => io.disconnect();
	});

	// On every new text (and once visible): snap reels to 0 without a transition, then on the next
	// frames turn the transition on and send them to their target lap.
	$effect(() => {
		void text;
		if (!visible) return;
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		animate = false;
		rolled = false;
		if (reduce) {
			rolled = true;
			return;
		}
		let r1 = 0;
		let r2 = 0;
		r1 = requestAnimationFrame(() => {
			r2 = requestAnimationFrame(() => {
				animate = true;
				rolled = true;
			});
		});
		return () => {
			cancelAnimationFrame(r1);
			cancelAnimationFrame(r2);
		};
	});

	const cells = $derived.by(() => {
		const chars = text.split('');
		const digits = chars.filter((c) => /\d/.test(c)).length;
		let di = 0;
		return chars.map((c) => {
			if (!/\d/.test(c)) return { c, digit: false, laps: 0, rank: 0 };
			const fromRight = digits - 1 - di++;
			// rightmost digit spins the most laps; leftmost the fewest
			return { c, digit: true, laps: Math.max(1, LAPS - 1 - fromRight * 2), rank: fromRight };
		});
	});
</script>

<span class="rn" bind:this={el} aria-label={text}>
	{#each cells as cell, i (i + ':' + text.length)}
		{#if cell.digit}
			<span class="cell" aria-hidden="true">
				<span
					class="reel"
					style:transform={`translateY(${rolled ? -((cell.laps * 10 + Number(cell.c)) * 100) / (LAPS * 10) : 0}%)`}
					style:transition-duration={animate ? `${duration - cell.rank * 260}ms` : '0ms'}
					style:transition-delay={animate ? `${delay}ms` : '0ms'}
				>
					{#each Array(LAPS * 10) as _, k (k)}<span>{k % 10}</span>{/each}
				</span>
			</span>
		{:else}
			<span class="fix" aria-hidden="true">{cell.c}</span>
		{/if}
	{/each}
</span>

<style>
	.rn {
		display: inline-flex;
		align-items: baseline;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	.cell {
		display: inline-block;
		height: 1em;
		overflow: hidden;
		width: 0.62em;
	}
	.reel {
		display: flex;
		flex-direction: column;
		transition-property: transform;
		/* fast start, long slow settle */
		transition-timing-function: cubic-bezier(0.08, 0.82, 0.17, 1);
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
