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

	async download<T>(snapshotId: string): Promise<T[]> {
		return (await this.request(`/snapshot/${snapshotId}?format=json`)).json();
	}
}
