<script lang="ts">
	// ~300 real products from the live DB rolling past in three lanes. Hover pauses a lane;
	// every card links to the product page on its source site.
	interface Item {
		id: number;
		name: string;
		price: number;
		currency: string;
		image: string;
		url: string;
		site: string;
		dims: string[];
	}

	// embedded: no own heading or page padding, for use inside another panel
	let { embedded = false }: { embedded?: boolean } = $props();

	let items = $state<Item[]>([]);
	let failed = $state<Record<number, boolean>>({});

	$effect(() => {
		fetch('/api/products/showcase')
			.then((r) => (r.ok ? r.json() : []))
			.then((d: Item[]) => (items = d))
			.catch(() => {});
	});

	const lanes = $derived(
		[0, 1, 2].map((k) => items.filter((it, i) => i % 3 === k && !failed[it.id]))
	);

	const SYMBOL: Record<string, string> = { KRW: '₩', USD: '$', JPY: '¥', GBP: '£', EUR: '€' };
	const price = (it: Item) =>
		`${SYMBOL[it.currency] ?? ''}${it.price.toLocaleString('en-US', {
			maximumFractionDigits: it.currency === 'KRW' || it.currency === 'JPY' ? 0 : 2
		})}${SYMBOL[it.currency] ? '' : ' ' + it.currency}`;
</script>

<section class="showcase" class:embedded aria-label="Products in the index">
	{#if !embedded}<div class="head">
		<span class="eyebrow">Live from the index</span>
		<p>
			{items.length
				? `${items.length} real products, sampled across every source`
				: 'Loading products…'}
		</p>
	</div>
	{/if}
	<div class="box">
		{#each lanes as lane, li (li)}
			{#if lane.length}
				<div class="lane" style:--dur="{lane.length * (li === 1 ? 2.4 : 2)}s" class:rev={li === 1}>
					<!-- the list is rendered twice so the loop is seamless -->
					{#each [0, 1] as copy (copy)}
						<div class="track" aria-hidden={copy === 1}>
							{#each lane as it (it.id)}
								<a
									class="card"
									href={it.url}
									target="_blank"
									rel="noreferrer"
									tabindex={copy === 1 ? -1 : 0}
								>
									<span class="img"
										><img
											src={it.image}
											alt=""
											loading="lazy"
											referrerpolicy="no-referrer"
											onerror={() => (failed[it.id] = true)}
										/></span
									>
									<span class="info">
										<span class="name">{it.name}</span>
										<span class="dims">
											{#each it.dims as d, i (i)}<span>{d}</span>{/each}
										</span>
										<span class="row">
											<b>{price(it)}</b>
											<span class="site">{it.site}</span>
										</span>
									</span>
								</a>
							{/each}
						</div>
					{/each}
				</div>
			{/if}
		{/each}
	</div>
</section>

<style>
	.showcase {
		position: relative;
		z-index: 1;
		max-width: 1280px;
		margin: 0 auto;
		padding: clamp(32px, 5vw, 56px) 20px 0;
	}
	.showcase.embedded {
		padding: 0;
		max-width: none;
	}
	.embedded .box {
		border-radius: 12px;
		padding: 10px 0;
		gap: 10px;
	}
	.embedded .card {
		width: 260px;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 14px;
	}
	.head p {
		font-size: 14px;
		color: var(--muted);
	}
	.box {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px 0;
		border-radius: var(--radius-lg);
		border: 1px solid var(--line-strong);
		background: var(--glass);
		overflow: hidden;
		mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
	}
	.lane {
		display: flex;
		width: max-content;
		animation: roll var(--dur) linear infinite;
	}
	.lane.rev {
		animation-direction: reverse;
	}
	.lane:hover {
		animation-play-state: paused;
	}
	.track {
		display: flex;
		gap: 12px;
		padding-right: 12px;
	}
	@keyframes roll {
		to {
			transform: translateX(-50%);
		}
	}
	.card {
		display: flex;
		gap: 12px;
		width: 300px;
		padding: 10px;
		border-radius: 14px;
		border: 1px solid var(--line);
		background: rgba(4, 6, 15, 0.6);
		transition:
			border-color 0.2s,
			transform 0.2s;
	}
	.card:hover {
		border-color: var(--brand-line);
		transform: translateY(-2px);
	}
	.img {
		flex: none;
		width: 72px;
		height: 72px;
		border-radius: 10px;
		background: #fff;
		overflow: hidden;
		display: grid;
		place-items: center;
	}
	.img img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
		flex: 1;
	}
	.name {
		font-size: 13px;
		line-height: 1.35;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.dims {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
		min-height: 18px;
	}
	.dims span {
		font: 500 10.5px var(--mono);
		padding: 1px 6px;
		border-radius: 999px;
		border: 1px solid var(--line-strong);
		color: var(--cyan);
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
		margin-top: auto;
	}
	.row b {
		font: 700 14px var(--mono);
		color: var(--accent);
	}
	.site {
		font: 500 10.5px var(--mono);
		color: var(--muted-2);
		text-transform: uppercase;
	}
	@media (prefers-reduced-motion: reduce) {
		.lane {
			animation: none;
		}
		.box {
			overflow-x: auto;
		}
	}
</style>
