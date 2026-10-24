// Client helper: count one agent search against the index (fire and forget).
export function countSearch() {
	fetch('/api/stats', { method: 'POST' }).catch(() => {});
}
