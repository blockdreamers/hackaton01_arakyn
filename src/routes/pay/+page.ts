import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// The demo is one page now; old links jump to the matching section.
export const load: PageLoad = () => {
	redirect(307, '/#pricing');
};
