// Shared state between the one-page demo sections (race → monitor hand-off).
import type { ScenarioId } from './search.ts';

export const demo = $state({ scenario: 'metal' as ScenarioId });

export function scrollToSection(id: string) {
	document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
