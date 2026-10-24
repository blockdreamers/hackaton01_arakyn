// Bright Data Web Scraper API (async): trigger -> progress -> snapshot download
const API = 'https://api.brightdata.com/datasets/v3';

export type SnapshotStatus = 'starting' | 'running' | 'ready' | 'failed' | 'canceled';

export class BrightData {
	constructor(private token: string) {}

	private async request(path: string, init?: RequestInit) {
		const res = await fetch(`${API}${path}`, {
			...init,
			headers: {
				authorization: `Bearer ${this.token}`,
				'content-type': 'application/json',
				...init?.headers
			}
		});
		if (!res.ok) throw new Error(`Bright Data ${res.status}: ${await res.text()}`);
		return res;
	}

	async trigger(params: Record<string, string>, body: unknown): Promise<string> {
		const qs = new URLSearchParams({ include_errors: 'true', ...params });
		const res = await this.request(`/trigger?${qs}`, {
			method: 'POST',
			body: JSON.stringify(body)
		});
		const { snapshot_id } = await res.json();
		return snapshot_id;
	}

	async progress(snapshotId: string): Promise<{ status: SnapshotStatus; [k: string]: unknown }> {
		return (await this.request(`/progress/${snapshotId}`)).json();
	}

	/** Large snapshots answer 202 {"status":"building"} for a while after they are ready */
	async download<T>(snapshotId: string): Promise<T[]> {
		for (let attempt = 1; ; attempt++) {
			const res = await this.request(`/snapshot/${snapshotId}?format=json`);
			const body = await res.json();
			if (Array.isArray(body)) return body;
			if (res.status !== 202 || attempt >= 40) {
				throw new Error(`Unexpected snapshot response: ${JSON.stringify(body).slice(0, 200)}`);
			}
			await new Promise((r) => setTimeout(r, 30_000));
		}
	}
}
