<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import type { PublicUser } from '#lib/types/User.ts';
	import Icon from '#lib/components/Icon.svelte';
	import LanguageSwitcher from './LanguageSwitcher.svelte';

	/* `isAdmin` ist hier bewusst weggefallen — Begründung in `UserMenu.svelte`:
	   Der Eintrag „Admin-Bereich" dupliziert „Verwaltung → Sichtungen" aus dem
	   Burger-Menü, das direkt darüber steht. */
	let {
		user,
		showLanguageSwitcher = false
	}: { user: PublicUser | null; showLanguageSwitcher?: boolean } = $props();
</script>

{#if user}
	<!-- User Info Header for Mobile Menu -->
	<div class="border-base-200 mb-2 border-b px-0 pb-2">
		<div class="flex items-center gap-3 px-4 py-2">
			{#if user.picture}
				<div class="avatar">
					<div class="h-8 w-8 rounded-full">
						<img src={user.picture} alt={m.components_usermenumobile_alt_profilbild()} />
					</div>
				</div>
			{:else}
				<div class="avatar placeholder">
					<div class="bg-neutral text-neutral-content h-8 w-8 rounded-full">
						<Icon icon="lucide:user" width="16" class="h-4 w-4" />
					</div>
				</div>
			{/if}
			<div class="min-w-0 flex-1">
				<div class="truncate text-sm font-medium">
					{user.nickname || user.name || 'Benutzer'}
				</div>
				<div class="text-base-content/60 truncate text-xs">
					{user.email || ''}
				</div>
			</div>
		</div>
	</div>

	<!-- Sprachumschalter: Begründung siehe `UserMenu.svelte`. -->
	{#if showLanguageSwitcher}
		<li><LanguageSwitcher class="flex items-center gap-2" /></li>
	{/if}
	<!-- User Menu Items for Mobile -->
	<li>
		<a href="/api/auth/logout" class="text-error hover:bg-error/10 flex items-center gap-2">
			<Icon icon="lucide:log-out" width="16" class="h-4 w-4" />
			{m.components_usermenumobile_text_abmelden()}
		</a>
	</li>
{/if}
