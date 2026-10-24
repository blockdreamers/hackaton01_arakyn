import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'PostgreSQL connection string',
		// optional at build time; checked when the db client is created
		schema: (value) => value || undefined
	}
});
