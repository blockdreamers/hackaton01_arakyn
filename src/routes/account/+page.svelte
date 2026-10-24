<script lang="ts">
	import '#lib/demo/theme.css';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageProps } from './$types';
	import LangToggle from '#lib/demo/LangToggle.svelte';
	import { t } from '#lib/demo/i18n.svelte.ts';

	let { data, form }: PageProps = $props();

	let open = $state<number | null>(null);
	let copied = $state(false);
	let walletMsg = $state('');
	let connecting = $state(false);

	const fmtTime = (d: Date | string | null) =>
		d
			? new Date(d).toLocaleString('ko-KR', {
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit'
				})
			: '–';
	const fmtDate = (d: Date | string | null) =>
		d
			? new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
			: '–';
	const num = (n: number) => n.toLocaleString('en-US');
	const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);

	type Eth = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

	async function connectWallet() {
		const eth = (window as unknown as { ethereum?: Eth }).ethereum;
		if (!eth) {
			walletMsg = t(
				'No browser wallet found. Install MetaMask or Coinbase Wallet and try again.',
				'브라우저 지갑을 찾을 수 없습니다. MetaMask나 Coinbase Wallet을 설치한 뒤 다시 시도하세요.'
			);
			return;
		}
		connecting = true;
		walletMsg = '';
		try {
			const [address] = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
			const r = await fetch(`/api/account/wallet?address=${address}`);
			if (!r.ok) throw new Error(await r.text());
			const { message } = await r.json();
			const signature = await eth.request({ method: 'personal_sign', params: [message, address] });
			const v = await fetch('/api/account/wallet', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ address, signature })
			});
			if (!v.ok)
				throw new Error(
					(await v.json().catch(() => null))?.message ??
						t('Verification failed', '검증에 실패했습니다')
				);
			walletMsg = t(
				'Wallet connected and signature verified.',
				'지갑이 연결되었고 서명이 검증되었습니다.'
			);
			await invalidateAll();
		} catch (err) {
			walletMsg = (err as Error).message;
		} finally {
			connecting = false;
		}
	}

	const s = $derived(data.summary);
</script>

<svelte:head><title>{t('My account', '내 계정')} · Agent Catalog</title></svelte:head>

<header class="bar">
	<a href="/" class="logo"
		><img src="/brand/logo-white.png" alt="Agent Catalog" width="150" height="25" /></a
	>
	<nav>
		<a href="/#race">{t('Token race', '토큰 레이스')}</a>
		<a href="/#monitor">{t('Data monitor', '데이터 모니터')}</a>
		<LangToggle />
		<form method="POST" action="/auth/logout">
			<button class="link">{t('Log out', '로그아웃')}</button>
		</form>
	</nav>
</header>

