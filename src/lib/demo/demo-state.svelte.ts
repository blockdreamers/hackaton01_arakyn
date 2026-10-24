// Shared state between the one-page demo sections.
import type { ScenarioId } from './search.ts';

export interface SharedResult {
	id: number;
	label: string;
	results: { name: string; price: number | null; currency: string; site: string; url: string }[];
	webTokens: number;
	catalogTokens: number;
	replayed: boolean;
}

export interface RaceRequest {
	id: number;
	label: string;
	body: Record<string, unknown>;
}

export const demo = $state({
	scenario: 'metal' as ScenarioId,
	// set while the big left/right token race is on the page, so the search dock runs there
	raceMounted: false,
	raceRequest: null as RaceRequest | null,
	raceRunning: false,
	// which preset the click-to-search example in every search box shows; rotates after each use
	suggestIdx: 0,
	// the search everyone plays: set by the race once it knows the keywords (from its spec step);
	// the data monitor replays it with the same keywords and every search box shows the same text
	lastQuery: null as { id: number; label: string; terms?: string[] } | null,
	// what the race delivered, so the floating dock can show the same results
	lastResult: null as SharedResult | null
});

export function scrollToSection(id: string) {
	document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
