<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h1>관리자</h1>

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

<h2>수집 실행</h2>
<form method="POST" action="?/scrape" use:enhance>
	<label>
		사이트
		<select name="site">
			{#each data.scrapers as code (code)}<option>{code}</option>{/each}
		</select>
	</label>
	<label>카테고리 (쉼표, 비우면 전체) <input name="categories" placeholder="c-23,c-24" /></label>
	<label>카테고리당 최대 페이지 (비우면 전체) <input name="maxPages" type="number" min="1" /></label
	>
	<button>다시 긁기</button>
</form>
<p>카테고리나 페이지를 제한하면 기존 데이터에 추가만 하고, 판매 중지 처리는 하지 않습니다.</p>
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