<main class="wrap">
	<div class="title">
		<h1>{t('API usage dashboard', 'API 사용 현황')}</h1>
	</div>

	<section class="tiles">
		<div class="tile">
			<span class="k">{t('Total calls', '총 호출')}</span><span class="v">{num(s.calls)}</span>
		</div>
		<div class="tile">
			<span class="k">{t('Tokens used', '사용 토큰')}</span><span class="v">{num(s.tokens)}</span>
		</div>
		<div class="tile">
			<span class="k">{t('USDC paid', '결제한 USDC')}</span><span class="v"
				>{s.paidUsdc.toFixed(2)}</span
			>
		</div>
		<div class="tile">
			<span class="k">{t('Verification pass rate', '검증 통과율')}</span>
			<span class="v">{s.passRate === null ? '–' : Math.round(s.passRate * 100) + '%'}</span>
		</div>
		<div class="tile">
			<span class="k">{t('Free quota this month', '이번 달 무료 한도')}</span>
			<span class="v">{num(s.quotaUsed)} <small>/ {num(s.quota)}</small></span>
			<span class="bar-track"
				><i style:width="{Math.min(100, (s.quotaUsed / s.quota) * 100)}%"></i></span
			>
		</div>
	</section>

	<div class="grid">
		<section class="card acct-card">
			<h2>{t('Account', '계정')}</h2>
			<div class="acct">
				{#if data.account.picture}
					<img
						src={data.account.picture}
						alt=""
						width="52"
						height="52"
						referrerpolicy="no-referrer"
					/>
				{/if}
				<div>
					<div class="name">{data.account.name ?? data.account.email}</div>
					<div class="muted">{data.account.email}</div>
				</div>
			</div>
			<dl>
				<dt>{t('Sign-in', '로그인')}</dt>
				<dd>Google · {data.account.googleSub}</dd>
				<dt>{t('Member since', '가입일')}</dt>
				<dd>{fmtDate(data.account.createdAt)}</dd>
				<dt>{t('Plan', '요금제')}</dt>
				<dd>
					{t('Free quota, then $0.02 per call (example)', '무료 한도 이후 호출당 $0.02 (예시)')}
				</dd>
			</dl>
		</section>

		<section class="card">
			<h2>{t('API keys', 'API 키')} <span class="tag">{t('Route 1', '방식 1')}</span></h2>
			<p class="muted small">
				{t(
					'Your agent sends this key with every call. Usage counts against the free monthly quota first, then bills per call.',
					'에이전트가 호출할 때마다 이 키를 함께 보냅니다. 매월 무료 한도를 먼저 쓰고, 이후에는 호출당 과금됩니다.'
				)}
			</p>
			<form method="POST" action="?/createKey" use:enhance class="row">
				<input
					name="name"
					placeholder={t('Key name, e.g. procurement-agent', '키 이름, 예: procurement-agent')}
					maxlength="60"
				/>
				<button class="btn btn-primary sm"
					>{t('Issue new key (replaces current)', '새 키 발급 (기존 키 대체)')}</button
				>
			</form>
			{#if form?.newKey}
				<div class="newkey">
					<p>
						{t(
							"Copy this key now. It won't be shown again.",
							'지금 이 키를 복사하세요. 다시 표시되지 않습니다.'
						)}
					</p>
					<code>{form.newKey}</code>
					<button
						class="btn btn-outline sm"
						type="button"
						onclick={async () => {
							await navigator.clipboard.writeText(form.newKey);
							copied = true;
						}}>{copied ? t('Copied', '복사됨') : t('Copy', '복사')}</button
					>
				</div>
			{/if}
			{#if data.keys.length}
				<ul class="list">
					{#each data.keys as k (k.id)}
						<li class:revoked={k.revokedAt}>
							<div>
								<b>{k.name}</b>
								<code>{k.prefix}…</code>
								<div class="muted small">
									{t('created', '생성')}
									{fmtDate(k.createdAt)} · {t('last used', '마지막 사용')}
									{fmtTime(k.lastUsedAt)}
								</div>
							</div>
							{#if k.revokedAt}
								<span class="badge">{t('revoked', '폐기됨')}</span>
							{:else}
								<form method="POST" action="?/revokeKey" use:enhance>
									<input type="hidden" name="id" value={k.id} />
									<button class="link danger">{t('Revoke', '폐기')}</button>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted small">
					{t('No keys yet. Send a key as', '아직 키가 없습니다. 키는 다음 형식으로 보내세요:')}
					<code>Authorization: Bearer …</code>.
				</p>
			{/if}
		</section>

		<section class="card">
			<h2>
				{t('Agent wallet', '에이전트 지갑')}
				<span class="tag">{t('Route 2', '방식 2')} · x402</span>
			</h2>
			<p class="muted small">
				{t(
					'Connect the wallet your agent pays from. You sign a message to prove you own it; no funds move. Network: Base Sepolia (testnet).',
					'에이전트가 결제에 쓰는 지갑을 연결하세요. 소유를 증명하는 메시지에 서명만 하며, 자금은 이동하지 않습니다. 네트워크: Base Sepolia (테스트넷).'
				)}
			</p>
			<button class="btn btn-primary sm" type="button" onclick={connectWallet} disabled={connecting}
				>{connecting
					? t('Waiting for wallet…', '지갑 응답 대기 중…')
					: t('Connect wallet', '지갑 연결')}</button
			>
			{#if walletMsg}<p class="muted small">{walletMsg}</p>{/if}
			{#if data.wallets.length}
				<ul class="list">
					{#each data.wallets as w (w.id)}
						<li>
							<div>
								<code title={w.address}>{short(w.address)}</code>
								<div class="muted small">
									{w.chain} · {w.verifiedAt
										? t('signature verified', '서명 검증됨')
										: t('not verified', '미검증')}
								</div>
							</div>
							<form method="POST" action="?/disconnectWallet" use:enhance>
								<input type="hidden" name="id" value={w.id} />
								<button class="link danger">{t('Disconnect', '연결 해제')}</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<section class="card">
		<h2>{t('Call history', '호출 기록')}</h2>
		<div class="tscroll">
			<table>
				<thead>
					<tr>
						<th>#</th>
						<th>{t('Request', '요청')}</th>
						<th>{t('Lane', '레인')}</th>
						<th>{t('Verification', '검증')}</th>
						<th>{t('Requested', '요청 시각')}</th>
						<th>{t('Received', '수신 시각')}</th>
						<th>{t('Paid', '결제')}</th>
						<th class="n">{t('Tokens in / out', '토큰 입력 / 출력')}</th>
						<th class="n">{t('Cost', '비용')}</th>
					</tr>
				</thead>
				<tbody>
					{#each data.calls as c (c.id)}
						<tr class="main" onclick={() => (open = open === c.id ? null : c.id)}>
							<td class="mono">{c.id}</td>
							<td class="q" title={c.query}>{c.query}</td>
							<td><span class="badge">{c.lane}</span> <span class="muted small">{c.mode}</span></td>
							<td><span class="badge {c.verifyResult}">{c.verifyResult}</span></td>
							<td class="mono small">{fmtTime(c.requestedAt)}</td>
							<td class="mono small">{fmtTime(c.receivedAt)}</td>
							<td class="mono small">
								{c.paidUsdc ? c.paidUsdc.toFixed(2) + ' USDC' : '–'}
								{#if c.paymentTx}<div class="muted">{short(c.paymentTx)}</div>{/if}
							</td>
							<td class="n mono">{num(c.inputTokens)} / {num(c.outputTokens)}</td>
							<td class="n mono">${c.costUsd.toFixed(4)}</td>
						</tr>
						{#if open === c.id}
							<tr class="detail">
								<td colspan="9">
									<div class="detail-grid">
										<div>
											<h3>{t('Extracted spec', '추출된 사양')}</h3>
											<pre>{JSON.stringify(c.spec, null, 2)}</pre>
										</div>
										<div>
											<h3>{t('Verification detail', '검증 상세')}</h3>
											<pre>{JSON.stringify(c.verifyDetail, null, 2)}</pre>
										</div>
									</div>
								</td>
							</tr>
						{/if}
					{:else}
						<tr>
							<td colspan="9" class="empty">
								{t(
									'No calls yet. Run a search from the search box on the home page.',
									'아직 호출이 없습니다. 홈 화면의 검색창에서 검색을 실행해 보세요.'
								)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="pager">
			{#if data.page > 1}<a class="btn btn-outline sm" href="?page={data.page - 1}"
					>← {t('Newer', '최신')}</a
				>{/if}
			<span class="muted small">{t('Page', '페이지')} {data.page}</span>
			{#if data.hasNext}<a class="btn btn-outline sm" href="?page={data.page + 1}"
					>{t('Older', '이전')} →</a
				>{/if}
		</div>
	</section>
</main>

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 14px 24px;
		background: rgba(4, 6, 15, 0.85);
		backdrop-filter: blur(14px);
		border-bottom: 1px solid var(--line);
	}
	.logo img {
		display: block;
		height: 24px;
		width: auto;
	}
	.bar nav {
		display: flex;
		align-items: center;
		gap: 22px;
		font-size: 14px;
		color: var(--muted);
	}
	.bar nav a:hover {
		color: var(--ink);
	}
	.wrap {
		max-width: 1280px;
		margin: 0 auto;
		padding: 36px 20px 80px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.title {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h1 {
		font-size: clamp(28px, 4vw, 40px);
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	h2 {
		font-size: 17px;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	h3 {
		font-size: 12px;
		color: var(--muted);
		font-weight: 600;
		margin-bottom: 6px;
	}
	.tag {
		font: 600 10.5px var(--mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--brand-2);
	}
	.warn {
		padding: 12px 16px;
		border-radius: 12px;
		border: 1px solid rgba(255, 210, 122, 0.4);
		color: var(--amber);
		font-size: 14px;
		background: rgba(255, 210, 122, 0.06);
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 14px;
	}
	.tile,
	.card {
		background: var(--glass);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		min-width: 0;
	}
	.tile {
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.tile .k {
		font-size: 12.5px;
		color: var(--muted);
	}
	.tile .v {
		font: 700 26px var(--mono);
	}
	.tile small {
		font-size: 13px;
		color: var(--muted-2);
	}
	.bar-track {
		height: 5px;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.07);
		overflow: hidden;
	}
	.bar-track i {
		display: block;
		height: 100%;
		background: var(--brand-2);
	}
	/* account strip across the top, then the two ways to pay side by side with room to breathe */
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 18px;
	}
	.card {
		padding: 24px 26px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.acct-card {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: minmax(240px, auto) minmax(0, 1fr);
		align-items: center;
		column-gap: 40px;
	}
	.acct-card h2 {
		grid-column: 1 / -1;
	}
	.acct-card dl {
		grid-template-columns: auto minmax(0, 1fr);
	}
	.grid > .card:not(.acct-card) {
		min-height: 300px;
	}
	.grid h2 {
		font-size: 19px;
		flex-wrap: wrap;
	}
	.acct {
		display: flex;
		gap: 14px;
		align-items: center;
	}
	.acct img {
		border-radius: 50%;
	}
	.name {
		font-weight: 700;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px 14px;
		font-size: 13.5px;
	}
	dt {
		color: var(--muted-2);
	}
	.muted {
		color: var(--muted);
	}
	.small {
		font-size: 12.5px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.row input {
		flex: 1 1 220px;
	}
	.row .sm {
		flex: none;
		white-space: nowrap;
	}
	input {
		flex: 1;
		min-width: 0;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		padding: 11px 14px;
		color: var(--ink);
		font: 14.5px var(--font);
	}
	.sm {
		padding: 11px 18px;
		font-size: 14px;
		align-self: flex-start;
	}
	.newkey {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border-radius: 12px;
		border: 1px solid var(--brand-line);
		background: rgba(31, 75, 255, 0.08);
		font-size: 13px;
	}
	code {
		font: 12.5px var(--mono);
		color: var(--cyan);
		overflow-wrap: anywhere;
	}
	.list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.list li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-radius: 10px;
		border: 1px solid var(--line);
		font-size: 13.5px;
	}
	.list li.revoked {
		opacity: 0.5;
	}
	.list b {
		margin-right: 8px;
	}
	.link {
		background: none;
		border: 0;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
	}
	.link:hover {
		color: var(--ink);
	}
	.link.danger:hover {
		color: var(--red);
	}
	.tscroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	th,
	td {
		text-align: left;
		padding: 9px 10px;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
		vertical-align: top;
	}
	th {
		font-size: 11.5px;
		font-weight: 600;
		color: var(--muted-2);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.n {
		text-align: right;
	}
	tr.main {
		cursor: pointer;
	}
	tr.main:hover td {
		background: rgba(61, 107, 255, 0.06);
	}
	td.q {
		max-width: 280px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.badge.pass {
		color: var(--accent);
		border-color: rgba(93, 240, 168, 0.4);
	}
	.badge.fail {
		color: var(--red);
		border-color: rgba(255, 107, 91, 0.4);
	}
	.detail td {
		white-space: normal;
		background: rgba(0, 0, 0, 0.2);
	}
	.detail-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	pre {
		font: 12px/1.5 var(--mono);
		color: var(--cyan);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.empty {
		text-align: center;
		color: var(--muted);
		padding: 28px;
	}
	.pager {
		display: flex;
		align-items: center;
		gap: 12px;
		justify-content: flex-end;
	}
	@media (max-width: 1000px) {
		.tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.grid {
			grid-template-columns: 1fr;
		}
		.acct-card {
			grid-template-columns: 1fr;
			row-gap: 16px;
		}
		.grid > .card:not(.acct-card) {
			min-height: 0;
		}
	}
	@media (max-width: 560px) {
		.bar nav a {
			display: none;
		}
		.detail-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
