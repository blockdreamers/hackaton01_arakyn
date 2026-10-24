<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h1>대시보드</h1>
<p>{data.user?.email}</p>

<h2>사이트</h2>
<table>
	<thead>
		<tr><th>사이트</th><th>국가</th><th>통화</th><th>상품 수</th></tr>
	</thead>
	<tbody>
		{#each data.siteStats as s (s.code)}
			<tr
				><td>{s.name} ({s.code})</td><td>{s.country}</td><td>{s.currency}</td><td>{s.products}</td
				></tr
			>
		{/each}
	</tbody>
</table>

<form method="POST" action="?/scrape" use:enhance>
	<input type="hidden" name="site" value="iaansci" />
	<button>iaansci 다시 긁기</button>
</form>
{#if form?.error}<p>{form.error}</p>{/if}
{#if form?.started}<p>수집 #{form.started} 시작됨. 새로고침하면 진행 상황이 보입니다.</p>{/if}

<h2>수집 기록</h2>
<table>
	<thead>
		<tr
			><th>#</th><th>사이트</th><th>상태</th><th>페이지</th><th>상품</th><th>시작</th><th>종료</th
			><th>오류</th></tr
		>
	</thead>
	<tbody>
		{#each data.runs as r (r.id)}
			<tr>
				<td>{r.id}</td>
				<td>{r.site}</td>
				<td>{r.status}</td>
				<td>{r.pagesFetched}</td>
				<td>{r.productsFound}</td>
				<td>{r.startedAt.toLocaleString('ko-KR')}</td>
				<td>{r.finishedAt?.toLocaleString('ko-KR') ?? ''}</td>
				<td>{r.error ?? ''}</td>
			</tr>
		{/each}
	</tbody>
</table>
