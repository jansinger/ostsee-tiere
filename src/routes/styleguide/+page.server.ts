import { dev } from '$app/env';
import { error } from '@sveltejs/kit';

/**
 * Der Styleguide ist Entwickler-Werkzeug, keine öffentliche Seite.
 * Alternativ hinter denselben Admin-Guard wie /admin legen, wenn er auch
 * auf der Produktionsinstanz erreichbar sein soll — dann aber mit
 * noindex (steht bereits in <svelte:head>).
 */
export function load() {
	if (!dev) {
		error(404, 'Not found');
	}
	return {};
}
