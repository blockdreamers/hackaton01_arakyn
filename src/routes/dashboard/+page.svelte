<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const base = $derived(page.url.origin);
	const key = $derived(form?.key ?? 'YOUR_API_KEY');
</script>

<h1>대시보드</h1>
<p>{data.user?.email}</p>

<h2>API 키</h2>
{#if form?.key}
	<p>새 키입니다. 지금만 표시되니 복사해 두세요.</p>
	<pre>{form.key}</pre>
{:else if data.apiKey}
	<p>
		{data.apiKey.prefix}… (발급 {data.apiKey.createdAt.toLocaleString('ko-KR')}, 마지막 사용 {data.apiKey.lastUsedAt?.toLocaleString(
			'ko-KR'
		) ?? '없음'})
	</p>
{:else}
	<p>아직 발급된 키가 없습니다.</p>
{/if}
<form method="POST" action="?/issueKey" use:enhance>
	<button>{data.apiKey ? '재발급 (기존 키는 즉시 폐기)' : '키 발급'}</button>
</form>

<h2>사용 방법</h2>
<p>모든 요청에 <code>Authorization: Bearer &lt;API 키&gt;</code> 헤더를 넣습니다.</p>

<h3>GET /api/v1/products</h3>
<p>
	상품 검색. 파라미터: <code>q</code> (상품명 검색), <code>country</code> (KR, US …),
	<code>site</code>
	(iaansci, amazon_us …), <code>limit</code> (기본 20, 최대 100), <code>offset</code>
</p>
<pre>curl -H "Authorization: Bearer {key}" "{base}/api/v1/products?q=현미경&country=KR&limit=5"</pre>

<h3>GET /api/v1/sites</h3>
<p>수집 중인 사이트 목록과 국가, 통화, 세금 포함 여부(<code>priceIncludesTax</code>), 상품 수.</p>
<pre>curl -H "Authorization: Bearer {key}" "{base}/api/v1/sites"</pre>

<h2>사용 현황</h2>
<table>
	<thead><tr><th>최근 24시간</th><th>최근 7일</th><th>전체</th></tr></thead>
	<tbody
		><tr><td>{data.usage.day}</td><td>{data.usage.week}</td><td>{data.usage.total}</td></tr></tbody
	>
</table>

<h3>최근 요청</h3>
<table>
	<thead><tr><th>시각</th><th>요청</th><th>상태</th></tr></thead>
	<tbody>
		{#each data.recent as r (r.id)}
			<tr>
				<td>{r.createdAt.toLocaleString('ko-KR')}</td>
				<td>{r.method} {r.path}{r.query ?? ''}</td>
				<td>{r.status}</td>
			</tr>
		{/each}
	</tbody>
</table>
