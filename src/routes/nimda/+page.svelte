<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h1>관리자</h1>

<h2>사이트</h2>
<table>
	<thead>
		<tr><th>사이트</th><th>국가</th><th>통화</th><th>세금 포함</th><th>상품 수</th></tr>
	</thead>
	<tbody>
		{#each data.siteStats as s (s.code)}
			<tr
				><td>{s.name} ({s.code})</td><td>{s.country}</td><td>{s.currency}</td><td
					>{s.priceIncludesTax == null ? '?' : s.priceIncludesTax ? '포함' : '별도'}</td
				><td>{s.products}</td></tr
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
	<label
		>카테고리 또는 키워드 (쉼표, 비우면 기본 목록 전체) <input
			name="categories"
			placeholder="c-23,c-24 / 육각볼트,베어링"
		/></label
	>
	<label
		>이어서 할 수집 # (중단된 수집의 진행 지점부터) <input
			name="resume"
			type="number"
			min="1"
		/></label
	>
	<label
		>카테고리·키워드당 최대 페이지 (비우면 전체, 다이소는 최대 3) <input
			name="maxPages"
			type="number"
			min="1"
		/></label
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

<h2>사이트 점검 (에이전트)</h2>
<p>
	정책(robots.txt·봇 차단), 사이트 구조 변경(파서), 수집 상태를 에이전트가 점검하고 보고서를 씁니다.
	사이트마다 실제 요청을 보내므로 수 분~수십 분 걸립니다. CLI: <code>bun run monitor</code>
</p>
<form method="POST" action="?/monitor" use:enhance>
	<button disabled={data.monitorRunning}>{data.monitorRunning ? '점검 중…' : '점검 실행'}</button>
</form>
{#if form?.monitorStarted}<p>점검을 시작했습니다. 끝나면 새로고침해서 보고서를 확인하세요.</p>{/if}
{#if data.monitorError}<p>마지막 점검 실패: {data.monitorError}</p>{/if}
{#if data.report}
	<h3>
		최근 보고서 #{data.report.id} ({data.report.createdAt.toLocaleString('ko-KR')}, {data.report
			.model})
	</h3>
	<pre style="white-space: pre-wrap">{data.report.report}</pre>
{:else}
	<p>아직 보고서가 없습니다.</p>
{/if}
