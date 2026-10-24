// Shared state between the one-page demo sections.
import type { ScenarioId } from './search.ts';

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
	// the search everyone plays: set by the race when a run starts; the data monitor replays it
	lastQuery: null as { id: number; label: string } | null
});

export function scrollToSection(id: string) {
	document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
