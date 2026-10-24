import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$app/env/private';

let client: Anthropic | null = null;

export function anthropic() {
	if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
	client ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY });
	return client;
}
