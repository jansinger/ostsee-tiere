import { browser } from '$app/env';

export const isNotIFrame =
	browser && window && typeof window !== 'undefined' && window === window.top;
