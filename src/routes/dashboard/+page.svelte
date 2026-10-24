<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1>대시보드</h1>
<p>{data.user?.email}</p>
