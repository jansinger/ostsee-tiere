# Changelog

All notable changes to this project will be documented in this file. See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.13.0](https://github.com/jansinger/ostsee-tiere/compare/v2.12.0...v2.13.0) (2026-08-08)


### Features

* **admin:** Duplikat-Hinweis auf der Eingangsseite (Spec B2) ([#804](https://github.com/jansinger/ostsee-tiere/issues/804)) ([b6ff365](https://github.com/jansinger/ostsee-tiere/commit/b6ff365db8fedaf75ea25f6c6054d794e1e88a58))
* **admin:** Freitext-Suche über Sichtungen in der Admin-Tabelle ([#803](https://github.com/jansinger/ostsee-tiere/issues/803)) ([45e01a3](https://github.com/jansinger/ostsee-tiere/commit/45e01a3cdb44c3ccc8d9d3ad7dc4fee955b7b32b))
* **admin:** gespeicherte Filteransichten für die Sichtungstabelle (Spec B4) ([#806](https://github.com/jansinger/ostsee-tiere/issues/806)) ([bd27501](https://github.com/jansinger/ostsee-tiere/commit/bd27501371a75a252635e2d1800238ab3340cbf5))
* **admin:** inbox task list with rejection triage ([#793](https://github.com/jansinger/ostsee-tiere/issues/793)) ([7fa08de](https://github.com/jansinger/ostsee-tiere/commit/7fa08de8cf1e8e36d9c719fd8c91b8e0c6cd65d1))
* **admin:** Jahresfilter und echte Diagramme für die Statistikseite ([#801](https://github.com/jansinger/ostsee-tiere/issues/801)) ([1ea753b](https://github.com/jansinger/ostsee-tiere/commit/1ea753b5f98032f387de8782c8c3a21403c8f79a))
* **admin:** Rückweg aus der Detailansicht kennt den Eingang ([#807](https://github.com/jansinger/ostsee-tiere/issues/807)) ([32cac3c](https://github.com/jansinger/ostsee-tiere/commit/32cac3ca473350d0b38b2e868a706d7a67f4c39c))
* **admin:** spam rescore endpoint for deployed environments ([#790](https://github.com/jansinger/ostsee-tiere/issues/790)) ([7b5c7b6](https://github.com/jansinger/ostsee-tiere/commit/7b5c7b649a3442d9e9e7705a4509e12c84acc168))
* **admin:** Status-Historie pro Sichtung (Spec B3) ([#805](https://github.com/jansinger/ostsee-tiere/issues/805)) ([dfd89f5](https://github.com/jansinger/ostsee-tiere/commit/dfd89f50d095ca83fcf79268c732276fba2d9cb4))
* **admin:** Tastatur-Triage im Eingang (Spec B1) ([#808](https://github.com/jansinger/ostsee-tiere/issues/808)) ([b565351](https://github.com/jansinger/ostsee-tiere/commit/b565351d5bd96a4df165a2719644c2454b3a0347))
* **admin:** unify sighting status across inbox, table and detail view ([#797](https://github.com/jansinger/ostsee-tiere/issues/797)) ([8f7ae91](https://github.com/jansinger/ostsee-tiere/commit/8f7ae9103272407481d651a182aa3079cf467fa0))
* **admin:** usability- und UX-verbesserungen aus dem admin-review ([#802](https://github.com/jansinger/ostsee-tiere/issues/802)) ([336f2f2](https://github.com/jansinger/ostsee-tiere/commit/336f2f2302c90e2f6087613bcc5dfe76ce498f1d))
* **report:** Dropdown-Optionen nach Wahrscheinlichkeit sortieren, redundantes "Keine Angabe" entfernen ([#796](https://github.com/jansinger/ostsee-tiere/issues/796)) ([fa88c9a](https://github.com/jansinger/ostsee-tiere/commit/fa88c9aee069571fd00d8f07514a7a9120a093b0))
* **report:** Einstiegsseite mit zwei klickbaren Karten statt Radio + „Weiter" ([#791](https://github.com/jansinger/ostsee-tiere/issues/791)) ([bb64fd2](https://github.com/jansinger/ostsee-tiere/commit/bb64fd293f298d30c945ecee8a8c99e13b05c46d))


### Bug Fixes

* **admin:** undo rejections, show them in detail view, correct pending photo count ([#794](https://github.com/jansinger/ostsee-tiere/issues/794)) ([c6d8fee](https://github.com/jansinger/ostsee-tiere/commit/c6d8feefe02fd0666dae84d48cdaf65b0db05612))
* **admin:** vier Bugs aus dem Admin-Review (Filterverlust, Zähler, Datumsfilter, Statistik) ([#800](https://github.com/jansinger/ostsee-tiere/issues/800)) ([453b1d8](https://github.com/jansinger/ostsee-tiere/commit/453b1d80c98baba43f1011634b0dbabecbbdeb18))
* **admin:** wrap long reference ids in the mobile sighting card ([#798](https://github.com/jansinger/ostsee-tiere/issues/798)) ([9bb82c7](https://github.com/jansinger/ostsee-tiere/commit/9bb82c7ece5ceb9eb07acd315ad7c708b26270c2))
* **report:** kein Bestätigungsmail-Versprechen auf der Erfolgsseite ([#795](https://github.com/jansinger/ostsee-tiere/issues/795)) ([473622b](https://github.com/jansinger/ostsee-tiere/commit/473622b7ea87f7fcc90edee0c736a119786cb47f))
* **report:** UX-Review Runde 2 — Toast-Dedup, Totfund Schritt 2, Politur ([#792](https://github.com/jansinger/ostsee-tiere/issues/792)) ([6173746](https://github.com/jansinger/ostsee-tiere/commit/617374629020101439dbba51b6849b717274298f))


### Dependencies

* **deps:** bump js-yaml from 4.3.0 to 4.3.1 ([#788](https://github.com/jansinger/ostsee-tiere/issues/788)) ([806533d](https://github.com/jansinger/ostsee-tiere/commit/806533daf09c00b53f302560395111574e692479))

## [2.12.0](https://github.com/jansinger/ostsee-tiere/compare/v2.11.0...v2.12.0) (2026-08-07)


### Features

* **admin:** add dead-finding filter to the sightings table ([#786](https://github.com/jansinger/ostsee-tiere/issues/786)) ([0c80199](https://github.com/jansinger/ostsee-tiere/commit/0c801990095e4a02f811fae5685ab744d1b7ecdf))
* **admin:** distinguish dead findings from live sightings ([#784](https://github.com/jansinger/ostsee-tiere/issues/784)) ([f76f714](https://github.com/jansinger/ostsee-tiere/commit/f76f7140bbf93b54370cec5ce1e45c697d664c50))
* **admin:** give the sighting detail view the same actions as the table ([#770](https://github.com/jansinger/ostsee-tiere/issues/770)) ([9d3c28a](https://github.com/jansinger/ostsee-tiere/commit/9d3c28accd88fcf7414dbd5803eda7705479d5de))
* **api:** spam detection for sighting submissions — score, persist, triage ([#787](https://github.com/jansinger/ostsee-tiere/issues/787)) ([58c1b9b](https://github.com/jansinger/ostsee-tiere/commit/58c1b9b2505ccf4f69da0b8ea28e2c0a89215bda))
* **report:** add the entry choice before the report form ([#773](https://github.com/jansinger/ostsee-tiere/issues/773)) ([0f23623](https://github.com/jansinger/ostsee-tiere/commit/0f23623dc1e04ad50e802a736581dfd45ef30267))


### Bug Fixes

* **admin:** let multi-line badge values grow instead of overflowing the pill ([#785](https://github.com/jansinger/ostsee-tiere/issues/785)) ([6274aa4](https://github.com/jansinger/ostsee-tiere/commit/6274aa4c842d2397221180b6d2af3fb318b08b9d))
* **report:** announce a photo only when none is attached yet ([#772](https://github.com/jansinger/ostsee-tiere/issues/772)) ([541f4b0](https://github.com/jansinger/ostsee-tiere/commit/541f4b0fcfa9ba61cdde0d32aecd38fbb9741f81))
* **report:** hide the dead-find fields from step validation in the alive branch ([#774](https://github.com/jansinger/ostsee-tiere/issues/774)) ([b5536fd](https://github.com/jansinger/ostsee-tiere/commit/b5536fdd35c6c597dfa1d7fd29e6c4376b581b74))
* **report:** move the ship count below the weather fields ([#775](https://github.com/jansinger/ostsee-tiere/issues/775)) ([1b57d9c](https://github.com/jansinger/ostsee-tiere/commit/1b57d9ca45758c4aea1c99e5d3c10065ca1beaa4))
* **report:** stop hidden fields from silently blocking the submit ([#783](https://github.com/jansinger/ostsee-tiere/issues/783)) ([96bd2b6](https://github.com/jansinger/ostsee-tiere/commit/96bd2b688e715279bc426fd700aea491ce81edc6))
* **report:** vier UX-Befunde zur Einstiegsseite und zum Meldeformular ([#780](https://github.com/jansinger/ostsee-tiere/issues/780)) ([c132a69](https://github.com/jansinger/ostsee-tiere/commit/c132a698a25234b9c9aaa8965759e02b24802f1e))


### Code Refactoring

* **report:** drop the no-op when() from deadSize ([#779](https://github.com/jansinger/ostsee-tiere/issues/779)) ([0f3c8a5](https://github.com/jansinger/ostsee-tiere/commit/0f3c8a52538c4621d620cd473474249239b04e6f))
* **report:** move the report-kind feedback into the action row ([#782](https://github.com/jansinger/ostsee-tiere/issues/782)) ([23b4657](https://github.com/jansinger/ostsee-tiere/commit/23b4657dc7083c08fd03e07b7c9cec7a5ee292e6))

## [2.11.0](https://github.com/jansinger/ostsee-tiere/compare/v2.10.0...v2.11.0) (2026-08-05)


### Features

* **admin:** show dead-animal finds in the notification email ([#741](https://github.com/jansinger/ostsee-tiere/issues/741)) ([44f887d](https://github.com/jansinger/ostsee-tiere/commit/44f887d86b885b4ddacc7ea5becaf9c03cb7037b))
* **report:** rework step 2 from the museum's feedback — media upload, dead-find wording ([#755](https://github.com/jansinger/ostsee-tiere/issues/755)) ([d407ea3](https://github.com/jansinger/ostsee-tiere/commit/d407ea3f5e388863c8cbf15aed747469c1a3e607))
* **report:** rework the report form from the museum's feedback ([#746](https://github.com/jansinger/ostsee-tiere/issues/746)) ([00c1b89](https://github.com/jansinger/ostsee-tiere/commit/00c1b89ede012d5c688c78b8398e3813a85d8ec6))
* **ui:** reach the background page from the menu, named as the museum asked ([#765](https://github.com/jansinger/ostsee-tiere/issues/765)) ([3ad6f63](https://github.com/jansinger/ostsee-tiere/commit/3ad6f63961902ffbe93d72a7a7b2500664b56644))


### Bug Fixes

* **a11y:** give the species image modal an accessible name (WCAG 4.1.2) ([#763](https://github.com/jansinger/ostsee-tiere/issues/763)) ([2d4d702](https://github.com/jansinger/ostsee-tiere/commit/2d4d702fe66cc6330ac540ee21d6f333aea1fdf1))
* **a11y:** mark the coordinates as required when a position is given ([#753](https://github.com/jansinger/ostsee-tiere/issues/753)) ([4e6719d](https://github.com/jansinger/ostsee-tiere/commit/4e6719d4e98adca8ee5864fff4bda43c48775a84))
* **a11y:** mark the remaining conditionally required fields as required ([#750](https://github.com/jansinger/ostsee-tiere/issues/750)) ([75c9620](https://github.com/jansinger/ostsee-tiere/commit/75c9620292bc70c136b32992929926b0d6fd00e3))
* **a11y:** move radio group aria-invalid/aria-required to the group ([#752](https://github.com/jansinger/ostsee-tiere/issues/752)) ([ab76efa](https://github.com/jansinger/ostsee-tiere/commit/ab76efa7e3b9bbcca705cd152ef70cfe1f832c4f))
* **a11y:** show the validation state on checkbox and toggle fields ([#758](https://github.com/jansinger/ostsee-tiere/issues/758)) ([dabafe4](https://github.com/jansinger/ostsee-tiere/commit/dabafe42385f86ca4cc64a8099eff46b06f87a76))
* **admin:** stop reading the email template from disk ([#739](https://github.com/jansinger/ostsee-tiere/issues/739)) ([7689a21](https://github.com/jansinger/ostsee-tiere/commit/7689a21694e9cee10c9cb157e4c3aa2916243f53))
* **ci:** ask Playwright which e2e specs exist instead of rebuilding its rule ([#767](https://github.com/jansinger/ostsee-tiere/issues/767)) ([67db3f2](https://github.com/jansinger/ostsee-tiere/commit/67db3f216809f302504c902054553286722ccb4d))
* **ci:** assign the 14 leftover e2e specs to shards ([#766](https://github.com/jansinger/ostsee-tiere/issues/766)) ([1deca8e](https://github.com/jansinger/ostsee-tiere/commit/1deca8eafb9f74d32b95c6bac6d8864f4c2bb929))
* **ci:** balance the e2e shards on measured step duration ([#769](https://github.com/jansinger/ostsee-tiere/issues/769)) ([f381388](https://github.com/jansinger/ostsee-tiere/commit/f38138859c443eeec48a611f6c7b2560d701c01c))
* **ci:** stop E2E specs from silently running in no shard ([#761](https://github.com/jansinger/ostsee-tiere/issues/761)) ([5e568a0](https://github.com/jansinger/ostsee-tiere/commit/5e568a06a450be311c1612ee5689fcd7688fe2d5))
* **map:** replace the outdated museum logo on the map ([#745](https://github.com/jansinger/ostsee-tiere/issues/745)) ([5917311](https://github.com/jansinger/ostsee-tiere/commit/5917311227c60131ffe489c3311d217801e43db3))
* **report:** drop the stale help text and the doubled icon on the motor question ([#748](https://github.com/jansinger/ostsee-tiere/issues/748)) ([9230afc](https://github.com/jansinger/ostsee-tiere/commit/9230afc918d38a9b4934ec5a50a9691a9bbd9821))
* **report:** stop step 2 promising a GPS position transfer it never does ([#759](https://github.com/jansinger/ostsee-tiere/issues/759)) ([0ba3445](https://github.com/jansinger/ostsee-tiere/commit/0ba3445c146f37c0def7178257fddec3379bea7e))
* **test:** let the E2E webServer and a local dev server share port 4000 ([#754](https://github.com/jansinger/ostsee-tiere/issues/754)) ([53458bd](https://github.com/jansinger/ostsee-tiere/commit/53458bdf380703ccd5620c56ae72b9413917b228))
* **ui:** let labels and titles wrap instead of widening the whole page ([#751](https://github.com/jansinger/ostsee-tiere/issues/751)) ([db2579a](https://github.com/jansinger/ostsee-tiere/commit/db2579a2230aef51eaeb114e9509c497e16fd1d2))
* **ui:** stop the about page forcing a 411px document on every viewport ([#756](https://github.com/jansinger/ostsee-tiere/issues/756)) ([8ff5069](https://github.com/jansinger/ostsee-tiere/commit/8ff506959e75176fece7a9a69d46d2f60c3a8999))


### Documentation

* **api:** say plainly that the legacy POST validates no value ranges ([#747](https://github.com/jansinger/ostsee-tiere/issues/747)) ([13c6877](https://github.com/jansinger/ostsee-tiere/commit/13c6877251d13c53f8e02cdbc843e45c05519694))
* **report:** move the media comments from step 3 to step 2 ([#764](https://github.com/jansinger/ostsee-tiere/issues/764)) ([8157461](https://github.com/jansinger/ostsee-tiere/commit/8157461aa761c6bb38d12b8537c1c9224b3937ce))
* **report:** record why the species help stays in the form ([#743](https://github.com/jansinger/ostsee-tiere/issues/743)) ([6ffe0fc](https://github.com/jansinger/ostsee-tiere/commit/6ffe0fc365003cc0998b4178736ed8434704ec4c))


### Code Refactoring

* **ui:** drop the unused Checkbox field component ([#762](https://github.com/jansinger/ostsee-tiere/issues/762)) ([e12ae38](https://github.com/jansinger/ostsee-tiere/commit/e12ae388596c997ad3466d3449ae6041283ee9d1))

## [2.10.0](https://github.com/jansinger/ostsee-tiere/compare/v2.9.0...v2.10.0) (2026-08-04)


### Features

* **admin:** Ostsee-Filter, plus zwei Layout-Korrekturen im Admin ([#732](https://github.com/jansinger/ostsee-tiere/issues/732)) ([efde0a0](https://github.com/jansinger/ostsee-tiere/commit/efde0a04c1d47f9bb8724f9fb87e6ad5136350a5))


### Bug Fixes

* **admin:** keep the "Geprüft" toggle label on one line ([#737](https://github.com/jansinger/ostsee-tiere/issues/737)) ([0680351](https://github.com/jansinger/ostsee-tiere/commit/068035154dfaec286e5f3519c528fe291d8fd16b))
* **admin:** send notification and test mails to CC/BCC recipients ([#738](https://github.com/jansinger/ostsee-tiere/issues/738)) ([00747fe](https://github.com/jansinger/ostsee-tiere/commit/00747fef734c512bc89831f6855dbeb3ae707bd2))


### Dependencies

* **deps:** bump fast-uri from 3.1.4 to 3.1.5 ([#736](https://github.com/jansinger/ostsee-tiere/issues/736)) ([3ac4776](https://github.com/jansinger/ostsee-tiere/commit/3ac4776261d7de124109eeffdbcffae7c2c1d840))
* **deps:** bump ip-address from 10.2.0 to 10.4.0 ([#733](https://github.com/jansinger/ostsee-tiere/issues/733)) ([a7f1781](https://github.com/jansinger/ostsee-tiere/commit/a7f178112fba4a26865e8bebe4170a2970c2332c))
* **deps:** bump undici from 6.27.0 to 6.28.0 ([#735](https://github.com/jansinger/ostsee-tiere/issues/735)) ([31188f3](https://github.com/jansinger/ostsee-tiere/commit/31188f3a3b74d5d84546c34857c9fa98a543356f))

## [2.9.0](https://github.com/jansinger/ostsee-tiere/compare/v2.8.2...v2.9.0) (2026-08-03)


### Features

* **map:** rebuild baltic geometry with water-outline inclusion mask ([#731](https://github.com/jansinger/ostsee-tiere/issues/731)) ([458ef85](https://github.com/jansinger/ostsee-tiere/commit/458ef854eed2557565168da91b5fed5bf5f89927))


### Bug Fixes

* **db:** keep reported wind force 0 instead of storing NULL ([#729](https://github.com/jansinger/ostsee-tiere/issues/729)) ([ab8daca](https://github.com/jansinger/ostsee-tiere/commit/ab8dacad92e073d1b6c63d0bba04be477983bee7))

## [2.8.2](https://github.com/jansinger/ostsee-tiere/compare/v2.8.1...v2.8.2) (2026-08-03)


### Bug Fixes

* **security:** 404 nicht mehr als Serverfehler loggen, Absender benennen ([#727](https://github.com/jansinger/ostsee-tiere/issues/727)) ([4b7f87c](https://github.com/jansinger/ostsee-tiere/commit/4b7f87ca263a8622d0a4925a3a4d96b5ae51bbba))
* **ui:** navigation ordnen und die Karte nicht mehr abschneiden ([#726](https://github.com/jansinger/ostsee-tiere/issues/726)) ([b4c8a6f](https://github.com/jansinger/ostsee-tiere/commit/b4c8a6f7419e535318afdedf8dc1281a4f958cc8))


### Dependencies

* **deps:** bump @iconify/json from 2.2.506 to 2.2.508 ([#723](https://github.com/jansinger/ostsee-tiere/issues/723)) ([2105928](https://github.com/jansinger/ostsee-tiere/commit/21059286e86959c307b587e513b64fb47483442b))
* **deps:** bump @scalar/sveltekit from 0.3.11 to 0.3.12 ([#724](https://github.com/jansinger/ostsee-tiere/issues/724)) ([c8f13c7](https://github.com/jansinger/ostsee-tiere/commit/c8f13c785089aa17689026dafad7290bf96135c7))
* **deps:** bump the dev-tooling group with 2 updates ([#721](https://github.com/jansinger/ostsee-tiere/issues/721)) ([d3cfb52](https://github.com/jansinger/ostsee-tiere/commit/d3cfb523bc2389133aeae93957893ff9bfc63858))
* **deps:** bump the github-actions group with 2 updates ([#725](https://github.com/jansinger/ostsee-tiere/issues/725)) ([0067e42](https://github.com/jansinger/ostsee-tiere/commit/0067e426c368fa47f91bc74656798462c05443dc))
* **deps:** bump the production-dependencies group with 2 updates ([#720](https://github.com/jansinger/ostsee-tiere/issues/720)) ([02cbb67](https://github.com/jansinger/ostsee-tiere/commit/02cbb6798fee58f4fe43c1cf785dec3279e6c77d))
* **deps:** bump the svelte-framework group with 2 updates ([#722](https://github.com/jansinger/ostsee-tiere/issues/722)) ([373aeef](https://github.com/jansinger/ostsee-tiere/commit/373aeef5bba52ae5bd60d9ae6f172542726e7ba2))

## [2.8.1](https://github.com/jansinger/ostsee-tiere/compare/v2.8.0...v2.8.1) (2026-08-02)


### Bug Fixes

* **build:** docker build findet die Vite-Config-Imports wieder ([#718](https://github.com/jansinger/ostsee-tiere/issues/718)) ([623e4aa](https://github.com/jansinger/ostsee-tiere/commit/623e4aa5792d054aa7cb955a157fe44a535e95e7))

## [2.8.0](https://github.com/jansinger/ostsee-tiere/compare/v2.7.0...v2.8.0) (2026-08-02)


### Features

* **build:** show version/commit on startup, health check, admin footer ([#689](https://github.com/jansinger/ostsee-tiere/issues/689)) ([fb667fc](https://github.com/jansinger/ostsee-tiere/commit/fb667fc75eea576c2dedb15e14f691fafd86b874))
* **report:** Ortsbeschreibung im Meldeformular als ein Freitextfeld ([#715](https://github.com/jansinger/ostsee-tiere/issues/715)) ([0f50450](https://github.com/jansinger/ostsee-tiere/commit/0f504503ed649d25a19d90a3675e9f70f0a0644c))
* **ui:** Bestimmungshilfe als eigenständige Seite unter /bestimmungshilfe ([#710](https://github.com/jansinger/ostsee-tiere/issues/710)) ([cc08aff](https://github.com/jansinger/ostsee-tiere/commit/cc08affdf080b514895f049dbff0db5b636f85b5))
* **ui:** Datenschutzhinweis als Dialog und kompakter Schritt-1-Kopf ([#713](https://github.com/jansinger/ostsee-tiere/issues/713)) ([324e33d](https://github.com/jansinger/ostsee-tiere/commit/324e33dc60a992fec4955f743fe14e58ae367982))
* **ui:** Schweinswal-Icon ersetzt den Fisch an der Tierart ([#695](https://github.com/jansinger/ostsee-tiere/issues/695)) ([422abbc](https://github.com/jansinger/ostsee-tiere/commit/422abbce082a7eeffc13d6f90ddaffadf9da2cd2))


### Bug Fixes

* **a11y:** decorative textarea icon is hidden from screen readers ([#696](https://github.com/jansinger/ostsee-tiere/issues/696)) ([d7eb584](https://github.com/jansinger/ostsee-tiere/commit/d7eb584c4b5382e96c4814418ff4841c50ced2bf))
* **admin:** Bearbeiten einer Sichtung lässt den Bestand unversehrt ([#706](https://github.com/jansinger/ostsee-tiere/issues/706)) ([8c0fd7f](https://github.com/jansinger/ostsee-tiere/commit/8c0fd7fc751762f22d7d3c90dd01580d62a37237))
* **admin:** interne Benachrichtigung als solche benennen ([#694](https://github.com/jansinger/ostsee-tiere/issues/694)) ([1eaa634](https://github.com/jansinger/ostsee-tiere/commit/1eaa63421e675aa07d07e2f084dc2e53f4af4931))
* **api:** GET /api/sightings liefert nur freigegebene Sichtungen ([#699](https://github.com/jansinger/ostsee-tiere/issues/699)) ([c0a8a61](https://github.com/jansinger/ostsee-tiere/commit/c0a8a61e710308f7d68837af4f53e42ff7d8713d))
* **media:** reset deletes the uploaded files from the server ([#717](https://github.com/jansinger/ostsee-tiere/issues/717)) ([7279f9d](https://github.com/jansinger/ostsee-tiere/commit/7279f9d745d8ba9ef7148d38ea1319ae199e7cbe))
* **test:** eigener E2E-Port pro Worktree und geprüfte Server-Identität ([#707](https://github.com/jansinger/ostsee-tiere/issues/707)) ([357a897](https://github.com/jansinger/ostsee-tiere/commit/357a897bdf87b4b3ee68c6bc2fc72d151766cbf1))
* **test:** Gradient-Stops in der Paletten-Regel erfassen ([#698](https://github.com/jansinger/ostsee-tiere/issues/698)) ([cb3b87e](https://github.com/jansinger/ostsee-tiere/commit/cb3b87ee4cb177c77f9a883b7c8c16909c923b4c))
* **test:** legacy-inbox/app.test.js deterministisch machen ([#709](https://github.com/jansinger/ostsee-tiere/issues/709)) ([050efaf](https://github.com/jansinger/ostsee-tiere/commit/050efafe093988562dab958f348212074a4261d2))
* **test:** rateLimit-Speichertest von CPU-Hunger befreien ([#711](https://github.com/jansinger/ostsee-tiere/issues/711)) ([f1903ce](https://github.com/jansinger/ostsee-tiere/commit/f1903ce79000d0934f7050f6020b47e68f4fadc8))
* **ui:** /about verspricht nur noch, was die verlinkte Datenschutzerklärung deckt ([#714](https://github.com/jansinger/ostsee-tiere/issues/714)) ([3caa55d](https://github.com/jansinger/ostsee-tiere/commit/3caa55df7741585777c3fb2ae248d94035280db8))
* **ui:** cut the stepper bar at the circles instead of under them ([#712](https://github.com/jansinger/ostsee-tiere/issues/712)) ([65907d3](https://github.com/jansinger/ostsee-tiere/commit/65907d3ccdec2b83dd8715cd819aee5eacad65ab))
* **ui:** globale h1-Regel aus dem Karten-CSS entfernen ([#697](https://github.com/jansinger/ostsee-tiere/issues/697)) ([c62ccae](https://github.com/jansinger/ostsee-tiere/commit/c62ccaec922fe100b955ab7693dcb9071ea840c7))
* **ui:** Positions-Dropzone rechnet nur noch mit ihren eigenen Dateien ([#716](https://github.com/jansinger/ostsee-tiere/issues/716)) ([1fb6105](https://github.com/jansinger/ostsee-tiere/commit/1fb610576dbc9cd7f7794b63e8acb63b18363f0a))
* **ui:** tote min-h-10/min-h-11 Utilities entfernen ([#630](https://github.com/jansinger/ostsee-tiere/issues/630)) ([#692](https://github.com/jansinger/ostsee-tiere/issues/692)) ([d6e2646](https://github.com/jansinger/ostsee-tiere/commit/d6e2646ff2612f099ba8f735b73545bd52abb514))
* **ui:** unbekannte Icon-Namen scheitern laut in dev ([#693](https://github.com/jansinger/ostsee-tiere/issues/693)) ([9273195](https://github.com/jansinger/ostsee-tiere/commit/92731951fbd91299dc324786d69842e1f2c2f448)), closes [#629](https://github.com/jansinger/ostsee-tiere/issues/629)
* **ui:** Ziffernkreis im Stepper bekommt eine eigene Fläche ([#691](https://github.com/jansinger/ostsee-tiere/issues/691)) ([bb97a39](https://github.com/jansinger/ostsee-tiere/commit/bb97a395b2494029cfe2a107073f946c4e082cb7))


### Code Refactoring

* **api:** JS-seitige Freigabeprüfung über einen gemeinsamen Helper ([#704](https://github.com/jansinger/ostsee-tiere/issues/704)) ([aee7505](https://github.com/jansinger/ostsee-tiere/commit/aee75057e8e0f5cd3471d5a98dad03cd8f1be182))
* **api:** use shared approvedOnly() filter in showreports.json ([#701](https://github.com/jansinger/ostsee-tiere/issues/701)) ([2092133](https://github.com/jansinger/ostsee-tiere/commit/2092133d64f15cdd2ae86f30d623313843b38da8))
* **ui:** About-Seite auf ihre Kernaussage kuerzen ([#700](https://github.com/jansinger/ostsee-tiere/issues/700)) ([eb20809](https://github.com/jansinger/ostsee-tiere/commit/eb208094bb88d83f945e3b34de5689df037f82ff))

## [2.7.0](https://github.com/jansinger/ostsee-tiere/compare/v2.6.2...v2.7.0) (2026-07-31)


### Features

* **auth:** keep sessions in the database instead of a signed cookie ([#681](https://github.com/jansinger/ostsee-tiere/issues/681)) ([cf7a678](https://github.com/jansinger/ostsee-tiere/commit/cf7a678821584ff4b50b6f3ba0d3c1678209f5e8))
* **db:** record timestamp and text version for all consents ([#672](https://github.com/jansinger/ostsee-tiere/issues/672)) ([6c3aaec](https://github.com/jansinger/ostsee-tiere/commit/6c3aaec858b0d99432b857049ee893d479e37e89))
* **media:** accept video uploads from reporters ([#682](https://github.com/jansinger/ostsee-tiere/issues/682)) ([dbd38a7](https://github.com/jansinger/ostsee-tiere/commit/dbd38a73014a84d4dcc503712e94eaaa960a7e64))
* **report:** meeresmuseum quick wins — texts, validation and field layout ([#669](https://github.com/jansinger/ostsee-tiere/issues/669)) ([25ff6ad](https://github.com/jansinger/ostsee-tiere/commit/25ff6ad5ee6b07d3551165cc08260b53f4b999e2))


### Bug Fixes

* **auth:** restart the login instead of dead-ending on an expired oauth flow ([#678](https://github.com/jansinger/ostsee-tiere/issues/678)) ([a53a3a8](https://github.com/jansinger/ostsee-tiere/commit/a53a3a8b4c64f4f9448a4ea86cf76d826f1e45c0))
* **map:** let the mouse wheel zoom without a click outside the iframe ([#674](https://github.com/jansinger/ostsee-tiere/issues/674)) ([9e6f3c5](https://github.com/jansinger/ostsee-tiere/commit/9e6f3c5e1bb94e8b35cb45094438962d9abafcb0))
* **map:** let the position picker pan without a position-setting click ([#677](https://github.com/jansinger/ostsee-tiere/issues/677)) ([c10e9aa](https://github.com/jansinger/ostsee-tiere/commit/c10e9aa4a65a9e781b0c0c462073704d293fe302))
* **media:** skip 0-byte source files in legacy upload migration ([#686](https://github.com/jansinger/ostsee-tiere/issues/686)) ([5b28c56](https://github.com/jansinger/ostsee-tiere/commit/5b28c56a26a304838e758b3f8bac0c7e72c709d9))
* **security:** gate showreports.json search behind reporter consent ([#671](https://github.com/jansinger/ostsee-tiere/issues/671)) ([2e86b27](https://github.com/jansinger/ostsee-tiere/commit/2e86b27d86006d8095dc889d388a536acad2cd6b))
* **security:** log error cause chain, keep query params out of the log ([#679](https://github.com/jansinger/ostsee-tiere/issues/679)) ([3f0d9ac](https://github.com/jansinger/ostsee-tiere/commit/3f0d9acb4286718f811f765fa18dbebee066c71d))
* **security:** refuse to start production with a publicly known SESSION_SECRET ([#668](https://github.com/jansinger/ostsee-tiere/issues/668)) ([a7f3e58](https://github.com/jansinger/ostsee-tiere/commit/a7f3e58383eedbd60000b5521c1f47a89ac26e49))
* **security:** stop caching admin-only media in shared caches ([#685](https://github.com/jansinger/ostsee-tiere/issues/685)) ([fa50987](https://github.com/jansinger/ostsee-tiere/commit/fa509877b7ff89c947815d5b26ce3dfd9883ee6c))
* **test:** ignore vitest helper file in playwright test collection ([#684](https://github.com/jansinger/ostsee-tiere/issues/684)) ([ab78ee2](https://github.com/jansinger/ostsee-tiere/commit/ab78ee24584abddda14d18a7c7f3e91d05db472d))
* **test:** stop concurrent admin-session seeding from deleting live rows ([#687](https://github.com/jansinger/ostsee-tiere/issues/687)) ([62808ce](https://github.com/jansinger/ostsee-tiere/commit/62808ceff07377e713bde75682f922e86b2345b6))
* **test:** stop playwright collecting the vitest helper test in e2e/ ([#683](https://github.com/jansinger/ostsee-tiere/issues/683)) ([f6762b4](https://github.com/jansinger/ostsee-tiere/commit/f6762b4443712445f28b80ec66976c35d82a84aa))
* **ui:** make the form stepper look like the navigation it already is ([#680](https://github.com/jansinger/ostsee-tiere/issues/680)) ([db1dd70](https://github.com/jansinger/ostsee-tiere/commit/db1dd70fbde116bb674b00ceae927419aa7654d8))
* **ui:** stepper clipping, sideways page scroll and blocked non-Baltic positions ([#673](https://github.com/jansinger/ostsee-tiere/issues/673)) ([e524726](https://github.com/jansinger/ostsee-tiere/commit/e524726fd334e4b333295b9032500e98ecd05919))


### Documentation

* remove the change-request analysis from the public repo, close the geometry plan ([#676](https://github.com/jansinger/ostsee-tiere/issues/676)) ([45beda6](https://github.com/jansinger/ostsee-tiere/commit/45beda6d6f2442ed8aa47d3507aa8fdbe41f18a3))


### Code Refactoring

* **api:** share LIKE escaping and consent gate between both public search surfaces ([#675](https://github.com/jansinger/ostsee-tiere/issues/675)) ([61d2cbd](https://github.com/jansinger/ostsee-tiere/commit/61d2cbdaffa3fa1beb25c1a696c4f6f15b6ec12a))

## [2.6.2](https://github.com/jansinger/ostsee-tiere/compare/v2.6.1...v2.6.2) (2026-07-30)


### Bug Fixes

* **build:** let the vite config's dep-hash helper into the docker context ([#666](https://github.com/jansinger/ostsee-tiere/issues/666)) ([4b14a0d](https://github.com/jansinger/ostsee-tiere/commit/4b14a0d597bdfda12440ad59732ed9d1c72c5923))

## [2.6.1](https://github.com/jansinger/ostsee-tiere/compare/v2.6.0...v2.6.1) (2026-07-30)


### Bug Fixes

* **ci:** push the release branch as deploy key, not as the bot ([#664](https://github.com/jansinger/ostsee-tiere/issues/664)) ([b334210](https://github.com/jansinger/ostsee-tiere/commit/b334210b227db3c0315297b321b1b049015c6cbd))

## [2.6.0](https://github.com/jansinger/ostsee-tiere/compare/v2.5.5...v2.6.0) (2026-07-30)


### Features

* **admin:** surface photo announcements the app can't upload ([#660](https://github.com/jansinger/ostsee-tiere/issues/660)) ([5b70f39](https://github.com/jansinger/ostsee-tiere/commit/5b70f392a4901788b941fcd29f6719392d270afe))
* **api:** capture legacy-API sightings on disk, and fix what the new client revealed ([#651](https://github.com/jansinger/ostsee-tiere/issues/651)) ([54fbdcf](https://github.com/jansinger/ostsee-tiere/commit/54fbdcf3187e86b2cbb09e02e69b47593d41b8c5))
* **build:** Chrome-vertrauenswürdige TLS-Zertifikate für den Dev-Server ([#592](https://github.com/jansinger/ostsee-tiere/issues/592)) ([6eaa689](https://github.com/jansinger/ostsee-tiere/commit/6eaa689bba9ca0b507c95de093c44e8496f1da63))
* **config:** set up new git worktrees automatically ([#595](https://github.com/jansinger/ostsee-tiere/issues/595)) ([53be14a](https://github.com/jansinger/ostsee-tiere/commit/53be14a4efe70058558f0635f902e6c2faf67595))
* **db:** apply versioned migrations automatically on container startup ([#582](https://github.com/jansinger/ostsee-tiere/issues/582)) ([ad91385](https://github.com/jansinger/ostsee-tiere/commit/ad91385c8d87f139dc6f264a2d2f8c24c123f399))
* **map:** bottom-sheet-panels auf mobile und 320-px-seitenpanels am desktop (H6) ([#603](https://github.com/jansinger/ostsee-tiere/issues/603)) ([2934d11](https://github.com/jansinger/ostsee-tiere/commit/2934d11a371680499c116981e141f4ac2b6cb1f2))
* **map:** consistent species-group color coding for markers and legend ([#597](https://github.com/jansinger/ostsee-tiere/issues/597)) ([6f08170](https://github.com/jansinger/ostsee-tiere/commit/6f0817078333e750ba40b2db22d639324fddb319))
* **map:** dual-range time slider with aria-valuetext and date inputs (M10) ([#610](https://github.com/jansinger/ostsee-tiere/issues/610)) ([8168a3b](https://github.com/jansinger/ostsee-tiere/commit/8168a3b84476a5f2e33a4af148f3436084ca6e6e))
* **map:** feed year dropdown from sightings years endpoint (N4) ([#612](https://github.com/jansinger/ostsee-tiere/issues/612)) ([0d33e71](https://github.com/jansinger/ostsee-tiere/commit/0d33e71e967dafa0b2efdb55316ae475e99e7b66))
* **map:** gps location control aktivieren (UX-Review N2) ([#613](https://github.com/jansinger/ostsee-tiere/issues/613)) ([d024466](https://github.com/jansinger/ostsee-tiere/commit/d0244668e3a520d341ff6782a0ee52fc3e98bacb))
* **map:** seamark layer toggle and ux review fixes (M2, M3, M6, M7) ([#611](https://github.com/jansinger/ostsee-tiere/issues/611)) ([dfdb703](https://github.com/jansinger/ostsee-tiere/commit/dfdb7032d9dce7455eda46c04bfedddd04e87ba8))
* **map:** Tastaturbedienung, Skip-Link und barrierefreie Listenansicht für die Sichtungskarte (K3) ([#598](https://github.com/jansinger/ostsee-tiere/issues/598)) ([533d563](https://github.com/jansinger/ostsee-tiere/commit/533d563b4e87aaec56cdb135476de16db025cd05))
* **map:** url-sync der kartenfilter und entfernbare filter-chips (M4, N6) ([#608](https://github.com/jansinger/ostsee-tiere/issues/608)) ([d1a8323](https://github.com/jansinger/ostsee-tiere/commit/d1a832343cf446a1426f2f4489e334f9664874e6))
* **map:** UX quick wins from sightings map review ([#593](https://github.com/jansinger/ostsee-tiere/issues/593)) ([af1bde7](https://github.com/jansinger/ostsee-tiere/commit/af1bde71a1928ac58d9d94b7b3a5f3c8b7f2d143))
* **media:** Aufräum-Tool für verwaiste Medien-Uploads ([#586](https://github.com/jansinger/ostsee-tiere/issues/586)) ([13de36a](https://github.com/jansinger/ostsee-tiere/commit/13de36a768744a9a062c533a52525ecb1a519e50))
* **report:** Feldfehler des Servers durchreichen und zum Feld springen ([#644](https://github.com/jansinger/ostsee-tiere/issues/644)) ([30be31a](https://github.com/jansinger/ostsee-tiere/commit/30be31aea86659708a16a2b2fc04adc5cde07ae3))
* **report:** Medien-Einwilligung speichern und verwaiste Uploads aufräumen ([#589](https://github.com/jansinger/ostsee-tiere/issues/589)) ([6ec70dc](https://github.com/jansinger/ostsee-tiere/commit/6ec70dc43a92efed5a222ec247d8494ac3e21326))
* **ui:** field mode for the sighting form (PR 3/4) ([#618](https://github.com/jansinger/ostsee-tiere/issues/618)) ([020739c](https://github.com/jansinger/ostsee-tiere/commit/020739cc7117071403ed87b29d6a67abe6af01f3))
* **ui:** styleguide route as living design system reference (PR 2/4) ([#615](https://github.com/jansinger/ostsee-tiere/issues/615)) ([b301c6c](https://github.com/jansinger/ostsee-tiere/commit/b301c6c8d70249f90d66dab5ea50a2a6e1c13fa6))
* **ui:** SubmitStatus, StatusBlock und ConnectionBadge nach main bringen ([#642](https://github.com/jansinger/ostsee-tiere/issues/642)) ([2110317](https://github.com/jansinger/ostsee-tiere/commit/2110317f1317c204b368636ff1775ed37c559b5e))


### Bug Fixes

* **a11y:** add status icons to alerts that had none ([#594](https://github.com/jansinger/ostsee-tiere/issues/594)) ([742f803](https://github.com/jansinger/ostsee-tiere/commit/742f803d46037082f8ca3187e530e92c328f0d19))
* **a11y:** meet WCAG AA contrast and 44px targets in the shared layer ([#599](https://github.com/jansinger/ostsee-tiere/issues/599)) ([d965edf](https://github.com/jansinger/ostsee-tiere/commit/d965edfc4296c8d0641f115fea672f1121ec0a92))
* **a11y:** status colors meet WCAG AA on solid surfaces (PR 1/4) ([#614](https://github.com/jansinger/ostsee-tiere/issues/614)) ([deb0007](https://github.com/jansinger/ostsee-tiere/commit/deb000733ee94fbdc83da94f309e3f6b7bf0bd2c))
* **admin:** show the polygon flag instead of the bounding box in the baltic column ([#649](https://github.com/jansinger/ostsee-tiere/issues/649)) ([7a91f0e](https://github.com/jansinger/ostsee-tiere/commit/7a91f0e4b30fad89a5582e84a58e814132f3bc52))
* **admin:** stop 13 years of legacy mediaUpload rows from faking a work list ([#663](https://github.com/jansinger/ostsee-tiere/issues/663)) ([618f1e0](https://github.com/jansinger/ostsee-tiere/commit/618f1e086138344236ae5539d79606f69dedf8ca))
* **api:** align legacy REST API with the binding contract ([#638](https://github.com/jansinger/ostsee-tiere/issues/638)) ([032ffec](https://github.com/jansinger/ostsee-tiere/commit/032ffec3adb708d2d8aa2c3e580ee05d26ea230e))
* **api:** correct required-field message for legacy vorname/name ([#648](https://github.com/jansinger/ostsee-tiere/issues/648)) ([f6ef2e3](https://github.com/jansinger/ostsee-tiere/commit/f6ef2e30409d4b0deee69dc204904378e2a73a5a))
* **api:** derive the baltic status from one function everywhere ([#650](https://github.com/jansinger/ostsee-tiere/issues/650)) ([03c1547](https://github.com/jansinger/ostsee-tiere/commit/03c154738af6084ea10a26fe73bb3fc32bd23cab))
* **api:** Freigabe-Workflow auf einen Endpunkt vereinheitlichen ([#576](https://github.com/jansinger/ostsee-tiere/issues/576)) ([8895a72](https://github.com/jansinger/ostsee-tiere/commit/8895a7200034e983dbaf58ebaa9d0d80c4602d2b))
* **api:** let passenger load the service without top-level await ([#659](https://github.com/jansinger/ostsee-tiere/issues/659)) ([79d5e9b](https://github.com/jansinger/ostsee-tiere/commit/79d5e9b24e1a96c03e4e922a57eae22900083ee9))
* **api:** öffentliche Statistiken zählen nur noch geprüfte Sichtungen ([#579](https://github.com/jansinger/ostsee-tiere/issues/579)) ([6313021](https://github.com/jansinger/ostsee-tiere/commit/6313021fade6adcb4ca9e5180aac1b67b672514b))
* **build:** keep vite dep-optimizer cache valid across dev restarts ([#616](https://github.com/jansinger/ostsee-tiere/issues/616)) ([32d997a](https://github.com/jansinger/ostsee-tiere/commit/32d997a083ed69fb1f8960cd32a2bc6a9a51c954))
* **ci:** gate production behind staging and propagate build failures ([#617](https://github.com/jansinger/ostsee-tiere/issues/617)) ([da39a50](https://github.com/jansinger/ostsee-tiere/commit/da39a509eb99c2c7b44b3292e27eea7e57990f14))
* **ci:** run E2E tests for PRs that only touch e2e/ ([#643](https://github.com/jansinger/ostsee-tiere/issues/643)) ([cacd291](https://github.com/jansinger/ostsee-tiere/commit/cacd291d5229e35b769f1b5c28271ca824b6bd5c))
* **config:** UPLOAD_PATH wird gelesen statt hartkodiert ([#585](https://github.com/jansinger/ostsee-tiere/issues/585)) ([b91845c](https://github.com/jansinger/ostsee-tiere/commit/b91845c96109d544ae95c77a6538ad003f6d6248))
* **db:** compare DST boundaries on wall-clock time, not the UTC instant ([#577](https://github.com/jansinger/ostsee-tiere/issues/577)) ([3247de6](https://github.com/jansinger/ostsee-tiere/commit/3247de6b518553063211cf1a832e4a1e79db4c71))
* **db:** stop default 0 from asserting answers nobody gave ([#605](https://github.com/jansinger/ostsee-tiere/issues/605)) ([3cb030a](https://github.com/jansinger/ostsee-tiere/commit/3cb030aba31797de9881efc33ecc8f40660987cb))
* **db:** Zeitzonen-Ausdrücke zwischen Indizes und Abfragen angleichen ([#575](https://github.com/jansinger/ostsee-tiere/issues/575)) ([8fc4b43](https://github.com/jansinger/ostsee-tiere/commit/8fc4b4317100275fabf4191d9c68f5f3926c08a8))
* **db:** Zeitzonen-Semantik vereinheitlichen und TZ explizit setzen ([#572](https://github.com/jansinger/ostsee-tiere/issues/572)) ([0eab659](https://github.com/jansinger/ostsee-tiere/commit/0eab6592e314db33bf9be0f6a97a2adf63f3fcf4))
* konsistente Zeitzonen-Behandlung vor Inbetriebnahme ([#581](https://github.com/jansinger/ostsee-tiere/issues/581)) ([d79571d](https://github.com/jansinger/ostsee-tiere/commit/d79571d85a99b86c9044cda5d689eaf5b9130f12))
* **map:** clean the baltic geometry and derive the bounding box from it ([#647](https://github.com/jansinger/ostsee-tiere/issues/647)) ([ecfa4b9](https://github.com/jansinger/ostsee-tiere/commit/ecfa4b903ec50cd975aaf19b061a9325f7019b9e))
* **map:** korrekte ARIA-Semantik der Karten-Panels und WCAG-konforme Tastaturkürzel (H5, H7) ([#601](https://github.com/jansinger/ostsee-tiere/issues/601)) ([7b56e3c](https://github.com/jansinger/ostsee-tiere/commit/7b56e3c14cf8cc020991654ae7190a8bc0fb1f33))
* **media:** Storage-Dateien beim Löschen von Sichtungs-Dateizeilen mitlöschen ([#584](https://github.com/jansinger/ostsee-tiere/issues/584)) ([e664e9e](https://github.com/jansinger/ostsee-tiere/commit/e664e9e8c8963b41adcad8af69f9d4f02a260997))
* **report:** Bestimmungshilfe fachlich korrigieren und zur Feldbestimmung umbauen ([#568](https://github.com/jansinger/ostsee-tiere/issues/568)) ([2efd337](https://github.com/jansinger/ostsee-tiere/commit/2efd33708a52bc2673f1b669bbc10d7964099d7f))
* **report:** erfundene Statistiken aus Bürgertexten entfernen ([#571](https://github.com/jansinger/ostsee-tiere/issues/571)) ([adc0d3b](https://github.com/jansinger/ostsee-tiere/commit/adc0d3bbb1599a359b4fa5cd8e6f0d47876508c3))
* **report:** Phantom-Position entfernen und Formular-UX reparieren ([#567](https://github.com/jansinger/ostsee-tiere/issues/567)) ([7659d86](https://github.com/jansinger/ostsee-tiere/commit/7659d86bd271ab783ee7e6a8670d3105f3cfcc22))
* **report:** Schweinswal-Angaben an DMM-Steckbrief angleichen ([#591](https://github.com/jansinger/ostsee-tiere/issues/591)) ([94fd2ec](https://github.com/jansinger/ostsee-tiere/commit/94fd2ec9ca6f3bacafafd28b3b2dcf2669a76a8b))
* **test:** allow serving main-repo node_modules to browser tests in worktrees ([#606](https://github.com/jansinger/ostsee-tiere/issues/606)) ([1dda527](https://github.com/jansinger/ostsee-tiere/commit/1dda52785c2c83fdaf687050c90a9dd3a124791e))
* **test:** freeze system clock in weather endpoint selection tests ([#609](https://github.com/jansinger/ostsee-tiere/issues/609)) ([a167156](https://github.com/jansinger/ostsee-tiere/commit/a16715627a37e7ba499c13bc5c5902a7e142fb98))
* **test:** stop stream-abort tests colliding with unrelated services on the same port ([#658](https://github.com/jansinger/ostsee-tiere/issues/658)) ([e4f3b12](https://github.com/jansinger/ostsee-tiere/commit/e4f3b128e54611958c11e89afe63299c2087fcbe))
* **ui:** close the white/black hole in the design-system scan ([#637](https://github.com/jansinger/ostsee-tiere/issues/637)) ([a828261](https://github.com/jansinger/ostsee-tiere/commit/a8282613f701c59788209cffbf0756a9ba08d594))
* **ui:** keep error toasts on screen and stop leaking JSON parse errors ([#623](https://github.com/jansinger/ostsee-tiere/issues/623)) ([3c2f5fd](https://github.com/jansinger/ostsee-tiere/commit/3c2f5fd6f7a180b6c75c0d689724a2812f3a7b2d))
* **ui:** UI/UX-Befunde aus dem Review vom 2026-07-30 abarbeiten ([#639](https://github.com/jansinger/ostsee-tiere/issues/639)) ([e908542](https://github.com/jansinger/ostsee-tiere/commit/e908542350c27fce4bc92350bbbd488223d104fe))


### Documentation

* **admin:** inventory the admin patterns, states and theme violations ([#628](https://github.com/jansinger/ostsee-tiere/issues/628)) ([f920e1b](https://github.com/jansinger/ostsee-tiere/commit/f920e1b83cc59f3bc731191cf4dd9cca5991f950))
* **api:** name the nginx directive that actually works under passenger ([#661](https://github.com/jansinger/ostsee-tiere/issues/661)) ([3b93e75](https://github.com/jansinger/ostsee-tiere/commit/3b93e75b422ed4720521af5ae2605abda78fd01f))
* **api:** warn that verifying the perimeter can trigger fail2ban ([#662](https://github.com/jansinger/ostsee-tiere/issues/662)) ([2ee60c7](https://github.com/jansinger/ostsee-tiere/commit/2ee60c7a3982ecd7d51b3bd863d97418fc4a16e0))
* archive point-in-time reports out of docs/ root ([#633](https://github.com/jansinger/ostsee-tiere/issues/633)) ([b6b9bf8](https://github.com/jansinger/ostsee-tiere/commit/b6b9bf872498e4e7726320445c9b4771bd16b485))
* bring README, SECURITY and THIRD-PARTY-NOTICES back in line with the code ([#645](https://github.com/jansinger/ostsee-tiere/issues/645)) ([3cab290](https://github.com/jansinger/ostsee-tiere/commit/3cab290337b73cf08fd23b24fc13453cc4b9a13b))
* correct `latest` tag semantics in run-release.sh and deployment guide ([#646](https://github.com/jansinger/ostsee-tiere/issues/646)) ([7119d51](https://github.com/jansinger/ostsee-tiere/commit/7119d51453aa65a83a6ee140de4db4e1fc1c27db))
* correct Docker deployment guides and remove the unused monitoring stack ([#640](https://github.com/jansinger/ostsee-tiere/issues/640)) ([62b9b90](https://github.com/jansinger/ostsee-tiere/commit/62b9b906a0ecd0d82d50b98f6c706be30e0f7715))
* **docs:** sync position docs with the merged single-panel state ([#596](https://github.com/jansinger/ostsee-tiere/issues/596)) ([b828454](https://github.com/jansinger/ostsee-tiere/commit/b82845426ee4cccb6d1fe727fbcaf225dd0559c6))
* fix documentation that contradicts the code ([#604](https://github.com/jansinger/ostsee-tiere/issues/604)) ([1dea25c](https://github.com/jansinger/ostsee-tiere/commit/1dea25c23b162e5a8cf13363a7d0f87f858ee80e))
* mark error 2 as fixed and back it with the measurements. Error 4 is ([7a91f0e](https://github.com/jansinger/ostsee-tiere/commit/7a91f0e4b30fad89a5582e84a58e814132f3bc52))
* refresh the sighting form UX review backlog and record the base-300 contrast limit ([#602](https://github.com/jansinger/ostsee-tiere/issues/602)) ([4142289](https://github.com/jansinger/ostsee-tiere/commit/41422896fc4579b44e6720a9fba4056e76f98f18))
* **report:** align form documentation with the implementation ([#569](https://github.com/jansinger/ostsee-tiere/issues/569)) ([c79579a](https://github.com/jansinger/ostsee-tiere/commit/c79579af1b76645a91b2aacdaab571eafc8d4c9c))
* **report:** design for single-panel location input in step 1 ([#588](https://github.com/jansinger/ostsee-tiere/issues/588)) ([b5a7964](https://github.com/jansinger/ostsee-tiere/commit/b5a79649ada0cf9bf671bb4416785e6aade411f1))


### Code Refactoring

* **config:** remove unused UPLOAD_PATHS constant ([#587](https://github.com/jansinger/ostsee-tiere/issues/587)) ([346a2b7](https://github.com/jansinger/ostsee-tiere/commit/346a2b702ab5a301b5dba7978c092d64067ef68e))
* **map:** remove dead panel-manager code (UX review N1) ([#607](https://github.com/jansinger/ostsee-tiere/issues/607)) ([d001fc2](https://github.com/jansinger/ostsee-tiere/commit/d001fc297a1823d0c3e0363406fd16fbfeea22d9))
* **report:** replace the position method chooser with one panel ([#590](https://github.com/jansinger/ostsee-tiere/issues/590)) ([a7cbb2e](https://github.com/jansinger/ostsee-tiere/commit/a7cbb2e4b7ce435f49533bb4a8b19222e373f763))
* **types:** remove unused duplicate map type definitions ([#600](https://github.com/jansinger/ostsee-tiere/issues/600)) ([a305009](https://github.com/jansinger/ostsee-tiere/commit/a305009ba6be0e75ac261cfa8ca739a842786c19))
* **ui:** return the last hardcoded areas to the design system (PR 4/4) ([#620](https://github.com/jansinger/ostsee-tiere/issues/620)) ([3dde27f](https://github.com/jansinger/ostsee-tiere/commit/3dde27fc47d1c4da4eb84a713d782d24ff549e99))


### Dependencies

* **deps:** bump @fontsource/roboto from 5.2.10 to 5.3.0 ([#553](https://github.com/jansinger/ostsee-tiere/issues/553)) ([0576a4a](https://github.com/jansinger/ostsee-tiere/commit/0576a4a8d38b7d829b877fd95ca2334f1de7a5b2))
* **deps:** bump @iconify/json from 2.2.481 to 2.2.506 ([#654](https://github.com/jansinger/ostsee-tiere/issues/654)) ([d6286c9](https://github.com/jansinger/ostsee-tiere/commit/d6286c94f276bb3a87819d633262a496e77c635c))
* **deps:** bump @scalar/sveltekit from 0.3.8 to 0.3.11 ([#655](https://github.com/jansinger/ostsee-tiere/issues/655)) ([2dcbb09](https://github.com/jansinger/ostsee-tiere/commit/2dcbb09c9dc2e741bc100c5204f4e8d53a9a2a5f))
* **deps:** bump @tailwindcss/vite from 4.3.2 to 4.3.3 ([#563](https://github.com/jansinger/ostsee-tiere/issues/563)) ([0d84c61](https://github.com/jansinger/ostsee-tiere/commit/0d84c61dc606db13113673bd782414022d49d70c))
* **deps:** bump actions/setup-node in the github-actions group ([#549](https://github.com/jansinger/ostsee-tiere/issues/549)) ([da3750e](https://github.com/jansinger/ostsee-tiere/commit/da3750e760e606fa06f035c96d55da033a471453))
* **deps:** bump daisyui from 5.6.13 to 5.7.4 ([#562](https://github.com/jansinger/ostsee-tiere/issues/562)) ([7d51aff](https://github.com/jansinger/ostsee-tiere/commit/7d51aff09e0d44b217d2ffbc176dacfa0f98365b))
* **deps:** bump fast-uri from 3.1.2 to 3.1.4 ([#557](https://github.com/jansinger/ostsee-tiere/issues/557)) ([723351e](https://github.com/jansinger/ostsee-tiere/commit/723351e957759aab5a672256394bb8bb5c8818e1))
* **deps:** bump globals from 17.6.0 to 17.7.0 ([#554](https://github.com/jansinger/ostsee-tiere/issues/554)) ([8123a5e](https://github.com/jansinger/ostsee-tiere/commit/8123a5ea76939d269d5fe56a159a276427d2b0f5))
* **deps:** bump globals from 17.7.0 to 17.8.0 ([#656](https://github.com/jansinger/ostsee-tiere/issues/656)) ([251bb78](https://github.com/jansinger/ostsee-tiere/commit/251bb78e0d254378cabc75937ff3349890848211))
* **deps:** bump svelte in the svelte-framework group ([#561](https://github.com/jansinger/ostsee-tiere/issues/561)) ([35cbf95](https://github.com/jansinger/ostsee-tiere/commit/35cbf95f40780506bdde997aeb4ce0db0a84da22))
* **deps:** bump svelte-check in the dev-tooling group ([#653](https://github.com/jansinger/ostsee-tiere/issues/653)) ([6dd2afa](https://github.com/jansinger/ostsee-tiere/commit/6dd2afa3c08b9a6aca0925bd5a2870bafba15464))
* **deps:** bump tailwindcss from 4.3.2 to 4.3.3 ([#552](https://github.com/jansinger/ostsee-tiere/issues/552)) ([e99fa3f](https://github.com/jansinger/ostsee-tiere/commit/e99fa3f87b62c091e57669bab93c62cf27c25378))
* **deps:** bump the dev-tooling group across 1 directory with 5 updates ([#556](https://github.com/jansinger/ostsee-tiere/issues/556)) ([f54e654](https://github.com/jansinger/ostsee-tiere/commit/f54e6549acb15252ca0d8c735209e690bb7b073a))
* **deps:** bump the dev-tooling group with 3 updates ([#560](https://github.com/jansinger/ostsee-tiere/issues/560)) ([0726851](https://github.com/jansinger/ostsee-tiere/commit/0726851e9374a2a12b2cf8b25f4387ff40053f74))
* **deps:** bump the github-actions group with 2 updates ([#657](https://github.com/jansinger/ostsee-tiere/issues/657)) ([051edbb](https://github.com/jansinger/ostsee-tiere/commit/051edbb0ac45029e911f0522aa59296aababec73))
* **deps:** bump the production-dependencies group with 2 updates ([#559](https://github.com/jansinger/ostsee-tiere/issues/559)) ([bb0f720](https://github.com/jansinger/ostsee-tiere/commit/bb0f7209ad08922dac8dace9d89697ee519fcd04))
* **deps:** bump the svelte-framework group with 3 updates ([#551](https://github.com/jansinger/ostsee-tiere/issues/551)) ([9b78acc](https://github.com/jansinger/ostsee-tiere/commit/9b78acc4721fcd794d89892379afde00589d4e22))

## [2.5.5](https://github.com/jansinger/ostsee-sichtung/compare/v2.5.4...v2.5.5) (2026-07-15)


### Dependencies

* **deps:** bump @tailwindcss/vite from 4.3.0 to 4.3.2 ([#544](https://github.com/jansinger/ostsee-sichtung/issues/544)) ([054455f](https://github.com/jansinger/ostsee-sichtung/commit/054455f61e4f58bfc676ac47091ea2775338f6b5))
* **deps:** bump daisyui from 5.5.23 to 5.6.13 ([#543](https://github.com/jansinger/ostsee-sichtung/issues/543)) ([16735d5](https://github.com/jansinger/ostsee-sichtung/commit/16735d589db2baa61549a09310d3b50d8120fb24))
* **deps:** bump the dev-tooling group across 1 directory with 10 updates ([#547](https://github.com/jansinger/ostsee-sichtung/issues/547)) ([1dee25c](https://github.com/jansinger/ostsee-sichtung/commit/1dee25c3634fa3eb1866ea1bd8be6fb764eff506))
* **deps:** bump the production-dependencies group across 1 directory with 2 updates ([#545](https://github.com/jansinger/ostsee-sichtung/issues/545)) ([e6d8623](https://github.com/jansinger/ostsee-sichtung/commit/e6d8623ffc9017698e713033c33a93b503c8118c))
* **deps:** bump the svelte-framework group across 1 directory with 3 updates ([#546](https://github.com/jansinger/ostsee-sichtung/issues/546)) ([7bb348c](https://github.com/jansinger/ostsee-sichtung/commit/7bb348c225b1a91bc66f80ca5e0cce2be26c8499))

## [2.5.4](https://github.com/jansinger/ostsee-sichtung/compare/v2.5.3...v2.5.4) (2026-07-04)


### Dependencies

* **deps:** bump @cyclonedx/cyclonedx-npm from 4.2.1 to 5.0.0 ([#529](https://github.com/jansinger/ostsee-sichtung/issues/529)) ([f07d987](https://github.com/jansinger/ostsee-sichtung/commit/f07d9879300a1353d7d715763b20dc848fbe20ff))
* **deps:** bump @scalar/sveltekit from 0.2.19 to 0.3.8 ([#515](https://github.com/jansinger/ostsee-sichtung/issues/515)) ([39cfc55](https://github.com/jansinger/ostsee-sichtung/commit/39cfc557392fec6700bcbbcdb496519eeebf0746))
* **deps:** bump @vitest/browser from 4.1.6 to 4.1.8 ([#520](https://github.com/jansinger/ostsee-sichtung/issues/520)) ([2aeec8f](https://github.com/jansinger/ostsee-sichtung/commit/2aeec8f054640a5327a1571fb1e06e7d57d582bc))
* **deps:** bump @vitest/browser from 4.1.8 to 4.1.9 ([#537](https://github.com/jansinger/ostsee-sichtung/issues/537)) ([a6e17e3](https://github.com/jansinger/ostsee-sichtung/commit/a6e17e39111a60c177ecfe6e812eb27c30c31faa))
* **deps:** bump daisyui from 5.5.19 to 5.5.23 ([#516](https://github.com/jansinger/ostsee-sichtung/issues/516)) ([a26fa36](https://github.com/jansinger/ostsee-sichtung/commit/a26fa36452a3c7e11966ca345a2b704b5d9da846))
* **deps:** bump form-data ([#523](https://github.com/jansinger/ostsee-sichtung/issues/523)) ([b209eb8](https://github.com/jansinger/ostsee-sichtung/commit/b209eb8eecc300d45c1a405c53e4a2ccb5c4df66))
* **deps:** bump js-yaml from 4.1.1 to 4.3.0 ([#533](https://github.com/jansinger/ostsee-sichtung/issues/533)) ([91ef63c](https://github.com/jansinger/ostsee-sichtung/commit/91ef63cc8be418a9b710d982545a49c7b6dbfc9d))
* **deps:** bump nodemailer from 8.0.11 to 9.0.1 ([#522](https://github.com/jansinger/ostsee-sichtung/issues/522)) ([c231fef](https://github.com/jansinger/ostsee-sichtung/commit/c231fef5486bc7086f0de64555b40f5eb0dffa43))
* **deps:** bump nodemailer from 9.0.1 to 9.0.3 ([#539](https://github.com/jansinger/ostsee-sichtung/issues/539)) ([500a541](https://github.com/jansinger/ostsee-sichtung/commit/500a54121860f239d0a52d567dc4da6323e05b89))
* **deps:** bump tar from 7.5.11 to 7.5.19 ([#532](https://github.com/jansinger/ostsee-sichtung/issues/532)) ([d5a2fb6](https://github.com/jansinger/ostsee-sichtung/commit/d5a2fb6aa54d76aac543b552127a6c809b2bc2c6))
* **deps:** bump the dev-tooling group across 1 directory with 13 updates ([#538](https://github.com/jansinger/ostsee-sichtung/issues/538)) ([d0a0a8e](https://github.com/jansinger/ostsee-sichtung/commit/d0a0a8ec07b756e8dda9a18cca4abbaf3231466e))
* **deps:** bump the github-actions group across 1 directory with 2 updates ([#534](https://github.com/jansinger/ostsee-sichtung/issues/534)) ([aabbc6b](https://github.com/jansinger/ostsee-sichtung/commit/aabbc6baa083e99dc288b61b0b80ec2082bee612))
* **deps:** bump the production-dependencies group across 1 directory with 4 updates ([#526](https://github.com/jansinger/ostsee-sichtung/issues/526)) ([12a7aaf](https://github.com/jansinger/ostsee-sichtung/commit/12a7aaf541c03a60a458b4804da1eec95e573929))
* **deps:** bump the svelte-framework group across 1 directory with 5 updates ([#535](https://github.com/jansinger/ostsee-sichtung/issues/535)) ([99e0b1a](https://github.com/jansinger/ostsee-sichtung/commit/99e0b1a150ea326033273629a7f709155e1da966))
* **deps:** bump undici from 6.24.1 to 6.27.0 ([#531](https://github.com/jansinger/ostsee-sichtung/issues/531)) ([8c6978c](https://github.com/jansinger/ostsee-sichtung/commit/8c6978ca6f9810dbc78481ee1001715f7905f2db))

## [2.5.3](https://github.com/jansinger/ostsee-sichtung/compare/v2.5.2...v2.5.3) (2026-06-01)


### Dependencies

* **deps:** bump @iconify/json from 2.2.459 to 2.2.481 ([#503](https://github.com/jansinger/ostsee-sichtung/issues/503)) ([0726ed0](https://github.com/jansinger/ostsee-sichtung/commit/0726ed0f8e61b5733c059e17a00fa79fddc10a8c))
* **deps:** bump @scalar/sveltekit from 0.2.3 to 0.2.19 ([#504](https://github.com/jansinger/ostsee-sichtung/issues/504)) ([444137f](https://github.com/jansinger/ostsee-sichtung/commit/444137f49025fbdb70c80ecf020297ae695f8c04))
* **deps:** bump globals from 17.5.0 to 17.6.0 ([#505](https://github.com/jansinger/ostsee-sichtung/issues/505)) ([35cb9c0](https://github.com/jansinger/ostsee-sichtung/commit/35cb9c0104a294212befb81c1dc3bbd72879c0f9))
* **deps:** bump the production-dependencies group across 1 directory with 3 updates ([#508](https://github.com/jansinger/ostsee-sichtung/issues/508)) ([0b51e9d](https://github.com/jansinger/ostsee-sichtung/commit/0b51e9dc65d5abd07105d09eb1de606d2a546df3))
* **deps:** bump the svelte-framework group across 1 directory with 3 updates ([#507](https://github.com/jansinger/ostsee-sichtung/issues/507)) ([f005bab](https://github.com/jansinger/ostsee-sichtung/commit/f005bab36b1aea8b4292170a2a4b48a13fde2e9b))

## [2.5.2](https://github.com/jansinger/ostsee-sichtung/compare/v2.5.1...v2.5.2) (2026-05-17)


### Dependencies

* **deps:** bump @tailwindcss/vite from 4.2.2 to 4.3.0 ([#487](https://github.com/jansinger/ostsee-sichtung/issues/487)) ([c7d37d6](https://github.com/jansinger/ostsee-sichtung/commit/c7d37d60fa66336b2a44611fe313bf830a3ad7b0))
* **deps:** bump axios from 1.15.0 to 1.16.1 ([#499](https://github.com/jansinger/ostsee-sichtung/issues/499)) ([e1b0506](https://github.com/jansinger/ostsee-sichtung/commit/e1b05060f5541a0ab0e46193d654fd3f83e3bfe7))
* **deps:** bump fast-uri from 3.1.0 to 3.1.2 ([#493](https://github.com/jansinger/ostsee-sichtung/issues/493)) ([59ec464](https://github.com/jansinger/ostsee-sichtung/commit/59ec464ddf9b7a8bac7cd0c0a9ad024218deb0e0))
* **deps:** bump ip-address from 10.1.0 to 10.2.0 ([#491](https://github.com/jansinger/ostsee-sichtung/issues/491)) ([b707960](https://github.com/jansinger/ostsee-sichtung/commit/b70796028293404f66463400b9c1df4465354ce1))
* **deps:** bump sanitize-html from 2.17.3 to 2.17.4 ([#498](https://github.com/jansinger/ostsee-sichtung/issues/498)) ([caeb99c](https://github.com/jansinger/ostsee-sichtung/commit/caeb99cc9b80d1297656113436fda6c7230634d6))
* **deps:** bump svelte from 5.55.5 to 5.55.7 ([#497](https://github.com/jansinger/ostsee-sichtung/issues/497)) ([cabb3c5](https://github.com/jansinger/ostsee-sichtung/commit/cabb3c538d5c0d6d65dbb28b205e33e8d61aed6a))
* **deps:** bump tailwindcss from 4.2.2 to 4.3.0 ([#488](https://github.com/jansinger/ostsee-sichtung/issues/488)) ([8bf2502](https://github.com/jansinger/ostsee-sichtung/commit/8bf25029bf3ebe044175420441c41ce7b71274c4))
* **deps:** bump the dev-tooling group across 1 directory with 16 updates ([#500](https://github.com/jansinger/ostsee-sichtung/issues/500)) ([e1136eb](https://github.com/jansinger/ostsee-sichtung/commit/e1136eb41661b12a2cd7e1b25674327001d53483))
* **deps:** bump the github-actions group with 2 updates ([#484](https://github.com/jansinger/ostsee-sichtung/issues/484)) ([d671e4d](https://github.com/jansinger/ostsee-sichtung/commit/d671e4d003bdc0052c758a86804610b40b445b32))
* **deps:** bump the production-dependencies group across 1 directory with 3 updates ([#495](https://github.com/jansinger/ostsee-sichtung/issues/495)) ([54845fb](https://github.com/jansinger/ostsee-sichtung/commit/54845fb34d296d83ae83ef925920f84b647e6a25))
* **deps:** bump the svelte-framework group across 1 directory with 4 updates ([#494](https://github.com/jansinger/ostsee-sichtung/issues/494)) ([15aef6b](https://github.com/jansinger/ostsee-sichtung/commit/15aef6b0a62677d5c9fc6db2cc5f11859ecdead4))
* **deps:** bump typescript-eslint ([#481](https://github.com/jansinger/ostsee-sichtung/issues/481)) ([86a9b9e](https://github.com/jansinger/ostsee-sichtung/commit/86a9b9ee903edc34a95af81d6e4315a0be281115))

## [2.5.1](https://github.com/jansinger/ostsee-sichtung/compare/v2.5.0...v2.5.1) (2026-04-21)


### Dependencies

* **deps:** bump protocol-buffers-schema from 3.6.0 to 3.6.1 ([#476](https://github.com/jansinger/ostsee-sichtung/issues/476)) ([80f996d](https://github.com/jansinger/ostsee-sichtung/commit/80f996d1409abc4a220d7631090587c0e96715b7))
* **deps:** bump sanitize-html from 2.17.2 to 2.17.3 ([#475](https://github.com/jansinger/ostsee-sichtung/issues/475)) ([b0ebccb](https://github.com/jansinger/ostsee-sichtung/commit/b0ebccbd4f4e7264af20c5baa629574831b90e01))
* **deps:** bump the dev-tooling group with 3 updates ([#478](https://github.com/jansinger/ostsee-sichtung/issues/478)) ([67f6b56](https://github.com/jansinger/ostsee-sichtung/commit/67f6b56150aa2b27da3cf45d689394e4ac463c65))
* **deps:** bump the production-dependencies group with 5 updates ([#477](https://github.com/jansinger/ostsee-sichtung/issues/477)) ([f2e3071](https://github.com/jansinger/ostsee-sichtung/commit/f2e3071e729844d166c6db8ffb3ea0fb2242022a))
* **deps:** bump the svelte-framework group with 2 updates ([#479](https://github.com/jansinger/ostsee-sichtung/issues/479)) ([70ab518](https://github.com/jansinger/ostsee-sichtung/commit/70ab51870ebf3670b45aa85ab8ab2a0ff80f52fa))

## [2.5.0](https://github.com/jansinger/ostsee-sichtung/compare/v2.4.1...v2.5.0) (2026-04-16)


### Features

* **security:** spam-check improvements with admin UI and SpamScanner integration ([#474](https://github.com/jansinger/ostsee-sichtung/issues/474)) ([490021f](https://github.com/jansinger/ostsee-sichtung/commit/490021f730fc9c68173c98b5c714e17a69b651e8))


### Bug Fixes

* **admin,security:** harden admin area against security and reactivity issues ([#472](https://github.com/jansinger/ostsee-sichtung/issues/472)) ([6068484](https://github.com/jansinger/ostsee-sichtung/commit/6068484f22218ece367f8cffaf299edbedde286f))

## [2.4.1](https://github.com/jansinger/ostsee-sichtung/compare/v2.4.0...v2.4.1) (2026-04-15)


### Bug Fixes

* **admin,ui:** correct outdated docs and about page content ([#470](https://github.com/jansinger/ostsee-sichtung/issues/470)) ([af077c9](https://github.com/jansinger/ostsee-sichtung/commit/af077c9b0d7e7968faa866e60f25252a9508eaac))

## [2.4.0](https://github.com/jansinger/ostsee-sichtung/compare/v2.3.1...v2.4.0) (2026-04-15)


### Features

* **security:** hybrid audit logging for admin actions ([#468](https://github.com/jansinger/ostsee-sichtung/issues/468)) ([6ad53f4](https://github.com/jansinger/ostsee-sichtung/commit/6ad53f4d2b1f51c95f40834331d47e3afd1b3d33))

## [2.3.1](https://github.com/jansinger/ostsee-sichtung/compare/v2.3.0...v2.3.1) (2026-04-15)


### Bug Fixes

* **api,ui:** safe getClientAddress, optional other-text fields, lightbox fixes ([#466](https://github.com/jansinger/ostsee-sichtung/issues/466)) ([229813c](https://github.com/jansinger/ostsee-sichtung/commit/229813cb329af83d1f84b3f76178427849b6c2d6))

## [2.3.0](https://github.com/jansinger/ostsee-sichtung/compare/v2.2.3...v2.3.0) (2026-04-14)


### Features

* **deps:** upgrade vite 7→8, vite-plugin-svelte 6→7, @types/nodemailer 7→8 ([#463](https://github.com/jansinger/ostsee-sichtung/issues/463)) ([4842e5d](https://github.com/jansinger/ostsee-sichtung/commit/4842e5d56e2e0ae73451ef68a5f38592e8d2594e))


### Bug Fixes

* **map,security:** admin + map code review fixes ([#456](https://github.com/jansinger/ostsee-sichtung/issues/456)) ([71f0934](https://github.com/jansinger/ostsee-sichtung/commit/71f0934615c7365ed2aad083c6a4d23aeae9b1dd))


### Documentation

* **api:** complete openapi spec audit — 13 missing endpoints, 2 fixes ([#460](https://github.com/jansinger/ostsee-sichtung/issues/460)) ([d4ac41a](https://github.com/jansinger/ostsee-sichtung/commit/d4ac41a2e69dc2fdafc1269601a11ca7aef0fc9b))
* docs audit + .claude rules refresh (Svelte 5, DaisyUI v5, OL10) ([#461](https://github.com/jansinger/ostsee-sichtung/issues/461)) ([4320374](https://github.com/jansinger/ostsee-sichtung/commit/43203745310d6e470f382861c7d1829c57ed62b4))
* **docs:** update form code review — 22/25 findings resolved ([#459](https://github.com/jansinger/ostsee-sichtung/issues/459)) ([436346a](https://github.com/jansinger/ostsee-sichtung/commit/436346a6ce310069559b7f65305bcfdbadc3a2ff))
* **security:** update vulnerability assessment after deps cleanup ([#465](https://github.com/jansinger/ostsee-sichtung/issues/465)) ([ce7ea9c](https://github.com/jansinger/ostsee-sichtung/commit/ce7ea9c3f280fb307c9f3c29330c61c4c4aa34fd))
* sync documentation after form and map/security review fixes ([#454](https://github.com/jansinger/ostsee-sichtung/issues/454), [#456](https://github.com/jansinger/ostsee-sichtung/issues/456)) ([#458](https://github.com/jansinger/ostsee-sichtung/issues/458)) ([6d7ffa1](https://github.com/jansinger/ostsee-sichtung/commit/6d7ffa1bb161082e7bc5fbe97cc3301716b5228f))


### Code Refactoring

* **deps:** replace svelte-forms-lib with custom createForm ([#464](https://github.com/jansinger/ostsee-sichtung/issues/464)) ([9a4e25e](https://github.com/jansinger/ostsee-sichtung/commit/9a4e25e581ddfca7d5cc4652ead96826128fbd72))

## [2.2.3](https://github.com/jansinger/ostsee-sichtung/compare/v2.2.2...v2.2.3) (2026-04-13)


### Bug Fixes

* **report:** form review fixes — yup conditions, a11y, performance ([#454](https://github.com/jansinger/ostsee-sichtung/issues/454)) ([41d6838](https://github.com/jansinger/ostsee-sichtung/commit/41d6838fa1307e27413fbfec55debd09105ee96d))

## [2.2.2](https://github.com/jansinger/ostsee-sichtung/compare/v2.2.1...v2.2.2) (2026-04-13)


### Bug Fixes

* **report:** sighting form code review + DaisyUI v5 theme migration ([#444](https://github.com/jansinger/ostsee-sichtung/issues/444)) ([8e60b35](https://github.com/jansinger/ostsee-sichtung/commit/8e60b35a83b989cf1557f063fdf614f8135147a7))


### Dependencies

* **deps:** bump @scalar/api-reference from 1.49.7 to 1.52.1 ([#450](https://github.com/jansinger/ostsee-sichtung/issues/450)) ([5109519](https://github.com/jansinger/ostsee-sichtung/commit/5109519dd7147f1c93a5efd72bd5fc995e0223a9))
* **deps:** bump dotenv from 17.3.1 to 17.4.2 ([#449](https://github.com/jansinger/ostsee-sichtung/issues/449)) ([676f488](https://github.com/jansinger/ostsee-sichtung/commit/676f488a80ffdf9f8fcefe1b4c3113f3a52a9bf4))
* **deps:** bump globals from 17.4.0 to 17.5.0 ([#451](https://github.com/jansinger/ostsee-sichtung/issues/451)) ([2178d0b](https://github.com/jansinger/ostsee-sichtung/commit/2178d0b57f593715ec707d49c18cafb13aa84e1d))
* **deps:** bump the dev-tooling group with 9 updates ([#447](https://github.com/jansinger/ostsee-sichtung/issues/447)) ([ae87225](https://github.com/jansinger/ostsee-sichtung/commit/ae872256805848672b0e43c8479bae71bbbc81d2))
* **deps:** bump the github-actions group with 3 updates ([#446](https://github.com/jansinger/ostsee-sichtung/issues/446)) ([285c409](https://github.com/jansinger/ostsee-sichtung/commit/285c4099bf66ed2b739b8d2fa15e44989585863e))
* **deps:** bump the svelte-framework group with 2 updates ([#448](https://github.com/jansinger/ostsee-sichtung/issues/448)) ([98bfa90](https://github.com/jansinger/ostsee-sichtung/commit/98bfa901c2aa797075eb62820a9a78cd5a9a08e3))

## [2.2.1](https://github.com/jansinger/ostsee-sichtung/compare/v2.2.0...v2.2.1) (2026-04-10)


### Bug Fixes

* **admin:** fix broken Spalten column dropdown ([#442](https://github.com/jansinger/ostsee-sichtung/issues/442)) ([32b6a9d](https://github.com/jansinger/ostsee-sichtung/commit/32b6a9dca9fd00329860cf1a6ff61252125963d0))
* **config:** auto-rewrite database URL to host.docker.internal in run-release.sh ([#440](https://github.com/jansinger/ostsee-sichtung/issues/440)) ([9dfc76c](https://github.com/jansinger/ostsee-sichtung/commit/9dfc76cb8554e8da97bfc51d49c91373a335777c))


### Code Refactoring

* **ui:** migrate to DaisyUI v5 component patterns ([#443](https://github.com/jansinger/ostsee-sichtung/issues/443)) ([418f484](https://github.com/jansinger/ostsee-sichtung/commit/418f4845f744cc98f1c54d9e8c32cb4de4a38467))

## [2.2.0](https://github.com/jansinger/ostsee-sichtung/compare/v2.1.8...v2.2.0) (2026-04-10)


### Features

* **map:** improve architecture with Context API, view constraints, and cleanup ([#435](https://github.com/jansinger/ostsee-sichtung/issues/435)) ([00a6612](https://github.com/jansinger/ostsee-sichtung/commit/00a6612a18cbc53f7ff70658154565dd5c3bbd0f))
* **map:** improve map UX and production readiness ([#437](https://github.com/jansinger/ostsee-sichtung/issues/437)) ([34e8179](https://github.com/jansinger/ostsee-sichtung/commit/34e81799ef1b3d58e5c8fd51cf51836c7be072e4))
* **map:** improve UX with real loading states, custom controls, and error handling ([#436](https://github.com/jansinger/ostsee-sichtung/issues/436)) ([8628e7f](https://github.com/jansinger/ostsee-sichtung/commit/8628e7f6f182f6a6c1d0f5598cc1f27b9308dacd))


### Bug Fixes

* **map:** resolve critical memory leaks and prototype pollution ([#434](https://github.com/jansinger/ostsee-sichtung/issues/434)) ([e64ca1d](https://github.com/jansinger/ostsee-sichtung/commit/e64ca1d1132d7476edfb33eeac35fbc2defbb140))
* resolve all architecture review findings (P0-P2) ([#430](https://github.com/jansinger/ostsee-sichtung/issues/430)) ([2d86039](https://github.com/jansinger/ostsee-sichtung/commit/2d86039e96cd56eb0fc5540b06fe5c50b71fed11))
* **test:** resolve bugs found through unit test analysis ([#433](https://github.com/jansinger/ostsee-sichtung/issues/433)) ([6f866de](https://github.com/jansinger/ostsee-sichtung/commit/6f866de324d2cb64aea37a88cdc38fb6c4b3b41a))


### Documentation

* update documentation to match current implementation ([#439](https://github.com/jansinger/ostsee-sichtung/issues/439)) ([6c713bd](https://github.com/jansinger/ostsee-sichtung/commit/6c713bdc6686fd74f31f898d39fa10be30b03c1a))


### Dependencies

* **deps:** bump nodemailer from 8.0.4 to 8.0.5 ([#427](https://github.com/jansinger/ostsee-sichtung/issues/427)) ([e4db0dd](https://github.com/jansinger/ostsee-sichtung/commit/e4db0dd3bc53f8458e6c9aa760a85a07d8476f53))

## [2.1.8](https://github.com/jansinger/ostsee-sichtung/compare/v2.1.7...v2.1.8) (2026-04-08)


### Bug Fixes

* **test:** increase performance test threshold to prevent CI flakiness ([#426](https://github.com/jansinger/ostsee-sichtung/issues/426)) ([f193586](https://github.com/jansinger/ostsee-sichtung/commit/f1935862d779ea21523a1b921970f1daf9b4f05f))


### Dependencies

* **deps:** bump @iconify/json from 2.2.450 to 2.2.459 ([#422](https://github.com/jansinger/ostsee-sichtung/issues/422)) ([f065407](https://github.com/jansinger/ostsee-sichtung/commit/f06540750b5a4b2f0d2d09235dff760fa219c1e8))
* **deps:** bump @sveltejs/kit in the svelte-framework group ([#421](https://github.com/jansinger/ostsee-sichtung/issues/421)) ([0ae54e3](https://github.com/jansinger/ostsee-sichtung/commit/0ae54e32d246603efa82de03e23a2aac6d648e09))
* **deps:** bump defu from 6.1.4 to 6.1.7 ([#425](https://github.com/jansinger/ostsee-sichtung/issues/425)) ([6be6301](https://github.com/jansinger/ostsee-sichtung/commit/6be63012b670038b9316dc99431d916fe0ab429c))
* **deps:** bump the dev-tooling group with 4 updates ([#420](https://github.com/jansinger/ostsee-sichtung/issues/420)) ([43d6bf9](https://github.com/jansinger/ostsee-sichtung/commit/43d6bf9eb01e1dd1e47c614076c8df0442ffdd60))
* **deps:** bump the production-dependencies group with 2 updates ([#419](https://github.com/jansinger/ostsee-sichtung/issues/419)) ([d4e6b3c](https://github.com/jansinger/ostsee-sichtung/commit/d4e6b3c4a7ff028c8bfba68292dfdf50f0ad693e))
* **deps:** bump vite from 7.3.1 to 7.3.2 ([#423](https://github.com/jansinger/ostsee-sichtung/issues/423)) ([1eabb70](https://github.com/jansinger/ostsee-sichtung/commit/1eabb70893f94166fd12322f523808852885c6d3))

## [2.1.7](https://github.com/jansinger/ostsee-sichtung/compare/v2.1.6...v2.1.7) (2026-04-02)


### Dependencies

* **deps:** bump @scalar/api-reference from 1.49.0 to 1.49.7 ([#414](https://github.com/jansinger/ostsee-sichtung/issues/414)) ([aa3e42d](https://github.com/jansinger/ostsee-sichtung/commit/aa3e42d32334c1f0664d5a04cd97bfc017a8d3c2))
* **deps:** bump drizzle-kit from 0.31.9 to 0.31.10 ([#415](https://github.com/jansinger/ostsee-sichtung/issues/415)) ([f896a2b](https://github.com/jansinger/ostsee-sichtung/commit/f896a2be4747e117d27cfaf3a75effba9478d821))
* **deps:** bump the dev-tooling group across 1 directory with 8 updates ([#417](https://github.com/jansinger/ostsee-sichtung/issues/417)) ([604a675](https://github.com/jansinger/ostsee-sichtung/commit/604a67572a0fe02cc3f26de397bb7d01bb711a8e))
* **deps:** bump the production-dependencies group with 3 updates ([#411](https://github.com/jansinger/ostsee-sichtung/issues/411)) ([c83dc90](https://github.com/jansinger/ostsee-sichtung/commit/c83dc90b7b36bf96cda3efbcde563bd99c7123f4))
* **deps:** bump the svelte-framework group with 2 updates ([#413](https://github.com/jansinger/ostsee-sichtung/issues/413)) ([b70691b](https://github.com/jansinger/ostsee-sichtung/commit/b70691b667ed88c27d76226bb471468565e547ae))

## [2.1.6](https://github.com/jansinger/ostsee-sichtung/compare/v2.1.5...v2.1.6) (2026-03-27)


### Dependencies

* **deps:** bump handlebars from 4.7.8 to 4.7.9 ([#408](https://github.com/jansinger/ostsee-sichtung/issues/408)) ([9b586f4](https://github.com/jansinger/ostsee-sichtung/commit/9b586f4572283d57f8ee67f7de40de7006d557b8))
* **deps:** bump nodemailer from 8.0.3 to 8.0.4 ([#410](https://github.com/jansinger/ostsee-sichtung/issues/410)) ([aa7745c](https://github.com/jansinger/ostsee-sichtung/commit/aa7745c09991a155a062a9f40d756dec931e3863))
* **deps:** bump picomatch from 2.3.1 to 2.3.2 ([#407](https://github.com/jansinger/ostsee-sichtung/issues/407)) ([0f0026c](https://github.com/jansinger/ostsee-sichtung/commit/0f0026c61b2664f277a489a6fae53410ccf68097))

## [2.1.5](https://github.com/jansinger/ostsee-sichtung/compare/v2.1.4...v2.1.5) (2026-03-23)


### Dependencies

* **deps:** bump @tailwindcss/vite from 4.2.1 to 4.2.2 ([#405](https://github.com/jansinger/ostsee-sichtung/issues/405)) ([ee52955](https://github.com/jansinger/ostsee-sichtung/commit/ee52955d6f5ad4cd877a2f0f8f10bf85e976fec0))
* **deps:** bump flatted from 3.4.1 to 3.4.2 ([#401](https://github.com/jansinger/ostsee-sichtung/issues/401)) ([36a6be5](https://github.com/jansinger/ostsee-sichtung/commit/36a6be5c25416c039bf45f6c6f7451ba8b6b465e))
* **deps:** bump svelte in the svelte-framework group ([#404](https://github.com/jansinger/ostsee-sichtung/issues/404)) ([aac4f22](https://github.com/jansinger/ostsee-sichtung/commit/aac4f222f915ef42101563133e1af04a2e78c6c3))
* **deps:** bump the dev-tooling group with 3 updates ([#403](https://github.com/jansinger/ostsee-sichtung/issues/403)) ([07263b0](https://github.com/jansinger/ostsee-sichtung/commit/07263b0aed9b52c993419e802042e8c77aaabe6d))
* **deps:** bump the production-dependencies group with 3 updates ([#402](https://github.com/jansinger/ostsee-sichtung/issues/402)) ([c21e59d](https://github.com/jansinger/ostsee-sichtung/commit/c21e59d4913e82e532cbd3897f8d5610b5442dad))

## [2.1.4](https://github.com/jansinger/ostsee-sichtung/compare/v2.1.3...v2.1.4) (2026-03-17)


### Dependencies

* **deps:** bump @iconify/json from 2.2.448 to 2.2.450 ([#400](https://github.com/jansinger/ostsee-sichtung/issues/400)) ([791837d](https://github.com/jansinger/ostsee-sichtung/commit/791837d5b322f4ff4fca77185da0be38acc9c286))
* **deps:** bump @scalar/api-reference from 1.48.5 to 1.48.8 ([#398](https://github.com/jansinger/ostsee-sichtung/issues/398)) ([ec73d58](https://github.com/jansinger/ostsee-sichtung/commit/ec73d584e620f9cece0f1b607464499a242cf51d))
* **deps:** bump @scalar/sveltekit from 0.2.2 to 0.2.3 ([#399](https://github.com/jansinger/ostsee-sichtung/issues/399)) ([7ab3a43](https://github.com/jansinger/ostsee-sichtung/commit/7ab3a433ca4e74f328f5929b964d15ed3343e5c1))
* **deps:** bump dorny/paths-filter in the github-actions group ([#395](https://github.com/jansinger/ostsee-sichtung/issues/395)) ([a1599ec](https://github.com/jansinger/ostsee-sichtung/commit/a1599ec2e4e05294cea4b0d5c368fb757d349d39))
* **deps:** bump the dev-tooling group with 8 updates ([#396](https://github.com/jansinger/ostsee-sichtung/issues/396)) ([c900336](https://github.com/jansinger/ostsee-sichtung/commit/c900336d61f6c441be41e11f96e78fc78080ad8d))
* **deps:** bump the svelte-framework group with 3 updates ([#397](https://github.com/jansinger/ostsee-sichtung/issues/397)) ([3a64954](https://github.com/jansinger/ostsee-sichtung/commit/3a64954e5838ef1dd94da476d512e7615e4e94a3))
* **deps:** bump undici from 6.23.0 to 6.24.1 ([#393](https://github.com/jansinger/ostsee-sichtung/issues/393)) ([54484bf](https://github.com/jansinger/ostsee-sichtung/commit/54484bfd8110134e6bd98e32ae5153b902176501))

## [2.1.3](https://github.com/jansinger/ostsee-sichtung/compare/v2.1.2...v2.1.3) (2026-03-13)


### Bug Fixes

* **deps:** replace isomorphic-dompurify with dompurify for Vercel ESM compatibility ([#390](https://github.com/jansinger/ostsee-sichtung/issues/390)) ([8e0e1de](https://github.com/jansinger/ostsee-sichtung/commit/8e0e1de835b2844ca30ef0f6390e19251c247de4))

## [2.1.2](https://github.com/jansinger/ostsee-sichtung/compare/v2.1.1...v2.1.2) (2026-03-13)


### Bug Fixes

* **deps:** replace jwks-rsa + jsonwebtoken with jose for Vercel ESM compatibility ([#388](https://github.com/jansinger/ostsee-sichtung/issues/388)) ([37bff92](https://github.com/jansinger/ostsee-sichtung/commit/37bff92410e4e8d3cbec58327b04a0b116ed91d5))

## [2.1.1](https://github.com/jansinger/ostsee-sichtung/compare/v2.1.0...v2.1.1) (2026-03-12)


### Bug Fixes

* architecture review — 10 fixes across security, db, map and tests ([#386](https://github.com/jansinger/ostsee-sichtung/issues/386)) ([2305b1e](https://github.com/jansinger/ostsee-sichtung/commit/2305b1ef1b74f93c585a53354d3c5c0e8ecd6f40))

## [2.1.0](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.23...v2.1.0) (2026-03-12)


### Features

* **security:** add DOMPurify sanitization, cross-origin headers, and map fixes ([#383](https://github.com/jansinger/ostsee-sichtung/issues/383)) ([5c8abbe](https://github.com/jansinger/ostsee-sichtung/commit/5c8abbec7fba39e12f7e6a6eee71324760548909))

## [2.0.23](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.22...v2.0.23) (2026-03-12)


### Documentation

* update documentation for accuracy and currency ([#381](https://github.com/jansinger/ostsee-sichtung/issues/381)) ([3c36744](https://github.com/jansinger/ostsee-sichtung/commit/3c36744f16b781f1512f5dbd987167b86fd0683a))


## [2.0.22](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.21...v2.0.22) (2026-03-12)


### Bug Fixes

* **ui:** resolve state_referenced_locally warnings in form components ([#379](https://github.com/jansinger/ostsee-sichtung/issues/379)) ([b0ddd2d](https://github.com/jansinger/ostsee-sichtung/commit/b0ddd2d6a994ea6bb002a62fff962da9af028e73))

## [2.0.21](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.20...v2.0.21) (2026-03-11)


### Dependencies

* **deps:** update major dependencies ([#377](https://github.com/jansinger/ostsee-sichtung/issues/377)) ([ca27579](https://github.com/jansinger/ostsee-sichtung/commit/ca275799ae1bcaa28726b2a06e3af013b2335ee4))

## [2.0.20](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.19...v2.0.20) (2026-03-09)


### Dependencies

* **deps:** bump @fontsource/roboto from 5.2.9 to 5.2.10 ([#361](https://github.com/jansinger/ostsee-sichtung/issues/361)) ([ff04e97](https://github.com/jansinger/ostsee-sichtung/commit/ff04e97631507e588eda0967c1d13e0356edcf16))
* **deps:** bump @scalar/api-reference from 1.43.8 to 1.44.25 ([#360](https://github.com/jansinger/ostsee-sichtung/issues/360)) ([a992758](https://github.com/jansinger/ostsee-sichtung/commit/a992758d5949598c1022961c7f1739714b347c59))
* **deps:** bump tar from 7.5.9 to 7.5.11 ([#375](https://github.com/jansinger/ostsee-sichtung/issues/375)) ([ace4380](https://github.com/jansinger/ostsee-sichtung/commit/ace438005421cbbb9a70bdb50d305ff63760d73e))
* **deps:** bump the dev-tooling group across 1 directory with 10 updates ([#373](https://github.com/jansinger/ostsee-sichtung/issues/373)) ([5d974b0](https://github.com/jansinger/ostsee-sichtung/commit/5d974b02ae43b655e094694a2d47897889281e1b))
* **deps:** bump the github-actions group across 1 directory with 5 updates ([#372](https://github.com/jansinger/ostsee-sichtung/issues/372)) ([bc4f4bf](https://github.com/jansinger/ostsee-sichtung/commit/bc4f4bfd04e99bf81cc93cf7ef7638a303b3b9b3))
* **deps:** bump the production-dependencies group with 2 updates ([#357](https://github.com/jansinger/ostsee-sichtung/issues/357)) ([7add951](https://github.com/jansinger/ostsee-sichtung/commit/7add95170dad2bb80c3c139b4dc6663841da455e))
* **deps:** bump the svelte-framework group across 1 directory with 4 updates ([#367](https://github.com/jansinger/ostsee-sichtung/issues/367)) ([6b47d50](https://github.com/jansinger/ostsee-sichtung/commit/6b47d50e2b7c143da4a0490c5552542c4b92590e))

## [2.0.19](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.18...v2.0.19) (2026-02-20)


### Dependencies

* **deps:** bump @iconify/json from 2.2.430 to 2.2.439 ([#349](https://github.com/jansinger/ostsee-sichtung/issues/349)) ([c7dfdb8](https://github.com/jansinger/ostsee-sichtung/commit/c7dfdb8924dff44d68f84906d4ba12c8eb1e37e1))
* **deps:** bump @sveltejs/adapter-vercel from 6.3.1 to 6.3.2 ([#355](https://github.com/jansinger/ostsee-sichtung/issues/355)) ([8c1fbbf](https://github.com/jansinger/ostsee-sichtung/commit/8c1fbbfc7cda9600b446642f8a1834e30ab47cb0))
* **deps:** bump @sveltejs/kit from 2.52.0 to 2.52.2 ([#353](https://github.com/jansinger/ostsee-sichtung/issues/353)) ([c833124](https://github.com/jansinger/ostsee-sichtung/commit/c83312464a7a52f2645d47f2d58f86953dca5aad))
* **deps:** bump devalue from 5.6.2 to 5.6.3 ([#352](https://github.com/jansinger/ostsee-sichtung/issues/352)) ([bbd9b98](https://github.com/jansinger/ostsee-sichtung/commit/bbd9b9847a85b785014a87ba43a6de1904a22043))
* **deps:** bump dotenv from 17.2.3 to 17.3.1 ([#348](https://github.com/jansinger/ostsee-sichtung/issues/348)) ([667411b](https://github.com/jansinger/ostsee-sichtung/commit/667411b179099f01ebc597ff7bbe1f6f295e6213))
* **deps:** bump ol in the production-dependencies group ([#345](https://github.com/jansinger/ostsee-sichtung/issues/345)) ([44db673](https://github.com/jansinger/ostsee-sichtung/commit/44db673d86ed83df23bad858175d0c87a3cfdad8))
* **deps:** bump svelte from 5.51.2 to 5.53.0 ([#354](https://github.com/jansinger/ostsee-sichtung/issues/354)) ([32b8de2](https://github.com/jansinger/ostsee-sichtung/commit/32b8de21fef778efe330a3a527e7357a99fc9bbf))
* **deps:** bump tar from 7.5.7 to 7.5.9 ([#350](https://github.com/jansinger/ostsee-sichtung/issues/350)) ([5d3d84b](https://github.com/jansinger/ostsee-sichtung/commit/5d3d84bcc19054e94b262e0429931897cf2ff978))
* **deps:** bump the dev-tooling group across 1 directory with 7 updates ([#356](https://github.com/jansinger/ostsee-sichtung/issues/356)) ([ed59a0f](https://github.com/jansinger/ostsee-sichtung/commit/ed59a0f5199d1a75ca35482a132bfd89a0b5979a))
* **deps:** bump the svelte-framework group with 3 updates ([#347](https://github.com/jansinger/ostsee-sichtung/issues/347)) ([c94637c](https://github.com/jansinger/ostsee-sichtung/commit/c94637c397b65c7e6028b853ae216874c40b3e56))

## [2.0.18](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.17...v2.0.18) (2026-02-09)


### Dependencies

* **deps:** bump lodash-es from 4.17.22 to 4.17.23 ([#336](https://github.com/jansinger/ostsee-sichtung/issues/336)) ([05681fe](https://github.com/jansinger/ostsee-sichtung/commit/05681fe9f69a550d1685d693fda6c771e6e58ca1))
* **deps:** bump tar from 7.5.3 to 7.5.7 ([#340](https://github.com/jansinger/ostsee-sichtung/issues/340)) ([9840713](https://github.com/jansinger/ostsee-sichtung/commit/9840713f39e22f8c0387f1266b0d1750b1f7bffd))
* **deps:** bump the dev-tooling group across 1 directory with 14 updates ([#343](https://github.com/jansinger/ostsee-sichtung/issues/343)) ([faec65e](https://github.com/jansinger/ostsee-sichtung/commit/faec65efd51b4fffb388b0c1d0ab033ddead4678))
* **deps:** bump the production-dependencies group across 1 directory with 8 updates ([#341](https://github.com/jansinger/ostsee-sichtung/issues/341)) ([64981ed](https://github.com/jansinger/ostsee-sichtung/commit/64981eded2da35085b14b9ab69a5e465c72a01c5))
* **deps:** bump the svelte-framework group with 5 updates ([#339](https://github.com/jansinger/ostsee-sichtung/issues/339)) ([01b4355](https://github.com/jansinger/ostsee-sichtung/commit/01b435538632112fece9c3eccf54b0337fd81fe8))

## [2.0.17](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.16...v2.0.17) (2026-01-19)


### Dependencies

* **deps:** bump @iconify/json from 2.2.429 to 2.2.430 ([#333](https://github.com/jansinger/ostsee-sichtung/issues/333)) ([343eb2b](https://github.com/jansinger/ostsee-sichtung/commit/343eb2bdd37f586c60537f2c7070fde9d0556f8a))
* **deps:** bump @scalar/api-reference from 1.43.1 to 1.43.8 ([#332](https://github.com/jansinger/ostsee-sichtung/issues/332)) ([3c67c19](https://github.com/jansinger/ostsee-sichtung/commit/3c67c191f6ab11ffcd4849b6993266defcc142d1))
* **deps:** bump @scalar/sveltekit from 0.1.34 to 0.1.38 ([#331](https://github.com/jansinger/ostsee-sichtung/issues/331)) ([b3d31bf](https://github.com/jansinger/ostsee-sichtung/commit/b3d31bf81ab3c22cc083bddccd4bf52304886087))
* **deps:** bump the production-dependencies group with 4 updates ([#329](https://github.com/jansinger/ostsee-sichtung/issues/329)) ([e5035ab](https://github.com/jansinger/ostsee-sichtung/commit/e5035ab06ec8dda856976c19cf28c9c92e9e1d7a))
* **deps:** bump the svelte-framework group with 2 updates ([#330](https://github.com/jansinger/ostsee-sichtung/issues/330)) ([1a30164](https://github.com/jansinger/ostsee-sichtung/commit/1a3016486577d5983e195dec8b2f694971e0bb6e))

## [2.0.16](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.15...v2.0.16) (2026-01-18)


### Dependencies

* **deps:** bump @iconify/json from 2.2.425 to 2.2.427 ([#320](https://github.com/jansinger/ostsee-sichtung/issues/320)) ([5cf7f5d](https://github.com/jansinger/ostsee-sichtung/commit/5cf7f5de3e8a1db0c182c35d822f2247c9b6737f))
* **deps:** bump @scalar/api-reference from 1.40.9 to 1.43.1 ([#321](https://github.com/jansinger/ostsee-sichtung/issues/321)) ([bc6a3f1](https://github.com/jansinger/ostsee-sichtung/commit/bc6a3f1733711d85ae3b6221367c6124f5eff7bb))
* **deps:** bump @sveltejs/kit from 2.49.4 to 2.50.0 ([#327](https://github.com/jansinger/ostsee-sichtung/issues/327)) ([a6fe753](https://github.com/jansinger/ostsee-sichtung/commit/a6fe75331c2539bebacae539bbd68792e4178848))
* **deps:** bump devalue from 5.6.1 to 5.6.2 ([#323](https://github.com/jansinger/ostsee-sichtung/issues/323)) ([0b16be2](https://github.com/jansinger/ostsee-sichtung/commit/0b16be2b6cac24fda9ae2b7a2d7a50a05b121883))
* **deps:** bump svelte from 5.46.1 to 5.46.4 ([#324](https://github.com/jansinger/ostsee-sichtung/issues/324)) ([adb04c7](https://github.com/jansinger/ostsee-sichtung/commit/adb04c7436744acc6830f12f480b85a5552ef71b))
* **deps:** bump tar from 7.5.2 to 7.5.3 ([#325](https://github.com/jansinger/ostsee-sichtung/issues/325)) ([c1573c7](https://github.com/jansinger/ostsee-sichtung/commit/c1573c7ed51ca7eb2810e2298f92673fcd39a3b1))
* **deps:** bump the dev-tooling group across 1 directory with 7 updates ([#328](https://github.com/jansinger/ostsee-sichtung/issues/328)) ([76c65b5](https://github.com/jansinger/ostsee-sichtung/commit/76c65b537a3905d65dceaae987414e4ce222c16b))
* **deps:** bump the dev-tooling group with 7 updates ([#318](https://github.com/jansinger/ostsee-sichtung/issues/318)) ([a5744f9](https://github.com/jansinger/ostsee-sichtung/commit/a5744f9045ed07a199d83d578a64f9fc999352f2))
* **deps:** bump the production-dependencies group with 3 updates ([#317](https://github.com/jansinger/ostsee-sichtung/issues/317)) ([32350f2](https://github.com/jansinger/ostsee-sichtung/commit/32350f28e1f5b0d9795196b804a1222d123ef470))
* **deps:** bump the svelte-framework group with 2 updates ([#319](https://github.com/jansinger/ostsee-sichtung/issues/319)) ([4d9091e](https://github.com/jansinger/ostsee-sichtung/commit/4d9091ef88787629d49e2bffec03eb2bff08bcd1))

## [2.0.15](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.14...v2.0.15) (2026-01-09)


### Bug Fixes

* **config:** simplify docker-compose config and align env vars ([#315](https://github.com/jansinger/ostsee-sichtung/issues/315)) ([1f3a3fe](https://github.com/jansinger/ostsee-sichtung/commit/1f3a3fe5194ea845dee588c643163d44be955c71))


### Dependencies

* **deps:** bump @smithy/config-resolver from 4.2.2 to 4.4.5 ([#314](https://github.com/jansinger/ostsee-sichtung/issues/314)) ([7f05398](https://github.com/jansinger/ostsee-sichtung/commit/7f0539897c3259ea4670bb828c5d6100fa53d2b9))

## [2.0.14](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.13...v2.0.14) (2026-01-08)


### Dependencies

* **deps:** bump the production-dependencies group across 1 directory with 2 updates ([#311](https://github.com/jansinger/ostsee-sichtung/issues/311)) ([3fb0f12](https://github.com/jansinger/ostsee-sichtung/commit/3fb0f125c1391ea860dbf8bbfa427d11b37d440c))
* **deps:** bump the svelte-framework group across 1 directory with 5 updates ([#312](https://github.com/jansinger/ostsee-sichtung/issues/312)) ([49785f7](https://github.com/jansinger/ostsee-sichtung/commit/49785f7f65fa5a7e5509eaa9639fe780d77bd5f0))

## [2.0.13](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.12...v2.0.13) (2026-01-08)


### Dependencies

* **deps:** bump @iconify/json from 2.2.422 to 2.2.425 ([#309](https://github.com/jansinger/ostsee-sichtung/issues/309)) ([58770da](https://github.com/jansinger/ostsee-sichtung/commit/58770da9261e677db52376769c41e9267831470d))
* **deps:** bump @paralleldrive/cuid2 ([#306](https://github.com/jansinger/ostsee-sichtung/issues/306)) ([46b5754](https://github.com/jansinger/ostsee-sichtung/commit/46b575414dfc2bb53a0ac74b8f830a515e8a4725))
* **deps:** bump svelte in the svelte-framework group ([#308](https://github.com/jansinger/ostsee-sichtung/issues/308)) ([9a69d69](https://github.com/jansinger/ostsee-sichtung/commit/9a69d694155d375e9bb524a3942d19a9529d20d8))
* **deps:** bump the dev-tooling group with 3 updates ([#307](https://github.com/jansinger/ostsee-sichtung/issues/307)) ([6a0f0d4](https://github.com/jansinger/ostsee-sichtung/commit/6a0f0d4afc0f5fd6b25979ce32000038b82eff52))

## [2.0.12](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.11...v2.0.12) (2026-01-02)


### Bug Fixes

* **api:** remove phantom sighting creation from weather cache ([#303](https://github.com/jansinger/ostsee-sichtung/issues/303)) ([837b570](https://github.com/jansinger/ostsee-sichtung/commit/837b5706395296808a504fff56fca9cbc1bbe552))

## [2.0.11](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.10...v2.0.11) (2026-01-02)


### Bug Fixes

* **admin:** fix delete button not updating sightings list ([#301](https://github.com/jansinger/ostsee-sichtung/issues/301)) ([4742cfa](https://github.com/jansinger/ostsee-sichtung/commit/4742cfa68379256ed6275b7534196449312a59cf))

## [2.0.10](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.9...v2.0.10) (2026-01-02)


### Dependencies

* **deps:** bump @iconify/json from 2.2.421 to 2.2.422 ([#299](https://github.com/jansinger/ostsee-sichtung/issues/299)) ([bf13a07](https://github.com/jansinger/ostsee-sichtung/commit/bf13a07c3a86fe32c411a6718e92331b4bbb74d7))
* **deps:** bump svelte in the svelte-framework group ([#298](https://github.com/jansinger/ostsee-sichtung/issues/298)) ([0e8f18f](https://github.com/jansinger/ostsee-sichtung/commit/0e8f18f717f5d062d2b63b3810df1717ea6d09b8))

## [2.0.9](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.8...v2.0.9) (2025-12-26)


### Documentation

* fix badges and update README documentation ([#296](https://github.com/jansinger/ostsee-sichtung/issues/296)) ([1a0fa58](https://github.com/jansinger/ostsee-sichtung/commit/1a0fa58464f7e4e47d11ec4656820e824bcd0875))

## [2.0.8](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.7...v2.0.8) (2025-12-26)


### Documentation

* add v2.0.8 release highlights to production deployment guide ([#295](https://github.com/jansinger/ostsee-sichtung/issues/295)) ([3a1104f](https://github.com/jansinger/ostsee-sichtung/commit/3a1104f59530cf21fc3e933fb13e074ea2978f20))


### Code Refactoring

* **media:** address Copilot review feedback for DropzoneEnhanced ([#291](https://github.com/jansinger/ostsee-sichtung/issues/291)) ([1a62ff2](https://github.com/jansinger/ostsee-sichtung/commit/1a62ff22db040c84110e9ca617ba9fcd66ad94be))

## [2.0.7](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.6...v2.0.7) (2025-12-26)


### Bug Fixes

* enhance media file management in DropzoneEnhanced component ([#290](https://github.com/jansinger/ostsee-sichtung/issues/290)) ([421f653](https://github.com/jansinger/ostsee-sichtung/commit/421f653c03da908589c99f507d449c7aaa955b8b))


### Documentation

* refactor CLAUDE.md into modular structure with agents and rules ([#288](https://github.com/jansinger/ostsee-sichtung/issues/288)) ([5876523](https://github.com/jansinger/ostsee-sichtung/commit/5876523a3db127dfda60ca9f7c988f4f751cca7b))

## [2.0.6](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.5...v2.0.6) (2025-12-26)


### Bug Fixes

* **auth:** set PUBLIC_SITE_URL to Caddy HTTPS URL when available ([#286](https://github.com/jansinger/ostsee-sichtung/issues/286)) ([7acde5d](https://github.com/jansinger/ostsee-sichtung/commit/7acde5d2ae1e07287f1eaac8c631a9c7d2b18654))

## [2.0.5](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.4...v2.0.5) (2025-12-26)


### Bug Fixes

* **auth:** use dynamic environment variables for PUBLIC_SITE_URL ([#283](https://github.com/jansinger/ostsee-sichtung/issues/283)) ([7720f89](https://github.com/jansinger/ostsee-sichtung/commit/7720f8945079c6ca1e722cb582f4c7f9d82c9ad7))

## [2.0.4](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.3...v2.0.4) (2025-12-25)


### Bug Fixes

* **build:** use dynamic environment variables for Docker runtime ([#281](https://github.com/jansinger/ostsee-sichtung/issues/281)) ([3dce0d8](https://github.com/jansinger/ostsee-sichtung/commit/3dce0d878ec9b63999a6e59e49d8c65746b60c07))


### Documentation

* update documentation after v2.0.3 release ([#279](https://github.com/jansinger/ostsee-sichtung/issues/279)) ([1bd86f0](https://github.com/jansinger/ostsee-sichtung/commit/1bd86f073c4bf8f8b1641b8c22abf63e6bd9ca05))

## [2.0.3](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.2...v2.0.3) (2025-12-23)


### Bug Fixes

* **db:** lazy initialize database connection to prevent CI failures ([#277](https://github.com/jansinger/ostsee-sichtung/issues/277)) ([650764b](https://github.com/jansinger/ostsee-sichtung/commit/650764bdbf5c792a829d74db7964de0bd5f57b59))


### Dependencies

* **deps:** remove unused dependencies and dead code ([#275](https://github.com/jansinger/ostsee-sichtung/issues/275)) ([b2ec456](https://github.com/jansinger/ostsee-sichtung/commit/b2ec456e52ba5e308b959c245ecd57d2369e532e))

## [2.0.2](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.1...v2.0.2) (2025-12-23)


### Dependencies

* **deps:** update all npm dependencies to latest versions ([#270](https://github.com/jansinger/ostsee-sichtung/issues/270)) ([7a6796c](https://github.com/jansinger/ostsee-sichtung/commit/7a6796c577facce039fcfa190b5c6b124fca790d))

## [2.0.1](https://github.com/jansinger/ostsee-sichtung/compare/v2.0.0...v2.0.1) (2025-12-23)


### Bug Fixes

* **ci:** add node 22 compatibility workaround for license-checker ([#267](https://github.com/jansinger/ostsee-sichtung/issues/267)) ([5dd263e](https://github.com/jansinger/ostsee-sichtung/commit/5dd263e841e1492f1c5e194a0e039176c82a62ef))

## [2.0.0](https://github.com/jansinger/ostsee-sichtung/compare/v1.31.7...v2.0.0) (2025-12-23)


### ⚠ BREAKING CHANGES

* **ci:** Release workflow changed from automatic on push to explicit PR merge. The `release` branch is now auto-maintained.

### Performance Improvements

* **ci:** use matrix strategy for multi-arch Docker builds ([#255](https://github.com/jansinger/ostsee-sichtung/issues/255)) ([9422c22](https://github.com/jansinger/ostsee-sichtung/commit/9422c22d61f55caac78561b43f0e33152fa8afaa))


### Code Refactoring

* **ci:** migrate from semantic-release to release-please ([#257](https://github.com/jansinger/ostsee-sichtung/issues/257)) ([ff02679](https://github.com/jansinger/ostsee-sichtung/commit/ff026799dcb7a711960b494e4a312cd0356cf6a0))

## <small>1.31.7 (2025-12-23)</small>

* fix(ci): add --ignore-scripts flag to package-lock sync step (#253) ([ea060a7](https://github.com/jansinger/ostsee-sichtung/commit/ea060a7)), closes [#253](https://github.com/jansinger/ostsee-sichtung/issues/253)

## <small>1.31.6 (2025-12-23)</small>

* docs: improve docker deployment documentation and add migration guide (#252) ([e44ee9c](https://github.com/jansinger/ostsee-sichtung/commit/e44ee9c)), closes [#252](https://github.com/jansinger/ostsee-sichtung/issues/252)

## <small>1.31.5 (2025-12-23)</small>

* fix(ci): synchronize package-lock.json in dependabot combine workflow (#251) ([b48fbc5](https://github.com/jansinger/ostsee-sichtung/commit/b48fbc5)), closes [#251](https://github.com/jansinger/ostsee-sichtung/issues/251)

## <small>1.31.4 (2025-11-20)</small>

* fix(deps): synchronize package-lock.json with package.json (#237) ([1a08c96](https://github.com/jansinger/ostsee-sichtung/commit/1a08c96)), closes [#237](https://github.com/jansinger/ostsee-sichtung/issues/237)

## <small>1.31.3 (2025-11-20)</small>

* chore(deps): bump glob in the npm_and_yarn group across 1 directory (#235) ([0515658](https://github.com/jansinger/ostsee-sichtung/commit/0515658)), closes [#235](https://github.com/jansinger/ostsee-sichtung/issues/235)
* chore(deps): update 10 dependencies (#221) ([224914e](https://github.com/jansinger/ostsee-sichtung/commit/224914e)), closes [#221](https://github.com/jansinger/ostsee-sichtung/issues/221)
* chore(deps): update 2 dependencies (#219) ([efb3914](https://github.com/jansinger/ostsee-sichtung/commit/efb3914)), closes [#219](https://github.com/jansinger/ostsee-sichtung/issues/219)
* chore(deps): update 3 dependencies (#231) ([da43495](https://github.com/jansinger/ostsee-sichtung/commit/da43495)), closes [#231](https://github.com/jansinger/ostsee-sichtung/issues/231)
* fix(ci): add retry logic for transient GHCR errors in Docker Release workflow (#234) ([7b9a745](https://github.com/jansinger/ostsee-sichtung/commit/7b9a745)), closes [#234](https://github.com/jansinger/ostsee-sichtung/issues/234)

## <small>1.31.2 (2025-10-27)</small>

* chore(deps): bump actions/download-artifact from 4 to 6 (#211) ([e0de9ef](https://github.com/jansinger/ostsee-sichtung/commit/e0de9ef)), closes [#211](https://github.com/jansinger/ostsee-sichtung/issues/211)
* chore(deps): bump actions/setup-node from 4 to 6 (#206) ([e527857](https://github.com/jansinger/ostsee-sichtung/commit/e527857)), closes [#206](https://github.com/jansinger/ostsee-sichtung/issues/206)
* chore(deps): bump actions/upload-artifact from 4 to 5 (#213) ([b74a5f0](https://github.com/jansinger/ostsee-sichtung/commit/b74a5f0)), closes [#213](https://github.com/jansinger/ostsee-sichtung/issues/213)
* chore(deps): bump github/codeql-action from 3 to 4 (#207) ([87fd981](https://github.com/jansinger/ostsee-sichtung/commit/87fd981)), closes [#207](https://github.com/jansinger/ostsee-sichtung/issues/207)
* chore(deps): update 12 dependencies (#217) ([4fbb1f5](https://github.com/jansinger/ostsee-sichtung/commit/4fbb1f5)), closes [#217](https://github.com/jansinger/ostsee-sichtung/issues/217)
* fix(ci): resolve dependabot-combine workflow and docker release issues (#218) ([1b923e7](https://github.com/jansinger/ostsee-sichtung/commit/1b923e7)), closes [#218](https://github.com/jansinger/ostsee-sichtung/issues/218) [#123](https://github.com/jansinger/ostsee-sichtung/issues/123) [#124](https://github.com/jansinger/ostsee-sichtung/issues/124)

## <small>1.31.1 (2025-10-17)</small>

* fix(ci): resolve Docker workflow build and security scan failures (#195) ([c41f8b5](https://github.com/jansinger/ostsee-sichtung/commit/c41f8b5)), closes [#195](https://github.com/jansinger/ostsee-sichtung/issues/195)

## 1.31.0 (2025-10-17)

* feat(build): add Docker containerization with volume mount support (#194) ([8a7e5b4](https://github.com/jansinger/ostsee-sichtung/commit/8a7e5b4)), closes [#194](https://github.com/jansinger/ostsee-sichtung/issues/194)
* chore(deps): update 1 dependency (#193) ([d05ef1d](https://github.com/jansinger/ostsee-sichtung/commit/d05ef1d)), closes [#193](https://github.com/jansinger/ostsee-sichtung/issues/193)

## <small>1.30.5 (2025-10-14)</small>

* fix(ci): use conventional commit format for merge commits (#192) ([a732d0a](https://github.com/jansinger/ostsee-sichtung/commit/a732d0a)), closes [#192](https://github.com/jansinger/ostsee-sichtung/issues/192)

## <small>1.30.4 (2025-10-14)</small>

* fix(ci): add pull_request_target trigger for bot-created prs (#191) ([43b5cbe](https://github.com/jansinger/ostsee-sichtung/commit/43b5cbe)), closes [#191](https://github.com/jansinger/ostsee-sichtung/issues/191)
* chore(deps): update 2 dependencies (#188) ([3948474](https://github.com/jansinger/ostsee-sichtung/commit/3948474)), closes [#188](https://github.com/jansinger/ostsee-sichtung/issues/188)

## <small>1.30.3 (2025-10-14)</small>

* fix(ci): enable pr validation for combined dependabot pr (#189) ([28f43a2](https://github.com/jansinger/ostsee-sichtung/commit/28f43a2)), closes [#189](https://github.com/jansinger/ostsee-sichtung/issues/189)

## <small>1.30.2 (2025-10-14)</small>

* fix(ci): add missing svelte-kit sync step to dependabot-combine workflow (#187) ([a4d09d2](https://github.com/jansinger/ostsee-sichtung/commit/a4d09d2)), closes [#187](https://github.com/jansinger/ostsee-sichtung/issues/187)
* Merge pull request #174 from jansinger/dependabot/github_actions/github/codeql-action-4 ([476a81d](https://github.com/jansinger/ostsee-sichtung/commit/476a81d)), closes [#174](https://github.com/jansinger/ostsee-sichtung/issues/174)
* Merge pull request #186 from jansinger/feature/improved-dependabot-workflow ([038e7bc](https://github.com/jansinger/ostsee-sichtung/commit/038e7bc)), closes [#186](https://github.com/jansinger/ostsee-sichtung/issues/186)
* ci(deps): improve dependabot workflow with scheduled batch processing ([51a790d](https://github.com/jansinger/ostsee-sichtung/commit/51a790d))
* chore(deps-dev): bump @eslint/js from 9.36.0 to 9.37.0 (#166) ([320df13](https://github.com/jansinger/ostsee-sichtung/commit/320df13)), closes [#166](https://github.com/jansinger/ostsee-sichtung/issues/166)
* chore(deps-dev): bump @iconify/json from 2.2.391 to 2.2.392 (#169) ([50d48fc](https://github.com/jansinger/ostsee-sichtung/commit/50d48fc)), closes [#169](https://github.com/jansinger/ostsee-sichtung/issues/169)
* chore(deps-dev): bump @iconify/json from 2.2.392 to 2.2.395 (#181) ([ebaee94](https://github.com/jansinger/ostsee-sichtung/commit/ebaee94)), closes [#181](https://github.com/jansinger/ostsee-sichtung/issues/181)
* chore(deps-dev): bump @playwright/test from 1.55.1 to 1.56.0 (#175) ([3b7088e](https://github.com/jansinger/ostsee-sichtung/commit/3b7088e)), closes [#175](https://github.com/jansinger/ostsee-sichtung/issues/175)
* chore(deps-dev): bump @scalar/api-reference from 1.37.0 to 1.38.0 (#176) ([fbca936](https://github.com/jansinger/ostsee-sichtung/commit/fbca936)), closes [#176](https://github.com/jansinger/ostsee-sichtung/issues/176)
* chore(deps-dev): bump @scalar/sveltekit from 0.1.24 to 0.1.25 (#179) ([4ed7053](https://github.com/jansinger/ostsee-sichtung/commit/4ed7053)), closes [#179](https://github.com/jansinger/ostsee-sichtung/issues/179)
* chore(deps-dev): bump @sveltejs/kit from 2.43.7 to 2.44.0 (#170) ([81053cc](https://github.com/jansinger/ostsee-sichtung/commit/81053cc)), closes [#170](https://github.com/jansinger/ostsee-sichtung/issues/170)
* chore(deps-dev): bump @sveltejs/kit from 2.44.0 to 2.46.5 (#177) ([c93ef0c](https://github.com/jansinger/ostsee-sichtung/commit/c93ef0c)), closes [#177](https://github.com/jansinger/ostsee-sichtung/issues/177)
* chore(deps-dev): bump @types/node from 24.6.2 to 24.7.0 (#173) ([08b7b25](https://github.com/jansinger/ostsee-sichtung/commit/08b7b25)), closes [#173](https://github.com/jansinger/ostsee-sichtung/issues/173)
* chore(deps-dev): bump @types/node from 24.7.0 to 24.7.2 (#182) ([db5e08e](https://github.com/jansinger/ostsee-sichtung/commit/db5e08e)), closes [#182](https://github.com/jansinger/ostsee-sichtung/issues/182)
* chore(deps-dev): bump daisyui from 5.1.26 to 5.1.27 (#172) ([afb157a](https://github.com/jansinger/ostsee-sichtung/commit/afb157a)), closes [#172](https://github.com/jansinger/ostsee-sichtung/issues/172)
* chore(deps-dev): bump daisyui from 5.1.27 to 5.2.3 (#183) ([748b627](https://github.com/jansinger/ostsee-sichtung/commit/748b627)), closes [#183](https://github.com/jansinger/ostsee-sichtung/issues/183)
* chore(deps-dev): bump eslint from 9.36.0 to 9.37.0 (#168) ([fb1d614](https://github.com/jansinger/ostsee-sichtung/commit/fb1d614)), closes [#168](https://github.com/jansinger/ostsee-sichtung/issues/168)
* chore(deps-dev): bump playwright from 1.55.1 to 1.56.0 (#184) ([6b29167](https://github.com/jansinger/ostsee-sichtung/commit/6b29167)), closes [#184](https://github.com/jansinger/ostsee-sichtung/issues/184)
* chore(deps-dev): bump svelte from 5.39.8 to 5.39.9 (#167) ([009956b](https://github.com/jansinger/ostsee-sichtung/commit/009956b)), closes [#167](https://github.com/jansinger/ostsee-sichtung/issues/167)
* chore(deps-dev): bump svelte-check from 4.3.2 to 4.3.3 (#178) ([4cae765](https://github.com/jansinger/ostsee-sichtung/commit/4cae765)), closes [#178](https://github.com/jansinger/ostsee-sichtung/issues/178)
* chore(deps): bump github/codeql-action from 3 to 4 ([be05b2b](https://github.com/jansinger/ostsee-sichtung/commit/be05b2b))
* chore(deps): bump nodemailer from 7.0.6 to 7.0.7 (#171) ([07d018f](https://github.com/jansinger/ostsee-sichtung/commit/07d018f)), closes [#171](https://github.com/jansinger/ostsee-sichtung/issues/171)

## <small>1.30.1 (2025-10-03)</small>

* Merge pull request #131 from jansinger/dependabot/github_actions/actions/download-artifact-5 ([0d99a19](https://github.com/jansinger/ostsee-sichtung/commit/0d99a19)), closes [#131](https://github.com/jansinger/ostsee-sichtung/issues/131)
* Merge pull request #165 from jansinger/chore/update-dependencies ([e4371d6](https://github.com/jansinger/ostsee-sichtung/commit/e4371d6)), closes [#165](https://github.com/jansinger/ostsee-sichtung/issues/165)
* fix(test): improve map lazy loading test reliability in CI ([f20d2fb](https://github.com/jansinger/ostsee-sichtung/commit/f20d2fb))
* chore(deps): bump actions/download-artifact from 4 to 5 ([dbc33ad](https://github.com/jansinger/ostsee-sichtung/commit/dbc33ad))
* chore(deps): update all npm dependencies to latest versions ([7f2d484](https://github.com/jansinger/ostsee-sichtung/commit/7f2d484))

## 1.30.0 (2025-10-03)

* Merge pull request #164 from jansinger/feat/improved-dependabot-workflow ([7431db4](https://github.com/jansinger/ostsee-sichtung/commit/7431db4)), closes [#164](https://github.com/jansinger/ostsee-sichtung/issues/164)
* feat(ci): improve dependabot workflow with continuous integration ([79692c8](https://github.com/jansinger/ostsee-sichtung/commit/79692c8))
* chore(deps-dev): bump @cyclonedx/cyclonedx-npm from 4.0.2 to 4.0.3 (#132) ([a6bda7b](https://github.com/jansinger/ostsee-sichtung/commit/a6bda7b)), closes [#132](https://github.com/jansinger/ostsee-sichtung/issues/132)
* chore(deps-dev): bump @eslint/compat from 1.3.2 to 1.4.0 (#159) ([a54c5eb](https://github.com/jansinger/ostsee-sichtung/commit/a54c5eb)), closes [#159](https://github.com/jansinger/ostsee-sichtung/issues/159)
* chore(deps-dev): bump @eslint/js from 9.35.0 to 9.36.0 (#144) ([27a7573](https://github.com/jansinger/ostsee-sichtung/commit/27a7573)), closes [#144](https://github.com/jansinger/ostsee-sichtung/issues/144)
* chore(deps-dev): bump @iconify/json from 2.2.385 to 2.2.386 (#138) ([366d507](https://github.com/jansinger/ostsee-sichtung/commit/366d507)), closes [#138](https://github.com/jansinger/ostsee-sichtung/issues/138)
* chore(deps-dev): bump @iconify/json from 2.2.386 to 2.2.389 (#162) ([0e79f55](https://github.com/jansinger/ostsee-sichtung/commit/0e79f55)), closes [#162](https://github.com/jansinger/ostsee-sichtung/issues/162)
* chore(deps-dev): bump @playwright/test from 1.55.0 to 1.55.1 (#161) ([4b3b678](https://github.com/jansinger/ostsee-sichtung/commit/4b3b678)), closes [#161](https://github.com/jansinger/ostsee-sichtung/issues/161)
* chore(deps-dev): bump @scalar/api-reference from 1.35.6 to 1.36.1 (#153) ([6fc90f2](https://github.com/jansinger/ostsee-sichtung/commit/6fc90f2)), closes [#153](https://github.com/jansinger/ostsee-sichtung/issues/153)
* chore(deps-dev): bump @scalar/sveltekit from 0.1.22 to 0.1.23 (#141) ([308038a](https://github.com/jansinger/ostsee-sichtung/commit/308038a)), closes [#141](https://github.com/jansinger/ostsee-sichtung/issues/141)
* chore(deps-dev): bump @sveltejs/kit from 2.42.1 to 2.43.5 (#149) ([141f4db](https://github.com/jansinger/ostsee-sichtung/commit/141f4db)), closes [#149](https://github.com/jansinger/ostsee-sichtung/issues/149)
* chore(deps-dev): bump @sveltejs/vite-plugin-svelte from 6.2.0 to 6.2.1 (#160) ([f87f48a](https://github.com/jansinger/ostsee-sichtung/commit/f87f48a)), closes [#160](https://github.com/jansinger/ostsee-sichtung/issues/160)
* chore(deps-dev): bump @tailwindcss/typography from 0.5.16 to 0.5.19 (#154) ([285e98d](https://github.com/jansinger/ostsee-sichtung/commit/285e98d)), closes [#154](https://github.com/jansinger/ostsee-sichtung/issues/154)
* chore(deps-dev): bump @types/node from 22.18.5 to 22.18.6 (#139) ([11713fb](https://github.com/jansinger/ostsee-sichtung/commit/11713fb)), closes [#139](https://github.com/jansinger/ostsee-sichtung/issues/139)
* chore(deps-dev): bump daisyui from 5.1.12 to 5.1.14 (#147) ([43cc446](https://github.com/jansinger/ostsee-sichtung/commit/43cc446)), closes [#147](https://github.com/jansinger/ostsee-sichtung/issues/147)
* chore(deps-dev): bump daisyui from 5.1.14 to 5.1.25 (#151) ([8bd33c2](https://github.com/jansinger/ostsee-sichtung/commit/8bd33c2)), closes [#151](https://github.com/jansinger/ostsee-sichtung/issues/151)
* chore(deps-dev): bump drizzle-kit from 0.31.4 to 0.31.5 (#155) ([723e06c](https://github.com/jansinger/ostsee-sichtung/commit/723e06c)), closes [#155](https://github.com/jansinger/ostsee-sichtung/issues/155)
* chore(deps-dev): bump eslint from 9.35.0 to 9.36.0 (#148) ([1728512](https://github.com/jansinger/ostsee-sichtung/commit/1728512)), closes [#148](https://github.com/jansinger/ostsee-sichtung/issues/148)
* chore(deps-dev): bump eslint-plugin-svelte from 3.12.3 to 3.12.4 (#133) ([d4dc815](https://github.com/jansinger/ostsee-sichtung/commit/d4dc815)), closes [#133](https://github.com/jansinger/ostsee-sichtung/issues/133)
* chore(deps-dev): bump playwright from 1.55.0 to 1.55.1 (#152) ([ff3714e](https://github.com/jansinger/ostsee-sichtung/commit/ff3714e)), closes [#152](https://github.com/jansinger/ostsee-sichtung/issues/152)
* chore(deps-dev): bump semantic-release from 24.2.8 to 24.2.9 (#135) ([4fd30f8](https://github.com/jansinger/ostsee-sichtung/commit/4fd30f8)), closes [#135](https://github.com/jansinger/ostsee-sichtung/issues/135)
* chore(deps-dev): bump svelte from 5.38.10 to 5.39.6 (#156) ([3583c3e](https://github.com/jansinger/ostsee-sichtung/commit/3583c3e)), closes [#156](https://github.com/jansinger/ostsee-sichtung/issues/156)
* chore(deps-dev): bump svelte-check from 4.3.1 to 4.3.2 (#158) ([81b29ff](https://github.com/jansinger/ostsee-sichtung/commit/81b29ff)), closes [#158](https://github.com/jansinger/ostsee-sichtung/issues/158)
* chore(deps-dev): bump typescript-eslint from 8.44.0 to 8.44.1 (#150) ([dfeac56](https://github.com/jansinger/ostsee-sichtung/commit/dfeac56)), closes [#150](https://github.com/jansinger/ostsee-sichtung/issues/150)
* chore(deps-dev): bump vite from 7.1.5 to 7.1.7 (#145) ([7027918](https://github.com/jansinger/ostsee-sichtung/commit/7027918)), closes [#145](https://github.com/jansinger/ostsee-sichtung/issues/145)
* chore(deps): bump @rollup/rollup-linux-x64-gnu from 4.50.2 to 4.52.0 (#136) ([5b06844](https://github.com/jansinger/ostsee-sichtung/commit/5b06844)), closes [#136](https://github.com/jansinger/ostsee-sichtung/issues/136)
* chore(deps): bump @rollup/rollup-linux-x64-gnu from 4.52.0 to 4.52.3 (#157) ([0d860d4](https://github.com/jansinger/ostsee-sichtung/commit/0d860d4)), closes [#157](https://github.com/jansinger/ostsee-sichtung/issues/157)
* chore(deps): bump pino from 9.11.0 to 9.12.0 (#163) ([59cabb1](https://github.com/jansinger/ostsee-sichtung/commit/59cabb1)), closes [#163](https://github.com/jansinger/ostsee-sichtung/issues/163)
* chore(deps): bump pino from 9.9.5 to 9.11.0 (#142) ([1802e8e](https://github.com/jansinger/ostsee-sichtung/commit/1802e8e)), closes [#142](https://github.com/jansinger/ostsee-sichtung/issues/142)
* chore(deps): bump yup from 1.7.0 to 1.7.1 (#137) ([c6110d2](https://github.com/jansinger/ostsee-sichtung/commit/c6110d2)), closes [#137](https://github.com/jansinger/ostsee-sichtung/issues/137)

## 1.29.0 (2025-09-19)

* Merge pull request #130 from jansinger/chore/consolidate ([1b1b9b2](https://github.com/jansinger/ostsee-sichtung/commit/1b1b9b2)), closes [#130](https://github.com/jansinger/ostsee-sichtung/issues/130)
* Merge remote-tracking branch 'origin/main' into chore/consolidate ([9ef466f](https://github.com/jansinger/ostsee-sichtung/commit/9ef466f))
* fix: add missing icons to Icon component to resolve fallback displays ([071ff36](https://github.com/jansinger/ostsee-sichtung/commit/071ff36))
* fix: aktualisiere Bedingungen für benutzerdefinierte Eingabefelder in Behavior und SightingDetails ([692ab68](https://github.com/jansinger/ostsee-sichtung/commit/692ab68))
* fix: bereinige und reorganisiere Icon-Importe in Icon-Komponente ([08eb9de](https://github.com/jansinger/ostsee-sichtung/commit/08eb9de))
* fix: entferne die Schriftart 'Inter' aus den Abhängigkeiten und passe die Konfiguration an ([be1c0e9](https://github.com/jansinger/ostsee-sichtung/commit/be1c0e9))
* fix: entferne überflüssige Include-Anweisungen aus tsconfig und korrigiere Reihenfolge der Plugins ([0b4a8b4](https://github.com/jansinger/ostsee-sichtung/commit/0b4a8b4))
* fix: korrigiere die CSS-Klasse für den klickbaren Bildbutton ([cea50b8](https://github.com/jansinger/ostsee-sichtung/commit/cea50b8))
* fix: remove unused dependencies from package.json ([9eb8e91](https://github.com/jansinger/ostsee-sichtung/commit/9eb8e91))
* fix: verbessere Sichtbarkeitsprüfungen für das Lade-Overlay in den Karten-Tests ([de3abb0](https://github.com/jansinger/ostsee-sichtung/commit/de3abb0))
* fix: vereinfache Bedingungen für benutzerdefinierte Eingabefelder in Behavior und SightingDetails ([81976a2](https://github.com/jansinger/ostsee-sichtung/commit/81976a2))
* feat: erweitere Icon-Komponente mit neuen Lucide-Icons und aktualisiere Referenzen in der Anwendung ([7ab6800](https://github.com/jansinger/ostsee-sichtung/commit/7ab6800))
* feat: Füge globale Animationen und Scrollbar-Stile hinzu, um die Benutzeroberfläche zu verbessern ([f564a0a](https://github.com/jansinger/ostsee-sichtung/commit/f564a0a))
* feat: implement comprehensive icon system consolidation with unplugin-icons integration ([be996bc](https://github.com/jansinger/ostsee-sichtung/commit/be996bc))
* feat: Refactor styles and components for improved organization and accessibility ([106b239](https://github.com/jansinger/ostsee-sichtung/commit/106b239))
* refactor: replace emojis with Lucide icons throughout UI components ([8dcaf1e](https://github.com/jansinger/ostsee-sichtung/commit/8dcaf1e))

## <small>1.28.1 (2025-09-18)</small>

* Merge pull request #129 from jansinger/chore/new-package-versions ([f6a33a7](https://github.com/jansinger/ostsee-sichtung/commit/f6a33a7)), closes [#129](https://github.com/jansinger/ostsee-sichtung/issues/129)
* fix: enhance SBOM generation workflow with format handling and verification steps ([ba59c9c](https://github.com/jansinger/ostsee-sichtung/commit/ba59c9c))
* fix: resolve GitHub Code Scanning SARIF upload compatibility issue ([34bfa2e](https://github.com/jansinger/ostsee-sichtung/commit/34bfa2e))

## 1.28.0 (2025-09-18)

* Merge pull request #115 from jansinger/fix/npm-updates ([1f81853](https://github.com/jansinger/ostsee-sichtung/commit/1f81853)), closes [#115](https://github.com/jansinger/ostsee-sichtung/issues/115)
* Merge pull request #128 from jansinger/chore/new-package-versions ([672cce0](https://github.com/jansinger/ostsee-sichtung/commit/672cce0)), closes [#128](https://github.com/jansinger/ostsee-sichtung/issues/128)
* feat: implement Software Bill of Materials (SBOM) generation and vulnerability checks ([e3e26a6](https://github.com/jansinger/ostsee-sichtung/commit/e3e26a6))
* feat: update Vite configuration for CI and local development ([dc12025](https://github.com/jansinger/ostsee-sichtung/commit/dc12025))
* fix: update error handling for SBOM validation ([95de46c](https://github.com/jansinger/ostsee-sichtung/commit/95de46c))
* chore: update dependencies to latest versions ([914838c](https://github.com/jansinger/ostsee-sichtung/commit/914838c))
* chore: update package versions ([0a4c0c1](https://github.com/jansinger/ostsee-sichtung/commit/0a4c0c1))
* chore(deps-dev): bump @scalar/api-reference from 1.35.2 to 1.35.5 (#122) ([4c134ec](https://github.com/jansinger/ostsee-sichtung/commit/4c134ec)), closes [#122](https://github.com/jansinger/ostsee-sichtung/issues/122)
* chore(deps-dev): bump @semantic-release/github from 11.0.5 to 11.0.6 (#118) ([73152e8](https://github.com/jansinger/ostsee-sichtung/commit/73152e8)), closes [#118](https://github.com/jansinger/ostsee-sichtung/issues/118)
* chore(deps-dev): bump @sveltejs/kit from 2.37.1 to 2.39.1 (#121) ([8b891d6](https://github.com/jansinger/ostsee-sichtung/commit/8b891d6)), closes [#121](https://github.com/jansinger/ostsee-sichtung/issues/121)
* chore(deps-dev): bump @types/node from 22.18.1 to 22.18.3 (#125) ([e770f22](https://github.com/jansinger/ostsee-sichtung/commit/e770f22)), closes [#125](https://github.com/jansinger/ostsee-sichtung/issues/125)
* chore(deps-dev): bump daisyui from 5.1.10 to 5.1.12 (#117) ([171c37c](https://github.com/jansinger/ostsee-sichtung/commit/171c37c)), closes [#117](https://github.com/jansinger/ostsee-sichtung/issues/117)
* chore(deps-dev): bump eslint-plugin-svelte from 3.12.2 to 3.12.3 (#127) ([df11a7a](https://github.com/jansinger/ostsee-sichtung/commit/df11a7a)), closes [#127](https://github.com/jansinger/ostsee-sichtung/issues/127)
* chore(deps-dev): bump semantic-release from 24.2.7 to 24.2.8 (#123) ([af52022](https://github.com/jansinger/ostsee-sichtung/commit/af52022)), closes [#123](https://github.com/jansinger/ostsee-sichtung/issues/123)
* chore(deps-dev): bump svelte from 5.38.8 to 5.38.10 (#119) ([0895743](https://github.com/jansinger/ostsee-sichtung/commit/0895743)), closes [#119](https://github.com/jansinger/ostsee-sichtung/issues/119)
* chore(deps): bump @fontsource/inter from 5.2.6 to 5.2.7 (#126) ([1e8d2e3](https://github.com/jansinger/ostsee-sichtung/commit/1e8d2e3)), closes [#126](https://github.com/jansinger/ostsee-sichtung/issues/126)
* chore(deps): bump @fontsource/roboto from 5.2.6 to 5.2.7 (#120) ([494c0bc](https://github.com/jansinger/ostsee-sichtung/commit/494c0bc)), closes [#120](https://github.com/jansinger/ostsee-sichtung/issues/120)
* chore(deps): bump @rollup/rollup-linux-x64-gnu from 4.48.1 to 4.50.2 (#124) ([6a3c2c9](https://github.com/jansinger/ostsee-sichtung/commit/6a3c2c9)), closes [#124](https://github.com/jansinger/ostsee-sichtung/issues/124)
* chore(deps): bump pino from 9.9.4 to 9.9.5 (#116) ([cba1768](https://github.com/jansinger/ostsee-sichtung/commit/cba1768)), closes [#116](https://github.com/jansinger/ostsee-sichtung/issues/116)

## <small>1.27.1 (2025-09-10)</small>

* Merge pull request #112 from jansinger/fix/dependabot-workflow-repair ([ec6b75d](https://github.com/jansinger/ostsee-sichtung/commit/ec6b75d)), closes [#112](https://github.com/jansinger/ostsee-sichtung/issues/112)
* fix: improve E2E test robustness for CI environment ([48c40df](https://github.com/jansinger/ostsee-sichtung/commit/48c40df))
* fix: repair dependabot workflow and update dependencies ([f67db0a](https://github.com/jansinger/ostsee-sichtung/commit/f67db0a))

## 1.27.0 (2025-09-08)

* Merge branch 'main' into chore/context7 ([3e8369c](https://github.com/jansinger/ostsee-sichtung/commit/3e8369c))
* Merge pull request #111 from jansinger/feat/weather-api-database-integration ([35eb6b9](https://github.com/jansinger/ostsee-sichtung/commit/35eb6b9)), closes [#111](https://github.com/jansinger/ostsee-sichtung/issues/111)
* fix: correct latitude and longitude order in formatLocation calls for better accuracy ([1fa9654](https://github.com/jansinger/ostsee-sichtung/commit/1fa9654))
* fix: improve CI handling in map loading tests and enhance visibility checks ([fe76514](https://github.com/jansinger/ostsee-sichtung/commit/fe76514))
* fix: replace any types with proper MarineResponse interface ([910be6d](https://github.com/jansinger/ostsee-sichtung/commit/910be6d))
* fix: resolve e2e test port configuration issues ([39d710d](https://github.com/jansinger/ostsee-sichtung/commit/39d710d))
* refactor: improve code readability and structure in weather deduplication ([2694a4d](https://github.com/jansinger/ostsee-sichtung/commit/2694a4d))
* refactor: move WeatherDataWithMetadata type to centralized types structure ([1cb8f05](https://github.com/jansinger/ostsee-sichtung/commit/1cb8f05))
* feat: add marine data integration for wave height, direction, and period in weather API calls ([ee30f0d](https://github.com/jansinger/ostsee-sichtung/commit/ee30f0d))
* feat: add optional weather data handling in WeatherDataFetcher and update sighting schema ([52c449c](https://github.com/jansinger/ostsee-sichtung/commit/52c449c))
* feat: complete Marine API integration with historical data support ([c4a397a](https://github.com/jansinger/ostsee-sichtung/commit/c4a397a))
* feat: extend weather data structure and storage functionality ([1ad67dd](https://github.com/jansinger/ostsee-sichtung/commit/1ad67dd))
* feat: implement weather data caching and deduplication logic ([2d6c342](https://github.com/jansinger/ostsee-sichtung/commit/2d6c342))
* feat: Integrate weather data functionality into admin sighting view ([c5de3df](https://github.com/jansinger/ostsee-sichtung/commit/c5de3df))
* docs: add weather api implementation plan and extend claude.md ([13b4aa5](https://github.com/jansinger/ostsee-sichtung/commit/13b4aa5)), closes [#110](https://github.com/jansinger/ostsee-sichtung/issues/110) [#110](https://github.com/jansinger/ostsee-sichtung/issues/110)
* chore: use better context7 instructions ([45ace9b](https://github.com/jansinger/ostsee-sichtung/commit/45ace9b))

## <small>1.26.1 (2025-09-08)</small>

* Merge pull request #107 from jansinger/fix/cors-map-data-fetch ([6e78d71](https://github.com/jansinger/ostsee-sichtung/commit/6e78d71)), closes [#107](https://github.com/jansinger/ostsee-sichtung/issues/107)
* fix: better loading indication ([c7c0692](https://github.com/jansinger/ostsee-sichtung/commit/c7c0692))
* fix: debounce filter listener ([7a7d895](https://github.com/jansinger/ostsee-sichtung/commit/7a7d895))
* fix: implement LoadingOverlay for improved UX during map loading and filtering ([7140b85](https://github.com/jansinger/ostsee-sichtung/commit/7140b85))
* fix: improve loading handling and error display in LazyMapWrapper ([8b6f91f](https://github.com/jansinger/ostsee-sichtung/commit/8b6f91f))
* fix: improve loading handling and error display in LazyMapWrapper and add tests for map loading ([a99f5d8](https://github.com/jansinger/ostsee-sichtung/commit/a99f5d8))
* fix: optimize imports, enhance security headers, and clean up debug logs across components ([b4ac676](https://github.com/jansinger/ostsee-sichtung/commit/b4ac676))
* fix: optimize LoadingOverlay usage and improve loading message handling ([0fb4948](https://github.com/jansinger/ostsee-sichtung/commit/0fb4948))

## 1.26.0 (2025-09-08)

* Merge pull request #94 from jansinger/feat/weather-api-integration ([b8a3d0f](https://github.com/jansinger/ostsee-sichtung/commit/b8a3d0f)), closes [#94](https://github.com/jansinger/ostsee-sichtung/issues/94)
* Merge remote-tracking branch 'origin/main' into feat/weather-api-integration ([4c0abbd](https://github.com/jansinger/ostsee-sichtung/commit/4c0abbd))
* fix: correct icon import name from CloudIcon to Cloud ([4f20713](https://github.com/jansinger/ostsee-sichtung/commit/4f20713))
* fix: improve error handling and loading logic in LazyMapWrapper component ([8e278b1](https://github.com/jansinger/ostsee-sichtung/commit/8e278b1))
* fix: update comments and references to use Open-Meteo API instead of OpenWeatherMap ([b25b58d](https://github.com/jansinger/ostsee-sichtung/commit/b25b58d))
* feat: add weather data integration with Open-Meteo API ([d5c186d](https://github.com/jansinger/ostsee-sichtung/commit/d5c186d))
* feat: Add weather icons and improve weather data fetching component ([97a5776](https://github.com/jansinger/ostsee-sichtung/commit/97a5776))
* feat: enhance weather integration with extended data ([dc91bf3](https://github.com/jansinger/ostsee-sichtung/commit/dc91bf3))
* feat: move weather integration to Step 3 with auto-fetch ([a6a2dc7](https://github.com/jansinger/ostsee-sichtung/commit/a6a2dc7))

## <small>1.25.1 (2025-09-07)</small>

* Merge pull request #93 from jansinger/perf/optimize-dev-startup ([f166a52](https://github.com/jansinger/ostsee-sichtung/commit/f166a52)), closes [#93](https://github.com/jansinger/ostsee-sichtung/issues/93)
* refactor: improve Step components for better readability ([b71d910](https://github.com/jansinger/ostsee-sichtung/commit/b71d910))
* fix: replace deprecated svelte:component with dynamic component in Svelte 5 ([b2024ad](https://github.com/jansinger/ostsee-sichtung/commit/b2024ad))
* perf: optimize dev server startup performance ([3b25a2c](https://github.com/jansinger/ostsee-sichtung/commit/3b25a2c))

## 1.25.0 (2025-08-29)

* Merge pull request #92 from jansinger/fix/secure-role-management ([702cae0](https://github.com/jansinger/ostsee-sichtung/commit/702cae0)), closes [#92](https://github.com/jansinger/ostsee-sichtung/issues/92)
* refactor: update email notification system to use sighting ID for database retrieval ([9eb0fcb](https://github.com/jansinger/ostsee-sichtung/commit/9eb0fcb))
* fix: improve e2e tests with flexible selectors and increased timeouts for CI ([1c124a3](https://github.com/jansinger/ostsee-sichtung/commit/1c124a3))
* fix: remove deprecated run command from claude.md ([07adbe5](https://github.com/jansinger/ostsee-sichtung/commit/07adbe5))
* fix: update request type assertion in endpoint tests for better type safety ([b76bcfd](https://github.com/jansinger/ostsee-sichtung/commit/b76bcfd))
* fix: update toast management to use Svelte 5 compatible stores ([18916ec](https://github.com/jansinger/ostsee-sichtung/commit/18916ec))
* test: improve homepage content visibility checks ([c30359e](https://github.com/jansinger/ostsee-sichtung/commit/c30359e))
* feat: Refactor toast management to use Svelte 5 runes ([1110f3e](https://github.com/jansinger/ostsee-sichtung/commit/1110f3e))
* feat: refactor user role handling and enhance security measures ([a8b0b42](https://github.com/jansinger/ostsee-sichtung/commit/a8b0b42))

## 1.24.0 (2025-08-29)

* Merge pull request #91 from jansinger/feat/admin-config ([78b098a](https://github.com/jansinger/ostsee-sichtung/commit/78b098a)), closes [#91](https://github.com/jansinger/ostsee-sichtung/issues/91)
* test: enhance mock return values for geo validation and sighting save ([d952abf](https://github.com/jansinger/ostsee-sichtung/commit/d952abf))
* test: increase timeout for REST API tests to prevent CI failures ([002c654](https://github.com/jansinger/ostsee-sichtung/commit/002c654))
* test: optimize Playwright browser caching and installation conditions ([bdf2a1b](https://github.com/jansinger/ostsee-sichtung/commit/bdf2a1b))
* test: prevent email sending during test execution ([d65416e](https://github.com/jansinger/ostsee-sichtung/commit/d65416e))
* test: refactor REST API tests ([c0e4d11](https://github.com/jansinger/ostsee-sichtung/commit/c0e4d11))
* test: refactor wind direction test for better reliability ([6e5fea8](https://github.com/jansinger/ostsee-sichtung/commit/6e5fea8))
* test: reorganize imports and improve code ([066aeb5](https://github.com/jansinger/ostsee-sichtung/commit/066aeb5))
* test: reorganize Playwright installation steps in CI workflows ([89bca3e](https://github.com/jansinger/ostsee-sichtung/commit/89bca3e))
* test: simplify wind direction tests to fix CI issues ([0e23b78](https://github.com/jansinger/ostsee-sichtung/commit/0e23b78))
* test: update daisyui dependency to version 5.0.54 ([ee21eec](https://github.com/jansinger/ostsee-sichtung/commit/ee21eec))
* fix: resolve CI test failures and improve TypeScript type safety ([71a2d79](https://github.com/jansinger/ostsee-sichtung/commit/71a2d79))
* fix(deps): add html-to-text type definitions ([a551e82](https://github.com/jansinger/ostsee-sichtung/commit/a551e82))
* fix(security): resolve incomplete multi-character sanitization ([98e02d6](https://github.com/jansinger/ostsee-sichtung/commit/98e02d6))
* fix(types): resolve all CI pipeline errors and warnings ([bd6aa49](https://github.com/jansinger/ostsee-sichtung/commit/bd6aa49))
* fix(types): resolve TypeScript compilation errors ([cb69842](https://github.com/jansinger/ostsee-sichtung/commit/cb69842))
* feat: Implement admin settings ([45c64cf](https://github.com/jansinger/ostsee-sichtung/commit/45c64cf))

## 1.23.0 (2025-08-28)

* Merge pull request #90 from jansinger/fix/cleanup-iframe ([1e9b406](https://github.com/jansinger/ostsee-sichtung/commit/1e9b406)), closes [#90](https://github.com/jansinger/ostsee-sichtung/issues/90)
* fix(test): update E2E test selectors for modal form compatibility ([95f6fa5](https://github.com/jansinger/ostsee-sichtung/commit/95f6fa5))
* feat: enhance admin statistics page with user engagement ([1b78c17](https://github.com/jansinger/ostsee-sichtung/commit/1b78c17))
* feat(admin): implement column visibility configuration and enhance layout for sightings table ([03146bf](https://github.com/jansinger/ostsee-sichtung/commit/03146bf))
* feat(api): enhance Scalar API integration with TypeScript support and improved error handling ([3ff0fe5](https://github.com/jansinger/ostsee-sichtung/commit/3ff0fe5))
* feat(api): implement sighting retrieval by reference ID with error handling ([d274801](https://github.com/jansinger/ostsee-sichtung/commit/d274801))
* feat(api): integrate database-driven statistics in FormHelp component ([0107735](https://github.com/jansinger/ostsee-sichtung/commit/0107735))
* feat(api): integrate Scalar API documentation with enhanced error handling and custom styling ([e4bb578](https://github.com/jansinger/ostsee-sichtung/commit/e4bb578))
* feat(api): update SightingStatistics to include dead animals found and unique users ([f9e7ab3](https://github.com/jansinger/ostsee-sichtung/commit/f9e7ab3))
* feat(ui): implement Phase 1 value communication enhancements ([8225689](https://github.com/jansinger/ostsee-sichtung/commit/8225689))
* feat(ui): implement Phase 2 value communication enhancements ([c8c55dd](https://github.com/jansinger/ostsee-sichtung/commit/c8c55dd))
* feat(ui): implement Phase 3 & 4 value communication enhancements ([02a6a4e](https://github.com/jansinger/ostsee-sichtung/commit/02a6a4e))
* feat(ui): integrate SpeciesIdentificationHelp in FormHelp component ([14f971f](https://github.com/jansinger/ostsee-sichtung/commit/14f971f))
* refactor: improve layout and styling of PublicFooter component ([fa09255](https://github.com/jansinger/ostsee-sichtung/commit/fa09255))
* refactor: update admin design ([956ae66](https://github.com/jansinger/ostsee-sichtung/commit/956ae66))
* refactor: update package dependencies and remove SimpleMapView component ([eba6cb8](https://github.com/jansinger/ostsee-sichtung/commit/eba6cb8))
* chore: remove unused Vite configuration file for E2E tests ([f87f07e](https://github.com/jansinger/ostsee-sichtung/commit/f87f07e))
* chore: update third-party software notices and remove unused licenses file ([0b4aed5](https://github.com/jansinger/ostsee-sichtung/commit/0b4aed5))
* style(ui): enhance statistics display in FormHelp component ([e55e5a9](https://github.com/jansinger/ostsee-sichtung/commit/e55e5a9))
* docs: update and reorganize design guide to reflect current implementation ([d2e0b7d](https://github.com/jansinger/ostsee-sichtung/commit/d2e0b7d))

## <small>1.22.1 (2025-08-27)</small>

* Merge pull request #89 from jansinger/fix/cleanup-iframe ([7884eea](https://github.com/jansinger/ostsee-sichtung/commit/7884eea)), closes [#89](https://github.com/jansinger/ostsee-sichtung/issues/89)
* fix(ci): resolve YAML syntax errors in Dependabot workflow ([9a3b98e](https://github.com/jansinger/ostsee-sichtung/commit/9a3b98e))

## 1.22.0 (2025-08-27)

* Merge pull request #88 from jansinger/fix/cleanup-iframe ([86b80c2](https://github.com/jansinger/ostsee-sichtung/commit/86b80c2)), closes [#88](https://github.com/jansinger/ostsee-sichtung/issues/88)
* feat: add enhanced help text component for sighting report form ([e86dcb3](https://github.com/jansinger/ostsee-sichtung/commit/e86dcb3))
* feat: improve Dependabot PR merging process with conflict handling and summary reporting ([307d949](https://github.com/jansinger/ostsee-sichtung/commit/307d949))
* style: adjust label height for position method selection ([4f58634](https://github.com/jansinger/ostsee-sichtung/commit/4f58634))
* chore: remove unused isValid variable from form context ([2ff199b](https://github.com/jansinger/ostsee-sichtung/commit/2ff199b))

## 1.21.0 (2025-08-27)

* Merge pull request #84 from jansinger/fix/alert-autofix-1 ([bb85608](https://github.com/jansinger/ostsee-sichtung/commit/bb85608)), closes [#84](https://github.com/jansinger/ostsee-sichtung/issues/84)
* Merge pull request #85 from jansinger/cleanup/remove-example-iframe-test ([8bf85e8](https://github.com/jansinger/ostsee-sichtung/commit/8bf85e8)), closes [#85](https://github.com/jansinger/ostsee-sichtung/issues/85)
* Merge pull request #86 from jansinger/fix/cleanup-iframe ([3c9c3a9](https://github.com/jansinger/ostsee-sichtung/commit/3c9c3a9)), closes [#86](https://github.com/jansinger/ostsee-sichtung/issues/86)
* Merge pull request #87 from jansinger/fix/dependabot-conflict-handling ([d5f7f6f](https://github.com/jansinger/ostsee-sichtung/commit/d5f7f6f)), closes [#87](https://github.com/jansinger/ostsee-sichtung/issues/87)
* Potential fix for code scanning alert no. 1: Workflow does not contain permissions ([c364d0b](https://github.com/jansinger/ostsee-sichtung/commit/c364d0b))
* feat: improve Dependabot PR merging process with conflict handling and summary reporting ([fefba8d](https://github.com/jansinger/ostsee-sichtung/commit/fefba8d))
* chore: remove obsolete example-iframe-test.html file ([5f6fade](https://github.com/jansinger/ostsee-sichtung/commit/5f6fade))
* chore: remove obsolete iframe functionality and improve button styles ([0790e7d](https://github.com/jansinger/ostsee-sichtung/commit/0790e7d))

## <small>1.20.2 (2025-08-27)</small>

* Merge pull request #75 from jansinger/dependabot/npm_and_yarn/vite-7.1.3 ([0df6051](https://github.com/jansinger/ostsee-sichtung/commit/0df6051)), closes [#75](https://github.com/jansinger/ostsee-sichtung/issues/75)
* Merge pull request #76 from jansinger/dependabot/npm_and_yarn/playwright/test-1.55.0 ([e6381c0](https://github.com/jansinger/ostsee-sichtung/commit/e6381c0)), closes [#76](https://github.com/jansinger/ostsee-sichtung/issues/76)
* Merge pull request #82 from jansinger/style/meeresmuseum ([8bfa26f](https://github.com/jansinger/ostsee-sichtung/commit/8bfa26f)), closes [#82](https://github.com/jansinger/ostsee-sichtung/issues/82)
* Merge pull request #83 from jansinger/fix/devalue ([5c073de](https://github.com/jansinger/ostsee-sichtung/commit/5c073de)), closes [#83](https://github.com/jansinger/ostsee-sichtung/issues/83)
* fix: update devalue npm package ([dea5307](https://github.com/jansinger/ostsee-sichtung/commit/dea5307))
* build(deps-dev): bump @playwright/test from 1.54.2 to 1.55.0 ([5f75e9f](https://github.com/jansinger/ostsee-sichtung/commit/5f75e9f))
* build(deps-dev): bump vite from 7.1.2 to 7.1.3 ([fc725e7](https://github.com/jansinger/ostsee-sichtung/commit/fc725e7))
* style: Update styles for FilterPanel, LegendPanel, and SightingsMapView components ([1d4085f](https://github.com/jansinger/ostsee-sichtung/commit/1d4085f))

## <small>1.20.1 (2025-08-27)</small>

* Merge pull request #71 from jansinger/dependabot/npm_and_yarn/typescript-eslint-8.40.0 ([1198adf](https://github.com/jansinger/ostsee-sichtung/commit/1198adf)), closes [#71](https://github.com/jansinger/ostsee-sichtung/issues/71)
* Merge pull request #72 from jansinger/dependabot/npm_and_yarn/scalar/sveltekit-0.1.19 ([ccad425](https://github.com/jansinger/ostsee-sichtung/commit/ccad425)), closes [#72](https://github.com/jansinger/ostsee-sichtung/issues/72)
* Merge pull request #73 from jansinger/dependabot/npm_and_yarn/eslint-9.34.0 ([6e179d1](https://github.com/jansinger/ostsee-sichtung/commit/6e179d1)), closes [#73](https://github.com/jansinger/ostsee-sichtung/issues/73)
* Merge pull request #74 from jansinger/dependabot/npm_and_yarn/eslint/js-9.34.0 ([2527a9c](https://github.com/jansinger/ostsee-sichtung/commit/2527a9c)), closes [#74](https://github.com/jansinger/ostsee-sichtung/issues/74)
* Merge pull request #77 from jansinger/dependabot/npm_and_yarn/rollup/rollup-linux-x64-gnu-4.48.1 ([38d16d5](https://github.com/jansinger/ostsee-sichtung/commit/38d16d5)), closes [#77](https://github.com/jansinger/ostsee-sichtung/issues/77)
* Merge pull request #79 from jansinger/dependabot/npm_and_yarn/types/node-22.18.0 ([f97f97a](https://github.com/jansinger/ostsee-sichtung/commit/f97f97a)), closes [#79](https://github.com/jansinger/ostsee-sichtung/issues/79)
* Merge pull request #80 from jansinger/dependabot/npm_and_yarn/sveltejs/vite-plugin-svelte-6.1.3 ([5da3e05](https://github.com/jansinger/ostsee-sichtung/commit/5da3e05)), closes [#80](https://github.com/jansinger/ostsee-sichtung/issues/80)
* Merge pull request #81 from jansinger/style/meeresmuseum ([8868759](https://github.com/jansinger/ostsee-sichtung/commit/8868759)), closes [#81](https://github.com/jansinger/ostsee-sichtung/issues/81)
* refactor: Refactor and clean up various components and routes ([6c2814b](https://github.com/jansinger/ostsee-sichtung/commit/6c2814b))
* build(deps-dev): bump @eslint/js from 9.33.0 to 9.34.0 ([bcf53a2](https://github.com/jansinger/ostsee-sichtung/commit/bcf53a2))
* build(deps-dev): bump @scalar/sveltekit from 0.1.17 to 0.1.19 ([72d7e4e](https://github.com/jansinger/ostsee-sichtung/commit/72d7e4e))
* build(deps-dev): bump @sveltejs/vite-plugin-svelte from 6.1.2 to 6.1.3 ([771ada9](https://github.com/jansinger/ostsee-sichtung/commit/771ada9))
* build(deps-dev): bump @types/node from 22.17.2 to 22.18.0 ([112ff13](https://github.com/jansinger/ostsee-sichtung/commit/112ff13))
* build(deps-dev): bump eslint from 9.33.0 to 9.34.0 ([b980c81](https://github.com/jansinger/ostsee-sichtung/commit/b980c81))
* build(deps-dev): bump typescript-eslint from 8.39.1 to 8.40.0 ([45dd493](https://github.com/jansinger/ostsee-sichtung/commit/45dd493))
* build(deps): bump @rollup/rollup-linux-x64-gnu from 4.46.3 to 4.48.1 ([f61f45a](https://github.com/jansinger/ostsee-sichtung/commit/f61f45a))

## 1.20.0 (2025-08-22)

* Merge pull request #70 from jansinger/style/meeresmuseum ([336df12](https://github.com/jansinger/ostsee-sichtung/commit/336df12)), closes [#70](https://github.com/jansinger/ostsee-sichtung/issues/70)
* feat: Enhance form actions with icon and improve user prompts ([ab6dd9d](https://github.com/jansinger/ostsee-sichtung/commit/ab6dd9d))

## 1.19.0 (2025-08-21)

* Merge pull request #69 from jansinger/fix/improve-footer ([84de741](https://github.com/jansinger/ostsee-sichtung/commit/84de741)), closes [#69](https://github.com/jansinger/ostsee-sichtung/issues/69)
* fix: Add PublicFooter component and integrate it into layout ([c30484c](https://github.com/jansinger/ostsee-sichtung/commit/c30484c))
* fix: Update .gitignore to include playwright-report and clean up whitespace in tests ([5226294](https://github.com/jansinger/ostsee-sichtung/commit/5226294))
* fix: Update baseURL in Playwright config for CI environment ([f150b25](https://github.com/jansinger/ostsee-sichtung/commit/f150b25))
* feat: Enhance location validation for Baltic Sea coordinates ([37e57d1](https://github.com/jansinger/ostsee-sichtung/commit/37e57d1))
* refactor: Optimize location verification and improve admin page structure ([f592968](https://github.com/jansinger/ostsee-sichtung/commit/f592968))

## 1.18.0 (2025-08-21)

* Merge pull request #67 from jansinger/refactor/unified-file-validation ([d13c427](https://github.com/jansinger/ostsee-sichtung/commit/d13c427)), closes [#67](https://github.com/jansinger/ostsee-sichtung/issues/67)
* refactor: Refactor date and time handling in sighting forms and improve tests ([8eba82f](https://github.com/jansinger/ostsee-sichtung/commit/8eba82f))
* feat: Implement file upload and deletion functionality with database integration ([fd8663b](https://github.com/jansinger/ostsee-sichtung/commit/fd8663b))
* feat: Refactor sighting form handling to improve date and time processing, ([32b9661](https://github.com/jansinger/ostsee-sichtung/commit/32b9661))

## <small>1.17.3 (2025-08-21)</small>

* Merge pull request #66 from jansinger/refactor/unified-file-validation ([44d23c7](https://github.com/jansinger/ostsee-sichtung/commit/44d23c7)), closes [#66](https://github.com/jansinger/ostsee-sichtung/issues/66)
* fix: Implement magic bytes validation and enhance file upload security ([3f98d93](https://github.com/jansinger/ostsee-sichtung/commit/3f98d93))
* fix: Update Node.js version to 22 in workflow files ([c4daecd](https://github.com/jansinger/ostsee-sichtung/commit/c4daecd))

## <small>1.17.2 (2025-08-21)</small>

* Merge pull request #64 from jansinger/fix/position-time-sync ([6c9e664](https://github.com/jansinger/ostsee-sichtung/commit/6c9e664)), closes [#64](https://github.com/jansinger/ostsee-sichtung/issues/64)
* Merge pull request #65 from jansinger/fix/position-time-sync ([16b5d0d](https://github.com/jansinger/ostsee-sichtung/commit/16b5d0d)), closes [#65](https://github.com/jansinger/ostsee-sichtung/issues/65)
* fix: aktualisiere Testlaufzeitgrenze und vereinheitliche Testbefehle in den Workflows ([4029255](https://github.com/jansinger/ostsee-sichtung/commit/4029255))
* fix: correct CEST offset for date/time fields ([a1bc471](https://github.com/jansinger/ostsee-sichtung/commit/a1bc471))
* fix: ersetze veraltete Datumsformatierung durch zeitzonenbewusste Formatierung ([972c7ce](https://github.com/jansinger/ostsee-sichtung/commit/972c7ce))
* fix: füge Schritt hinzu, um Svelte Kit mit dem Befehl 'svelte-kit sync' zu synchronisieren ([5d79b6f](https://github.com/jansinger/ostsee-sichtung/commit/5d79b6f))
* fix: korrigiere den Befehl für den Testlauf im Pull-Request-Skript ([73ee383](https://github.com/jansinger/ostsee-sichtung/commit/73ee383))
* fix: Korrigiere UTC-Versatz für zentraleuropäische Sommerzeit in EXIF-Daten ([9881bf3](https://github.com/jansinger/ostsee-sichtung/commit/9881bf3))
* fix: Korrigiere UTC-Zeitstempel in EXIF-Daten für Tests ([2b31d04](https://github.com/jansinger/ostsee-sichtung/commit/2b31d04))
* fix: verbessere Teststruktur und stelle Zeitzone für Tests wieder her ([4246cdf](https://github.com/jansinger/ostsee-sichtung/commit/4246cdf))
* fix: vereinfache die Validierung von Commit-Nachrichten und aktualisiere Testbefehle im Workflow ([08f1494](https://github.com/jansinger/ostsee-sichtung/commit/08f1494))
* chore: update vscode debugging configuration ([1d1becb](https://github.com/jansinger/ostsee-sichtung/commit/1d1becb))

## <small>1.17.1 (2025-08-20)</small>

* Merge pull request #62 from jansinger/test/server-functions ([2ea0b40](https://github.com/jansinger/ostsee-sichtung/commit/2ea0b40)), closes [#62](https://github.com/jansinger/ostsee-sichtung/issues/62)
* Merge pull request #63 from jansinger/fix/position-time-sync ([13f7565](https://github.com/jansinger/ostsee-sichtung/commit/13f7565)), closes [#63](https://github.com/jansinger/ostsee-sichtung/issues/63)
* fix: format sighting time to always show two digits for hours and minutes ([1e77751](https://github.com/jansinger/ostsee-sichtung/commit/1e77751))
* fix: refactor date and time handling for improved localization and consistency ([d0dbf4d](https://github.com/jansinger/ostsee-sichtung/commit/d0dbf4d))
* fix: Refactor dateTime utility tests and improve date handling in sightings API ([6f5dac7](https://github.com/jansinger/ostsee-sichtung/commit/6f5dac7))
* test: Add comprehensive tests and security enhancements for file upload utilities ([d3e02fe](https://github.com/jansinger/ostsee-sichtung/commit/d3e02fe))
* chore: implement PKCE flow with encryption and decryption utilities ([8571dab](https://github.com/jansinger/ostsee-sichtung/commit/8571dab))

## 1.17.0 (2025-08-20)

* Merge pull request #61 from jansinger/feact/pkce-oidc-enhancement ([a4738a3](https://github.com/jansinger/ostsee-sichtung/commit/a4738a3)), closes [#61](https://github.com/jansinger/ostsee-sichtung/issues/61)
* fix: add encryption key to environment configuration ([04f523a](https://github.com/jansinger/ostsee-sichtung/commit/04f523a))
* refactor: reorganize imports and improve test structure in auth.test.ts ([c07e4cf](https://github.com/jansinger/ostsee-sichtung/commit/c07e4cf))
* feat: implement PKCE for enhanced OAuth 2.0 security and refactor authentication flow ([747b4e9](https://github.com/jansinger/ostsee-sichtung/commit/747b4e9))

## 1.16.0 (2025-08-20)

* Create CODE_OF_CONDUCT.md ([ae2598d](https://github.com/jansinger/ostsee-sichtung/commit/ae2598d))
* Create CODE_OF_CONDUCT.md ([f2f84c2](https://github.com/jansinger/ostsee-sichtung/commit/f2f84c2))
* Merge pull request #57 from jansinger/docs/issue-templates ([05c3b8a](https://github.com/jansinger/ostsee-sichtung/commit/05c3b8a)), closes [#57](https://github.com/jansinger/ostsee-sichtung/issues/57)
* Merge pull request #58 from jansinger/docs/community-standards ([691299e](https://github.com/jansinger/ostsee-sichtung/commit/691299e)), closes [#58](https://github.com/jansinger/ostsee-sichtung/issues/58)
* Merge pull request #59 from jansinger/fix/exif-auto-fill-position-time ([083d117](https://github.com/jansinger/ostsee-sichtung/commit/083d117)), closes [#59](https://github.com/jansinger/ostsee-sichtung/issues/59)
* Merge pull request #60 from jansinger/jansinger-patch-1 ([6b5eb55](https://github.com/jansinger/ostsee-sichtung/commit/6b5eb55)), closes [#60](https://github.com/jansinger/ostsee-sichtung/issues/60)
* Update issue templates ([afb88ed](https://github.com/jansinger/ostsee-sichtung/commit/afb88ed))
* fix: entferne ungenutzte Importanweisung für die Seitenstore ([8905e83](https://github.com/jansinger/ostsee-sichtung/commit/8905e83))
* feat: enhance SEO with comprehensive svelte:head blocks ([dcfe407](https://github.com/jansinger/ostsee-sichtung/commit/dcfe407))
* feat: füge GitHub-Link zur Fußzeile in mehreren Komponenten hinzu und verbessere die Sichtbarkeit ([c9115dd](https://github.com/jansinger/ostsee-sichtung/commit/c9115dd))
* feat: integrate API documentation into admin area ([55eca56](https://github.com/jansinger/ostsee-sichtung/commit/55eca56))
* feat: umfassende UI/UX und Admin-Verbesserungen ([2e8c449](https://github.com/jansinger/ostsee-sichtung/commit/2e8c449))

## <small>1.15.3 (2025-08-20)</small>

* Merge pull request #56 from jansinger/fix/exif-auto-fill-position-time ([d809ccd](https://github.com/jansinger/ostsee-sichtung/commit/d809ccd)), closes [#56](https://github.com/jansinger/ostsee-sichtung/issues/56)
* fix: extract sighting data from position media file in DropzoneEnhanced component ([0d19be3](https://github.com/jansinger/ostsee-sichtung/commit/0d19be3))

## <small>1.15.2 (2025-08-20)</small>

* Merge pull request #55 from jansinger/fix/github-actions-workflow-syntax ([d6669e9](https://github.com/jansinger/ostsee-sichtung/commit/d6669e9)), closes [#55](https://github.com/jansinger/ostsee-sichtung/issues/55)
* fix(ci): ensure dependabot workflow runs from main branch ([39750b2](https://github.com/jansinger/ostsee-sichtung/commit/39750b2))
* fix(ci): handle clean merges without staged changes ([36028de](https://github.com/jansinger/ostsee-sichtung/commit/36028de))
* fix(ci): prevent branch name conflicts in dependabot workflow ([62ea0fb](https://github.com/jansinger/ostsee-sichtung/commit/62ea0fb))
* chore(deps): apply dependabot updates manually ([d768067](https://github.com/jansinger/ostsee-sichtung/commit/d768067)), closes [#41](https://github.com/jansinger/ostsee-sichtung/issues/41) [#39](https://github.com/jansinger/ostsee-sichtung/issues/39)

## <small>1.15.1 (2025-08-20)</small>

* Merge pull request #53 from jansinger/fix/github-actions-workflow-syntax ([9ccd2d2](https://github.com/jansinger/ostsee-sichtung/commit/9ccd2d2)), closes [#53](https://github.com/jansinger/ostsee-sichtung/issues/53)
* fix: repair GitHub Actions workflow syntax for dependabot PR parsing ([ebd73cd](https://github.com/jansinger/ostsee-sichtung/commit/ebd73cd))

## 1.15.0 (2025-08-20)

* Merge pull request #52 from jansinger/fix/dropzone-enhanced ([f802dbb](https://github.com/jansinger/ostsee-sichtung/commit/f802dbb)), closes [#52](https://github.com/jansinger/ostsee-sichtung/issues/52)
* refactor: aktualisiere Validierungsschema und passe Feldzuordnungen an ([4b8c9b3](https://github.com/jansinger/ostsee-sichtung/commit/4b8c9b3))
* refactor: bereinige Debugging-Konfigurationen und verbessere die Entwicklungsumgebung ([495ae41](https://github.com/jansinger/ostsee-sichtung/commit/495ae41))
* refactor: entferne nicht verwendete EXIF-Daten-Tests aus LocalStorageProvider-Tests ([ed2816c](https://github.com/jansinger/ostsee-sichtung/commit/ed2816c))
* refactor: import type definitions from the correct module in UnifiedDropzone and DropzoneEnhanced ([42aab27](https://github.com/jansinger/ostsee-sichtung/commit/42aab27))
* refactor: refactor dropzone and file processing ([44a6f3a](https://github.com/jansinger/ostsee-sichtung/commit/44a6f3a))
* fix: passe Log-Level basierend auf Entwicklungsmodus an ([8a119f9](https://github.com/jansinger/ostsee-sichtung/commit/8a119f9))
* fix: type checks ([1f0a99f](https://github.com/jansinger/ostsee-sichtung/commit/1f0a99f))
* fix: überprüfe auf gültige Dateien vor der Verarbeitung in UnifiedDropzone ([ba0de20](https://github.com/jansinger/ostsee-sichtung/commit/ba0de20))
* feat: implement Admin Media Section and refactor sighting edit flow ([df62bd1](https://github.com/jansinger/ostsee-sichtung/commit/df62bd1))
* build: erweitere Debugging-Optionen und verbessere Quellkarten für die Entwicklung ([45a1574](https://github.com/jansinger/ostsee-sichtung/commit/45a1574))

## <small>1.14.2 (2025-08-18)</small>

* Merge pull request #51 from jansinger/fix/readme-badge-urls ([a7fdc84](https://github.com/jansinger/ostsee-sichtung/commit/a7fdc84)), closes [#51](https://github.com/jansinger/ostsee-sichtung/issues/51)
* docs: erweitere CLAUDE.md um Hinweise zur Dokumentationsaktualisierung ([0c7601c](https://github.com/jansinger/ostsee-sichtung/commit/0c7601c))
* docs: update outdated version references and script paths ([1f6a366](https://github.com/jansinger/ostsee-sichtung/commit/1f6a366))
* fix(docs): correct badge URLs to match actual repository name ([6d90102](https://github.com/jansinger/ostsee-sichtung/commit/6d90102))
* fix(docs): update remaining sichtungen-webapp references ([3beec7e](https://github.com/jansinger/ostsee-sichtung/commit/3beec7e))

## <small>1.14.1 (2025-08-18)</small>

* Merge pull request #50 from jansinger/docs/update-readme ([ef9bf74](https://github.com/jansinger/ostsee-sichtung/commit/ef9bf74)), closes [#50](https://github.com/jansinger/ostsee-sichtung/issues/50)
* docs: update README.md to reflect current project structure ([22f776f](https://github.com/jansinger/ostsee-sichtung/commit/22f776f))

## 1.14.0 (2025-08-18)

* Merge pull request #49 from jansinger/fix/legacy-api-date-mapping ([96c2096](https://github.com/jansinger/ostsee-sichtung/commit/96c2096)), closes [#49](https://github.com/jansinger/ostsee-sichtung/issues/49)
* feat(deps): add @vitest/coverage-v8 dependency to enhance test coverage reporting ([58e778d](https://github.com/jansinger/ostsee-sichtung/commit/58e778d))
* test(api): update legacy API test to match new date/time field mapping ([70f114e](https://github.com/jansinger/ostsee-sichtung/commit/70f114e))
* fix(api): correct legacy API date mapping to preserve sichtungsdatum ([56c5423](https://github.com/jansinger/ostsee-sichtung/commit/56c5423)), closes [#48](https://github.com/jansinger/ostsee-sichtung/issues/48)

## 1.13.0 (2025-08-18)

* Merge pull request #47 from jansinger/fix/legacy-post-error-responses ([e81ac52](https://github.com/jansinger/ostsee-sichtung/commit/e81ac52)), closes [#47](https://github.com/jansinger/ostsee-sichtung/issues/47)
* feat(api): implement yup-based validation for legacy rest api ([5babfff](https://github.com/jansinger/ostsee-sichtung/commit/5babfff))
* fix(api): achieve 100% POST endpoint compatibility with original schweinswalsichtung.de ([0abb5b9](https://github.com/jansinger/ostsee-sichtung/commit/0abb5b9)), closes [#46](https://github.com/jansinger/ostsee-sichtung/issues/46)

## <small>1.12.1 (2025-08-18)</small>

* Merge pull request #45 from jansinger/fix/legacy-showreports-compatibility ([f9c4d70](https://github.com/jansinger/ostsee-sichtung/commit/f9c4d70)), closes [#45](https://github.com/jansinger/ostsee-sichtung/issues/45)
* fix(api): ensure 100% compatibility with original schweinswalsichtung.de showreports.json ([59f4718](https://github.com/jansinger/ostsee-sichtung/commit/59f4718)), closes [#44](https://github.com/jansinger/ostsee-sichtung/issues/44)

## 1.12.0 (2025-08-18)

* Merge pull request #43 from jansinger/feature/legacy-rest-api ([b568597](https://github.com/jansinger/ostsee-sichtung/commit/b568597)), closes [#43](https://github.com/jansinger/ostsee-sichtung/issues/43)
* fix(api): resolve all legacy REST API test failures ([b9d88e1](https://github.com/jansinger/ostsee-sichtung/commit/b9d88e1))
* fix(api): resolve timezone issues in legacy API tests ([b61313f](https://github.com/jansinger/ostsee-sichtung/commit/b61313f))
* fix(docs): update OpenAPI specification to match current implementation ([0b8d6ca](https://github.com/jansinger/ostsee-sichtung/commit/0b8d6ca))
* fix(test): resolve TypeScript type-check errors in legacy API tests ([2f0bc0f](https://github.com/jansinger/ostsee-sichtung/commit/2f0bc0f))
* feat(api): implement legacy REST API for mobile app compatibility ([ba1dcc2](https://github.com/jansinger/ostsee-sichtung/commit/ba1dcc2)), closes [#27](https://github.com/jansinger/ostsee-sichtung/issues/27)
* feat(api): implement PDF-compliant legacy REST API endpoints ([2dcccf0](https://github.com/jansinger/ostsee-sichtung/commit/2dcccf0))

## 1.11.0 (2025-08-18)

* Merge pull request #42 from jansinger/feature/media-upload-flags-script ([739cd3b](https://github.com/jansinger/ostsee-sichtung/commit/739cd3b)), closes [#42](https://github.com/jansinger/ostsee-sichtung/issues/42)
* Merge remote-tracking branch 'origin/main' into feature/media-upload-flags-script ([1b45e65](https://github.com/jansinger/ostsee-sichtung/commit/1b45e65))
* feat(db): add media upload flags correction script ([aa1ce13](https://github.com/jansinger/ostsee-sichtung/commit/aa1ce13))

## 1.10.0 (2025-08-18)

* Merge pull request #38 from jansinger/fix/workflow-yaml-syntax ([c1d227c](https://github.com/jansinger/ostsee-sichtung/commit/c1d227c)), closes [#38](https://github.com/jansinger/ostsee-sichtung/issues/38)
* refactor: streamline license notice generation process ([5b61040](https://github.com/jansinger/ostsee-sichtung/commit/5b61040))
* refactor(build): move license generation script to src/tools ([ce99d7b](https://github.com/jansinger/ostsee-sichtung/commit/ce99d7b))
* fix: only run FOSS on PUSH ([a7aff0b](https://github.com/jansinger/ostsee-sichtung/commit/a7aff0b))
* fix(ci): make THIRD-PARTY-NOTICES date-agnostic for stable CI ([6e0963a](https://github.com/jansinger/ostsee-sichtung/commit/6e0963a))
* fix(ci): properly handle private package in license checks ([4f206e5](https://github.com/jansinger/ostsee-sichtung/commit/4f206e5))
* fix(ci): resolve license compliance issues with smart filtering ([4877231](https://github.com/jansinger/ostsee-sichtung/commit/4877231))
* fix(ci): resolve YAML boolean expression syntax errors ([db670e9](https://github.com/jansinger/ostsee-sichtung/commit/db670e9))
* fix(security): extend allowed licenses for complete FOSS compliance ([873036a](https://github.com/jansinger/ostsee-sichtung/commit/873036a))
* fix(security): resolve critical and moderate npm vulnerabilities ([72ff2a5](https://github.com/jansinger/ostsee-sichtung/commit/72ff2a5))
* feat(security): implement comprehensive FOSS compliance system ([751daac](https://github.com/jansinger/ostsee-sichtung/commit/751daac))

## 1.9.0 (2025-08-18)

* Merge pull request #31 from jansinger/dependabot/npm_and_yarn/rollup/rollup-linux-x64-gnu-4.46.3 ([1c9124d](https://github.com/jansinger/ostsee-sichtung/commit/1c9124d)), closes [#31](https://github.com/jansinger/ostsee-sichtung/issues/31)
* Merge pull request #35 from jansinger/dependabot/npm_and_yarn/sveltejs/adapter-vercel-5.9.1 ([09e8dfa](https://github.com/jansinger/ostsee-sichtung/commit/09e8dfa)), closes [#35](https://github.com/jansinger/ostsee-sichtung/issues/35)
* Merge pull request #36 from jansinger/dependabot/npm_and_yarn/types/node-22.17.2 ([054209b](https://github.com/jansinger/ostsee-sichtung/commit/054209b)), closes [#36](https://github.com/jansinger/ostsee-sichtung/issues/36)
* Merge pull request #37 from jansinger/feature/optimize-github-workflows ([259f6e0](https://github.com/jansinger/ostsee-sichtung/commit/259f6e0)), closes [#37](https://github.com/jansinger/ostsee-sichtung/issues/37)
* fix(ci): correct YAML syntax for boolean comparisons ([4b6620b](https://github.com/jansinger/ostsee-sichtung/commit/4b6620b))
* feat(ci): add optimized github actions workflows ([dd63cff](https://github.com/jansinger/ostsee-sichtung/commit/dd63cff))
* feat(ci): complete workflow consolidation - unified PR validation ([6a66bf7](https://github.com/jansinger/ostsee-sichtung/commit/6a66bf7)), closes [#37](https://github.com/jansinger/ostsee-sichtung/issues/37)
* feat(ci): implement advanced workflow optimizations ([bbcaa49](https://github.com/jansinger/ostsee-sichtung/commit/bbcaa49))
* feat(ci): safely disable old dependabot-combined workflow ([7b330e9](https://github.com/jansinger/ostsee-sichtung/commit/7b330e9))
* perf(ci): optimize workflow execution with better script usage ([2a16773](https://github.com/jansinger/ostsee-sichtung/commit/2a16773))
* refactor(ci): remove old workflow files after successful migration ([dc342ed](https://github.com/jansinger/ostsee-sichtung/commit/dc342ed))
* test(ci): add workflow test documentation ([3068fb6](https://github.com/jansinger/ostsee-sichtung/commit/3068fb6))
* chore(deps-dev): bump @sveltejs/adapter-vercel from 5.8.2 to 5.9.1 ([135aa28](https://github.com/jansinger/ostsee-sichtung/commit/135aa28))
* chore(deps-dev): bump @types/node from 22.17.1 to 22.17.2 ([eda61f2](https://github.com/jansinger/ostsee-sichtung/commit/eda61f2))
* chore(deps): bump @rollup/rollup-linux-x64-gnu from 4.24.0 to 4.46.3 ([b9fa0af](https://github.com/jansinger/ostsee-sichtung/commit/b9fa0af))

## <small>1.8.1 (2025-08-18)</small>

* Merge pull request #32 from jansinger/dependabot/npm_and_yarn/sveltejs/kit-2.31.1 ([07ecdac](https://github.com/jansinger/ostsee-sichtung/commit/07ecdac)), closes [#32](https://github.com/jansinger/ostsee-sichtung/issues/32)
* fix: add build step to dependabot automerge workflow ([8ee1ab0](https://github.com/jansinger/ostsee-sichtung/commit/8ee1ab0))
* chore(deps-dev): bump @sveltejs/kit from 2.30.1 to 2.31.1 ([75465c8](https://github.com/jansinger/ostsee-sichtung/commit/75465c8))

## 1.8.0 (2025-08-18)

* Merge pull request #30 from jansinger/docs/comprehensive-jsdoc-documentation ([ecafd1e](https://github.com/jansinger/ostsee-sichtung/commit/ecafd1e)), closes [#30](https://github.com/jansinger/ostsee-sichtung/issues/30)
* fix: Improve type safety and handle undefined entries in checkBalticSea tests ([24b54e4](https://github.com/jansinger/ostsee-sichtung/commit/24b54e4))
* feat: Enhance CSV export functionality with detailed documentation and improved data handling ([8688ebd](https://github.com/jansinger/ostsee-sichtung/commit/8688ebd))
* feat: Implement file-based geographic validation for Baltic Sea using RBush and Turf.js ([27b7dce](https://github.com/jansinger/ostsee-sichtung/commit/27b7dce))
* feat: refactor checkBalticSea with comprehensive types and documentation ([d9d20cb](https://github.com/jansinger/ostsee-sichtung/commit/d9d20cb))
* test: Add unit tests for various utility functions and features ([c843391](https://github.com/jansinger/ostsee-sichtung/commit/c843391))
* test: fix tests after documentation updates ([7b8e8ab](https://github.com/jansinger/ostsee-sichtung/commit/7b8e8ab))

## 1.7.0 (2025-08-18)

* Merge pull request #29 from jansinger/preview ([3e86faa](https://github.com/jansinger/ostsee-sichtung/commit/3e86faa)), closes [#29](https://github.com/jansinger/ostsee-sichtung/issues/29)
* feat: Bestimmung des Standardjahres und verfügbarer Jahre für Sichtungen ([37d5466](https://github.com/jansinger/ostsee-sichtung/commit/37d5466))
* feat: Implementiere Validierung für Sichtungsdaten und verbotene Admin-Felder in der API ([9cbbb7d](https://github.com/jansinger/ostsee-sichtung/commit/9cbbb7d))
* chore: update dependencies and reorganize package.json ([1463170](https://github.com/jansinger/ostsee-sichtung/commit/1463170))

## 1.6.0 (2025-08-18)

* Merge pull request #26 from jansinger/preview ([0ab776d](https://github.com/jansinger/ostsee-sichtung/commit/0ab776d)), closes [#26](https://github.com/jansinger/ostsee-sichtung/issues/26)
* Merge remote-tracking branch 'origin/main' into preview ([30110c9](https://github.com/jansinger/ostsee-sichtung/commit/30110c9))
* feat: Add 'updated-dependencies' to commitlint configuration ([a550f6a](https://github.com/jansinger/ostsee-sichtung/commit/a550f6a))
* feat: Add statistics page with data visualization and insights ([115bc21](https://github.com/jansinger/ostsee-sichtung/commit/115bc21))
* feat: Entferne die Validierung von PR-Commits mit commitlint ([e85f4ab](https://github.com/jansinger/ostsee-sichtung/commit/e85f4ab))
* feat: Erweiterung der commitlint-Konfiguration zur Ignorierung von Dependabot-Commits ([e7cd4d7](https://github.com/jansinger/ostsee-sichtung/commit/e7cd4d7))
* feat: Ignore merge commits in commitlint configuration ([3b1fba3](https://github.com/jansinger/ostsee-sichtung/commit/3b1fba3))
* feat: Implement step skipping functionality and enhance DeadAnimal section layout ([a93b265](https://github.com/jansinger/ostsee-sichtung/commit/a93b265))
* feat: Implement user menu component and integrate it into various pages ([d0d437d](https://github.com/jansinger/ostsee-sichtung/commit/d0d437d))
* feat: Replace custom conventional commit check with commitlint validation in PR workflow ([21700bd](https://github.com/jansinger/ostsee-sichtung/commit/21700bd))
* feat(admin): add comprehensive statistics dashboard ([2638e66](https://github.com/jansinger/ostsee-sichtung/commit/2638e66))
* refactor: Optimize imports and improve navbar layout for better readability ([2aeb2e7](https://github.com/jansinger/ostsee-sichtung/commit/2aeb2e7))
* refactor: update CLAUDE.md for improved clarity and consistency in instructions ([9468bc4](https://github.com/jansinger/ostsee-sichtung/commit/9468bc4))

## 1.5.0 (2025-08-18)

* Merge pull request #25 from jansinger/preview ([5b308d1](https://github.com/jansinger/ostsee-sichtung/commit/5b308d1)), closes [#25](https://github.com/jansinger/ostsee-sichtung/issues/25)
* refactor: improve validation messages and formatting in sighting schema ([7348c46](https://github.com/jansinger/ostsee-sichtung/commit/7348c46))
* feat: Enhance media store with current value retrieval ([7baa34a](https://github.com/jansinger/ostsee-sichtung/commit/7baa34a))

## 1.4.0 (2025-08-17)

* Merge pull request #24 from jansinger/preview ([4f6c65f](https://github.com/jansinger/ostsee-sichtung/commit/4f6c65f)), closes [#24](https://github.com/jansinger/ostsee-sichtung/issues/24)
* chore: Merge branch 'main' into preview ([869c2d3](https://github.com/jansinger/ostsee-sichtung/commit/869c2d3))
* refactor: replace swagger with scalar sveltekit integration ([3d3de84](https://github.com/jansinger/ostsee-sichtung/commit/3d3de84))
* feat(config): add 'media' scope for media handling ([2b32135](https://github.com/jansinger/ostsee-sichtung/commit/2b32135))
* feat(media): implement secure media serving endpoint with access control ([9dfb513](https://github.com/jansinger/ostsee-sichtung/commit/9dfb513))

## 1.3.0 (2025-08-16)

* Merge pull request #23 from jansinger/preview ([f0696d1](https://github.com/jansinger/ostsee-sichtung/commit/f0696d1)), closes [#23](https://github.com/jansinger/ostsee-sichtung/issues/23)
* chore: remove obsolete test environment setup workflow ([2ebfa8f](https://github.com/jansinger/ostsee-sichtung/commit/2ebfa8f))
* chore: remove Playwright test workflow ([07a958e](https://github.com/jansinger/ostsee-sichtung/commit/07a958e))
* fix: add default values for required properties in color group processing ([847b675](https://github.com/jansinger/ostsee-sichtung/commit/847b675))
* fix: replace scalar with swagger ui and add robust fallback documentation ([6ee5396](https://github.com/jansinger/ostsee-sichtung/commit/6ee5396))
* fix: resolve typescript linting errors in api documentation ([c1c6600](https://github.com/jansinger/ostsee-sichtung/commit/c1c6600))
* refactor: comment out subject-case rule in commitlint configuration ([5a9499f](https://github.com/jansinger/ostsee-sichtung/commit/5a9499f))
* refactor: remove unused apis and restructure documentation ([cea6589](https://github.com/jansinger/ostsee-sichtung/commit/cea6589))
* refactor(config): relax subject-case rule and increase line length limits ([e51b493](https://github.com/jansinger/ostsee-sichtung/commit/e51b493))
* refactor(map): improve code formatting and structure for readability ([7f2caaf](https://github.com/jansinger/ostsee-sichtung/commit/7f2caaf))
* refactor(map): Refactor map controllers and update Playwright report ([2baaba4](https://github.com/jansinger/ostsee-sichtung/commit/2baaba4))
* feat: implement comprehensive openapi documentation with interactive ui ([d6f8654](https://github.com/jansinger/ostsee-sichtung/commit/d6f8654))
* feat: update README to improve project visibility ([9ded96c](https://github.com/jansinger/ostsee-sichtung/commit/9ded96c))
* feat(map): Implement map popup and clustering functionality ([35dd00b](https://github.com/jansinger/ostsee-sichtung/commit/35dd00b))

## 1.2.0 (2025-08-16)

* Merge pull request #22 from jansinger/preview ([f406fb7](https://github.com/jansinger/ostsee-sichtung/commit/f406fb7)), closes [#22](https://github.com/jansinger/ostsee-sichtung/issues/22)
* feat: data protection adjustment ([5b23acf](https://github.com/jansinger/ostsee-sichtung/commit/5b23acf))
* refactor: remove unused sequences ([8b8ccbc](https://github.com/jansinger/ostsee-sichtung/commit/8b8ccbc))

## 1.1.0 (2025-08-15)

* Merge pull request #21 from jansinger/preview ([035446c](https://github.com/jansinger/ostsee-sichtung/commit/035446c)), closes [#21](https://github.com/jansinger/ostsee-sichtung/issues/21)
* test: add unit tests for exifutils and localstorageprovider ([e3fbc08](https://github.com/jansinger/ostsee-sichtung/commit/e3fbc08))
* feat: enhance local storage provider with security hardening ([c316c4e](https://github.com/jansinger/ostsee-sichtung/commit/c316c4e))
* feat: enhance migration scripts ([c17f876](https://github.com/jansinger/ostsee-sichtung/commit/c17f876))
* fix: update launch configuration to use https for local server ([5d9806f](https://github.com/jansinger/ostsee-sichtung/commit/5d9806f))

## 1.0.0 (2025-08-15)

* Added Vercel Adapter ([308f061](https://github.com/jansinger/ostsee-sichtung/commit/308f061))
* Initial commit ([cfe5916](https://github.com/jansinger/ostsee-sichtung/commit/cfe5916))
* Merge branch 'main' into preview ([7fd974d](https://github.com/jansinger/ostsee-sichtung/commit/7fd974d))
* Merge pull request #10 from jansinger/dependabot/npm_and_yarn/tailwindcss/vite-4.1.12 ([b01d442](https://github.com/jansinger/ostsee-sichtung/commit/b01d442)), closes [#10](https://github.com/jansinger/ostsee-sichtung/issues/10)
* Merge pull request #11 from jansinger/dependabot/npm_and_yarn/pino-9.9.0 ([22f435a](https://github.com/jansinger/ostsee-sichtung/commit/22f435a)), closes [#11](https://github.com/jansinger/ostsee-sichtung/issues/11)
* Merge pull request #12 from jansinger/dependabot/npm_and_yarn/drizzle-orm-0.44.4 ([1adb70e](https://github.com/jansinger/ostsee-sichtung/commit/1adb70e)), closes [#12](https://github.com/jansinger/ostsee-sichtung/issues/12)
* Merge pull request #13 from jansinger/preview ([0759d7b](https://github.com/jansinger/ostsee-sichtung/commit/0759d7b)), closes [#13](https://github.com/jansinger/ostsee-sichtung/issues/13)
* Merge pull request #14 from jansinger/preview ([17e7ef1](https://github.com/jansinger/ostsee-sichtung/commit/17e7ef1)), closes [#14](https://github.com/jansinger/ostsee-sichtung/issues/14)
* Merge pull request #15 from jansinger/preview ([6432bc6](https://github.com/jansinger/ostsee-sichtung/commit/6432bc6)), closes [#15](https://github.com/jansinger/ostsee-sichtung/issues/15)
* Merge pull request #16 from jansinger/preview ([eff2b16](https://github.com/jansinger/ostsee-sichtung/commit/eff2b16)), closes [#16](https://github.com/jansinger/ostsee-sichtung/issues/16)
* Merge pull request #17 from jansinger/preview ([f16364e](https://github.com/jansinger/ostsee-sichtung/commit/f16364e)), closes [#17](https://github.com/jansinger/ostsee-sichtung/issues/17)
* Merge pull request #18 from jansinger:preview ([ea2cc58](https://github.com/jansinger/ostsee-sichtung/commit/ea2cc58)), closes [#18](https://github.com/jansinger/ostsee-sichtung/issues/18)
* Merge pull request #19 from jansinger:preview ([962bc0f](https://github.com/jansinger/ostsee-sichtung/commit/962bc0f)), closes [#19](https://github.com/jansinger/ostsee-sichtung/issues/19)
* Merge pull request #20 from jansinger:preview ([8bfd40d](https://github.com/jansinger/ostsee-sichtung/commit/8bfd40d)), closes [#20](https://github.com/jansinger/ostsee-sichtung/issues/20)
* Merge pull request #3 from jansinger/dependabot/npm_and_yarn/types/node-22.17.1 ([b16233e](https://github.com/jansinger/ostsee-sichtung/commit/b16233e)), closes [#3](https://github.com/jansinger/ostsee-sichtung/issues/3)
* Merge pull request #4 from jansinger/dependabot/npm_and_yarn/eslint/compat-1.3.2 ([89a63e3](https://github.com/jansinger/ostsee-sichtung/commit/89a63e3)), closes [#4](https://github.com/jansinger/ostsee-sichtung/issues/4)
* Merge pull request #5 from jansinger/dependabot/npm_and_yarn/sveltejs/vite-plugin-svelte-6.1.2 ([31f795a](https://github.com/jansinger/ostsee-sichtung/commit/31f795a)), closes [#5](https://github.com/jansinger/ostsee-sichtung/issues/5)
* Merge pull request #6 from jansinger/dependabot/npm_and_yarn/tailwindcss-4.1.12 ([4dcc9a1](https://github.com/jansinger/ostsee-sichtung/commit/4dcc9a1)), closes [#6](https://github.com/jansinger/ostsee-sichtung/issues/6)
* Merge pull request #7 from jansinger/dependabot/npm_and_yarn/vite-7.1.2 ([b97bbad](https://github.com/jansinger/ostsee-sichtung/commit/b97bbad)), closes [#7](https://github.com/jansinger/ostsee-sichtung/issues/7)
* Merge pull request #8 from jansinger/dependabot/npm_and_yarn/vite-plugin-devtools-json-0.4.1 ([d91ab75](https://github.com/jansinger/ostsee-sichtung/commit/d91ab75)), closes [#8](https://github.com/jansinger/ostsee-sichtung/issues/8)
* Merge pull request #9 from jansinger/dependabot/npm_and_yarn/svelte-5.38.1 ([555a8c8](https://github.com/jansinger/ostsee-sichtung/commit/555a8c8)), closes [#9](https://github.com/jansinger/ostsee-sichtung/issues/9)
* fix:  type errors ([24dc708](https://github.com/jansinger/ostsee-sichtung/commit/24dc708))
* fix: :bug: add required env variables to workflows ([debf5ba](https://github.com/jansinger/ostsee-sichtung/commit/debf5ba))
* fix: :bug: undefined lint error fixed ([fe78cb0](https://github.com/jansinger/ostsee-sichtung/commit/fe78cb0))
* fix: :zap: rebuild package-lock to solve rollup issues ([987bc9b](https://github.com/jansinger/ostsee-sichtung/commit/987bc9b))
* fix: add auth0 configuration to .env.example ([a27e240](https://github.com/jansinger/ostsee-sichtung/commit/a27e240))
* fix: add playwright installation and update test workflows ([e16ff12](https://github.com/jansinger/ostsee-sichtung/commit/e16ff12))
* fix: Add svelte-kit sync to build script for proper Vercel deployment ([27add56](https://github.com/jansinger/ostsee-sichtung/commit/27add56))
* fix: Allow blob storage and fonts ([2822d3f](https://github.com/jansinger/ostsee-sichtung/commit/2822d3f))
* fix: build ([cc4c4dd](https://github.com/jansinger/ostsee-sichtung/commit/cc4c4dd))
* fix: Correct Vercel Blob URL generation for image display ([d9c5789](https://github.com/jansinger/ostsee-sichtung/commit/d9c5789))
* fix: Correct Vercel deployment configuration ([9e84613](https://github.com/jansinger/ostsee-sichtung/commit/9e84613))
* fix: CSP policy ([d405b6d](https://github.com/jansinger/ostsee-sichtung/commit/d405b6d))
* fix: csv export ([08376e7](https://github.com/jansinger/ostsee-sichtung/commit/08376e7))
* fix: database url ([1e2f544](https://github.com/jansinger/ostsee-sichtung/commit/1e2f544))
* fix: Deployment on Vercel ([13b1add](https://github.com/jansinger/ostsee-sichtung/commit/13b1add))
* fix: devDeps ([6f46f7e](https://github.com/jansinger/ostsee-sichtung/commit/6f46f7e))
* fix: do not generate static assets ([7c45d4c](https://github.com/jansinger/ostsee-sichtung/commit/7c45d4c))
* fix: drizzle exclude postgis tables ([0c20b7f](https://github.com/jansinger/ostsee-sichtung/commit/0c20b7f))
* fix: enhance authorization checks in api routes ([b76ea41](https://github.com/jansinger/ostsee-sichtung/commit/b76ea41))
* fix: enhance label management in pr validation workflow ([91d38cd](https://github.com/jansinger/ostsee-sichtung/commit/91d38cd))
* fix: enhance layout and spacing ([0cd684e](https://github.com/jansinger/ostsee-sichtung/commit/0cd684e))
* fix: font loading ([acc1741](https://github.com/jansinger/ostsee-sichtung/commit/acc1741))
* fix: font loading optimization ([23b1bcf](https://github.com/jansinger/ostsee-sichtung/commit/23b1bcf))
* fix: fonts ([09a3958](https://github.com/jansinger/ostsee-sichtung/commit/09a3958))
* fix: formatDate file name ([f63f145](https://github.com/jansinger/ostsee-sichtung/commit/f63f145))
* fix: Image handling for cloud ([7c856f3](https://github.com/jansinger/ostsee-sichtung/commit/7c856f3))
* fix: image processing ([c124f54](https://github.com/jansinger/ostsee-sichtung/commit/c124f54))
* fix: improve CSP configuration ([ac6756d](https://github.com/jansinger/ostsee-sichtung/commit/ac6756d))
* fix: improve EXIF data extraction and handling ([8540527](https://github.com/jansinger/ostsee-sichtung/commit/8540527))
* fix: Kartenimplementierungen verbessert ([1c0a4fc](https://github.com/jansinger/ostsee-sichtung/commit/1c0a4fc))
* fix: make sure sveltekit sync runs before tests ([2c7eb61](https://github.com/jansinger/ostsee-sichtung/commit/2c7eb61))
* fix: Move @sveltejs/kit from devDependencies to dependencies ([16006b6](https://github.com/jansinger/ostsee-sichtung/commit/16006b6))
* fix: new commitlint configuration to work with semantic-release ([69f7a88](https://github.com/jansinger/ostsee-sichtung/commit/69f7a88))
* fix: only show verified reports in map ([15a2307](https://github.com/jansinger/ostsee-sichtung/commit/15a2307))
* fix: optimize display ([c7dcd05](https://github.com/jansinger/ostsee-sichtung/commit/c7dcd05))
* fix: read exif data ([fb415b9](https://github.com/jansinger/ostsee-sichtung/commit/fb415b9))
* fix: Remove problematic vercel.json and let SvelteKit adapter handle deployment ([a7d67e4](https://github.com/jansinger/ostsee-sichtung/commit/a7d67e4))
* fix: reorganize e2e test execution and update vite configuration ([6c23724](https://github.com/jansinger/ostsee-sichtung/commit/6c23724))
* fix: Resolve Vercel build issues with proper npm script paths ([84475e7](https://github.com/jansinger/ostsee-sichtung/commit/84475e7))
* fix: safari user menu ([52b09bf](https://github.com/jansinger/ostsee-sichtung/commit/52b09bf))
* fix: set environment bevore npm run commands in all workflows ([087c8d6](https://github.com/jansinger/ostsee-sichtung/commit/087c8d6))
* fix: Simplify vercel.json to resolve function pattern errors ([58d9c19](https://github.com/jansinger/ostsee-sichtung/commit/58d9c19))
* fix: storage implemtation ([dcc4e4b](https://github.com/jansinger/ostsee-sichtung/commit/dcc4e4b))
* fix: store exif data in uploaded files ([2083418](https://github.com/jansinger/ostsee-sichtung/commit/2083418))
* fix: synchronize svelte kit and improve test workflow in ci ([ed4867b](https://github.com/jansinger/ostsee-sichtung/commit/ed4867b))
* fix: type errors ([abb951e](https://github.com/jansinger/ostsee-sichtung/commit/abb951e))
* fix: type imports ([26cecb3](https://github.com/jansinger/ostsee-sichtung/commit/26cecb3))
* fix: update claude prompt ([4cfe40d](https://github.com/jansinger/ostsee-sichtung/commit/4cfe40d))
* fix: update commit message instructions to use english ([4af246b](https://github.com/jansinger/ostsee-sichtung/commit/4af246b))
* fix: update commitlint configuration for subject case ([3dd4667](https://github.com/jansinger/ostsee-sichtung/commit/3dd4667))
* fix: update instruction for commit message headline to use lowercase ([ad108dc](https://github.com/jansinger/ostsee-sichtung/commit/ad108dc))
* fix: update instructions for commit message conventions ([535976b](https://github.com/jansinger/ostsee-sichtung/commit/535976b))
* fix: update lint and type-check scripts for consistency ([c36921a](https://github.com/jansinger/ostsee-sichtung/commit/c36921a))
* fix: update package.json scripts to not use npx ([2212791](https://github.com/jansinger/ostsee-sichtung/commit/2212791))
* fix: update release workflow to use ssh key for repository checkout ([7ebe5a8](https://github.com/jansinger/ostsee-sichtung/commit/7ebe5a8))
* fix: use local check baltic sea function ([dff02a6](https://github.com/jansinger/ostsee-sichtung/commit/dff02a6))
* fix: use ssl in development, delete cookie if not valid ([85024be](https://github.com/jansinger/ostsee-sichtung/commit/85024be))
* fix: Vercel deployment ([c12ebc8](https://github.com/jansinger/ostsee-sichtung/commit/c12ebc8))
* feat: :fire: new logo integrated ([7c1a005](https://github.com/jansinger/ostsee-sichtung/commit/7c1a005))
* feat: Add clean vercel.json configuration ([654c4ca](https://github.com/jansinger/ostsee-sichtung/commit/654c4ca))
* feat: add semantic release configuration ([33724b0](https://github.com/jansinger/ostsee-sichtung/commit/33724b0))
* feat: add user icon to topbar in admin layout ([cfae9d7](https://github.com/jansinger/ostsee-sichtung/commit/cfae9d7))
* feat: admin panel authentication ([7fe4a8d](https://github.com/jansinger/ostsee-sichtung/commit/7fe4a8d))
* feat: Complete rebranding to OstseeSichtung and production-ready implementation ([f7f9c10](https://github.com/jansinger/ostsee-sichtung/commit/f7f9c10))
* feat: enhance map with non-clustered layer and dynamic clustering ([880419d](https://github.com/jansinger/ostsee-sichtung/commit/880419d))
* feat: Export direkt aus der Tabelle ([8ebd95d](https://github.com/jansinger/ostsee-sichtung/commit/8ebd95d))
* feat: mobile view optimized, session handling fixed ([33aa62c](https://github.com/jansinger/ostsee-sichtung/commit/33aa62c))
* feat: show map in admin area ([3bd3196](https://github.com/jansinger/ostsee-sichtung/commit/3bd3196))
* feat: store exif data as JSONB in the database ([05ee4ec](https://github.com/jansinger/ostsee-sichtung/commit/05ee4ec))
* feat: Update build configuration and deployment setup ([e3e9364](https://github.com/jansinger/ostsee-sichtung/commit/e3e9364))
* feat: use role to grant permission ([c090421](https://github.com/jansinger/ostsee-sichtung/commit/c090421))
* test: add comprehensive tests for auth functions ([7e8b306](https://github.com/jansinger/ostsee-sichtung/commit/7e8b306))
* chore: :rocket: Improvements in load handling ([e29a2fc](https://github.com/jansinger/ostsee-sichtung/commit/e29a2fc))
* chore: optimize server side code ([d35f1fb](https://github.com/jansinger/ostsee-sichtung/commit/d35f1fb))
* chore: refactoring ([531fb23](https://github.com/jansinger/ostsee-sichtung/commit/531fb23))
* chore: update playwright configuration for e2e testing ([f956f95](https://github.com/jansinger/ostsee-sichtung/commit/f956f95))
* chore(deps-dev): bump @eslint/compat from 1.3.1 to 1.3.2 ([47f48a2](https://github.com/jansinger/ostsee-sichtung/commit/47f48a2))
* chore(deps-dev): bump @sveltejs/vite-plugin-svelte from 6.1.0 to 6.1.2 ([c25956a](https://github.com/jansinger/ostsee-sichtung/commit/c25956a))
* chore(deps-dev): bump @tailwindcss/vite from 4.1.11 to 4.1.12 ([2049067](https://github.com/jansinger/ostsee-sichtung/commit/2049067))
* chore(deps-dev): bump @types/node from 22.17.0 to 22.17.1 ([ce6c5d6](https://github.com/jansinger/ostsee-sichtung/commit/ce6c5d6))
* chore(deps-dev): bump pino from 9.8.0 to 9.9.0 ([388ba3f](https://github.com/jansinger/ostsee-sichtung/commit/388ba3f))
* chore(deps-dev): bump svelte from 5.37.3 to 5.38.1 ([0a13d18](https://github.com/jansinger/ostsee-sichtung/commit/0a13d18))
* chore(deps-dev): bump tailwindcss from 4.1.11 to 4.1.12 ([0c81952](https://github.com/jansinger/ostsee-sichtung/commit/0c81952))
* chore(deps-dev): bump vite from 7.0.6 to 7.1.2 ([45da621](https://github.com/jansinger/ostsee-sichtung/commit/45da621))
* chore(deps-dev): bump vite-plugin-devtools-json from 0.2.1 to 0.4.1 ([57943c9](https://github.com/jansinger/ostsee-sichtung/commit/57943c9))
* chore(deps): bump drizzle-orm from 0.40.1 to 0.44.4 ([769de3c](https://github.com/jansinger/ostsee-sichtung/commit/769de3c))
* refactor: :lock: Improved authorization handling ([7da2759](https://github.com/jansinger/ostsee-sichtung/commit/7da2759))
* refactor: types now in one place ([27b7711](https://github.com/jansinger/ostsee-sichtung/commit/27b7711))
* ci(ci): conventional commit for release management ([883a3bb](https://github.com/jansinger/ostsee-sichtung/commit/883a3bb))
* build: dependabot ([671b5b3](https://github.com/jansinger/ostsee-sichtung/commit/671b5b3))
* doc: documentation refreshed, project name change ([062b63b](https://github.com/jansinger/ostsee-sichtung/commit/062b63b))
* debug: Add image loading debugging tools for admin view ([af0378c](https://github.com/jansinger/ostsee-sichtung/commit/af0378c))

## [1.0.0] - 2024-01-15

### ✨ Features

- **export**: Complete export functionality redesign with modal interface
- **export**: Add CSV, JSON, XML, and KML export formats with filter support
- **export**: Add file size estimation for each export format
- **auth**: User authentication and authorization system
- **admin**: Administrative interface for sighting management
- **report**: Multi-step sighting reporting form with GPS integration
- **map**: Interactive map visualization with OpenLayers
- **ui**: Modern responsive design with TailwindCSS and DaisyUI

### 🐛 Bug Fixes

- **font**: Fix font loading flicker (FOUT) with optimized metrics
- **font**: Remove hardcoded font preloads causing 404 errors
- **exif**: Fix EXIF data extraction by moving to server-side processing
- **ui**: Various mobile responsiveness improvements

### 🏗️ Build System

- **ci**: Add Dependabot combined PR workflow with conventional commits
- **ci**: Setup semantic-release for automated versioning
- **ci**: Configure commitlint and husky for commit quality enforcement
- **config**: Optimize Vite configuration and suppress CommonJS warnings

### 📚 Documentation

- Add comprehensive CONTRIBUTING.md with conventional commits guidelines
- Update README with development setup instructions

---

*This changelog is automatically generated using [semantic-release](https://semantic-release.gitbook.io/). Future releases will be documented automatically based on conventional commit messages.*
