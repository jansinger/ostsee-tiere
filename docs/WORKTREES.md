# Git Worktrees — Setup und Betrieb

Claude Code legt Worktrees unter `.claude/worktrees/<name>/` an, manuelle liegen in
`.worktrees/`. Beide Verzeichnisse sind gitignoriert.

## Einrichtung

```bash
npm run worktree:setup
```

Das Skript ([`scripts/setup-worktree.sh`](../scripts/setup-worktree.sh)) ist idempotent
und im Haupt-Repo ein No-Op. Es läuft zusätzlich automatisch über den
`SessionStart`-Hook in [`.claude/settings.json`](../.claude/settings.json), ein
frischer Worktree ist also ohne Zutun einsatzbereit.

| Schritt                 | Warum                                                                      |
| ----------------------- | -------------------------------------------------------------------------- |
| `.env` → Haupt-Repo     | Symlink statt Kopie: keine driftenden Zweitfassungen der Secrets           |
| `uploads/` → Haupt-Repo | `UPLOAD_PATH` ist relativ, die DB teilen sich aber alle Worktrees          |
| `svelte-kit sync`       | ohne `.svelte-kit/tsconfig.json` bricht `npm run type-check` mit TS5083 ab |
| Lockfile-Vergleich      | warnt, wenn der Branch andere Abhängigkeiten braucht als das Haupt-Repo    |

## Kein `npm install` im Worktree

Node und npm suchen `node_modules` in **allen übergeordneten Verzeichnissen**. Weil die
Worktrees unter `<repo>/.claude/worktrees/` liegen, greifen sie automatisch auf
`<repo>/node_modules` zu — inklusive `node_modules/.bin`, also auch `npm run …`.

Verifiziert in einem Worktree ganz ohne eigenes `node_modules`: `npm run lint`,
`npx svelte-kit sync` und `npm run test:unit` liefen durch (damals 2038 Tests — die
Zahl wächst mit der Suite und ist hier nur Beleg dafür, dass die Suite vollständig
lief, nicht der Sollwert).

Eine eigene Installation kostet ~800 MB pro Worktree ohne Gegenwert. Nötig ist sie nur
in zwei Fällen:

- der Branch ändert `package.json`/`package-lock.json` — dann `npm install` **im
  Worktree** (das lokale `node_modules` verdeckt das des Haupt-Repos)
- der Worktree liegt außerhalb des Repo-Baums — dann greift die Auflösung nach oben nicht

## Browser-Tests: `server.fs.allow` muss das echte `node_modules` freigeben

Die `*.svelte.test.ts`-Tests (`npm run test:unit:client`) laufen über einen
Vite-Dev-Server, der Module an den Headless-Browser ausliefert. Im Worktree liegt das
aufgelöste `node_modules` im Haupt-Repo — **außerhalb** des Worktree-Roots — und Vites
`server.fs.allow` blockte die Auslieferung: alle Browser-Tests scheiterten mit
„Failed to fetch dynamically imported module …/node_modules/vitest-browser-svelte/…".

Behoben in [`vite.config.ci.ts`](../vite.config.ci.ts) (wird von den Client-Tests via
`vitest.config.ts` extended): Das reale `node_modules` wird über
`createRequire(import.meta.url).resolve('vite/package.json')` ermittelt und zusammen
mit `searchForWorkspaceRoot(process.cwd())` in `server.fs.allow` eingetragen —
`fs.allow` ersetzt Vites Default (Workspace-Root), deshalb müssen beide Einträge rein.

Seit 2026-10-20 steht dieselbe Freigabe auch in [`vite.config.ts`](../vite.config.ts) für
`npm run dev`. Dort fehlte sie: Alles, was per `/@fs/` aus dem Haupt-Repo kommt, bekam
403 — zuerst sichtbar an den `@fontsource`-Schriften („is outside of Vite serving allow
list" im Terminal). Dateien außerhalb der beiden Einträge (etwa `.env` im Haupt-Repo)
bleiben gesperrt.

Zwei Stolperfallen für künftige Änderungen an dieser Stelle:

- Ein bloßer Existenz-Check per Verzeichnis-Aufstieg findet das **falsche**
  Verzeichnis: Vite legt im Worktree ein Cache-Stub `node_modules/.vite` ohne Pakete
  an. Deshalb Nodes eigene Paketauflösung nutzen.
- Verifiziert am 2026-07-29: `npx vitest run --project client src/lib/components/map/Panel/`
  läuft mit dieser Config im Worktree **und** im Haupt-Repo grün.

## Was von selbst funktioniert

| Thema           | Warum kein Setup nötig                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TLS-Zertifikate | `npm run dev` ruft `scripts/setup-dev-certs.mjs` auf und stellt sie pro Worktree aus (mkcert-CA ist global)                                                                 |
| Git-Hooks       | `core.hooksPath = .husky/_` löst gegen das Haupt-Repo auf — prüfbar mit `git rev-parse --git-path hooks`                                                                    |
| MCP-Server      | `.mcp.json` ist committet und wird mit ausgecheckt                                                                                                                          |
| Rules & Skills  | `.claude/rules/`, `.claude/agents/`, `.claude/skills/` sind committet                                                                                                       |
| Playwright      | Browser liegen in einem globalen Cache außerhalb des Repos (macOS `~/Library/Caches/ms-playwright`, Linux `~/.cache/ms-playwright`, Windows `%LOCALAPPDATA%\ms-playwright`) |

Nicht mit übernommen wird `.claude/settings.local.json` (global gitignoriert) — lokale
Permissions gelten pro Worktree neu. Bei Bedarf verlinken:

```bash
ln -s ../../settings.local.json .claude/settings.local.json
```

## Dev-Server: nur einer auf Port 4000

`PUBLIC_SITE_URL` steht in `.env` fest auf `https://localhost:4000` und baut daraus die
Auth0-Callback-URL (`src/routes/api/auth/login/+server.ts`). Ein Dev-Server auf einem
anderen Port schickt Auth0 deshalb zurück auf 4000 — verifiziert: mit
`VITE_DEV_PORT=4005` enthält der `/api/auth/login`-Redirect weiterhin
`redirect_uri=https://localhost:4000/…`.

Für einen zweiten Server parallel:

```bash
echo 'PUBLIC_SITE_URL="https://localhost:4005"' > .env.local   # überschreibt .env
VITE_DEV_PORT=4005 npm run dev
```

`.env.local` hat in Vite Vorrang vor `.env` und ist gitignoriert (verifiziert: der
Redirect zeigt danach auf 4005). **Login funktioniert trotzdem nur**, wenn genau diese
Callback-URL in den Auth0-Einstellungen als _Allowed Callback URL_ hinterlegt ist.
Ohne Auth0-Eintrag: Dev-Server auf 4000 lassen und immer nur einen laufen lassen.

Belegt ein anderer Prozess den Port, bricht `npm run dev` seit
[`vite.config.ts`](../vite.config.ts) (`strictPort: true`) ab, statt still auf den
nächsten freien Port auszuweichen. Läuft dort ein Dev-Server dieses Projekts, nennt die
Meldung davor sein Arbeitsverzeichnis:

```
Port 4000 wird bereits von einem Dev-Server bedient — aus:
  /…/.claude/worktrees/hopeful-curie-90f94e
Dieses Verzeichnis ist:
  /…/.claude/worktrees/auth0-prod-settings-499d2e
```

Das Ausweichen war nie eine brauchbare Rückfallebene: Ein Server auf 4001 hat wegen
`PUBLIC_SITE_URL` einen kaputten Login — und er machte E2E-Läufe gegen fremde Worktrees
möglich (nächster Abschnitt).

## E2E-Tests: eigener Port pro Worktree, geprüfte Server-Identität

**Geteilte Ports heben die Aussagekraft der Tests auf.** Das ist die schwerwiegendere
Folge als ein kaputter Login — und sie fällt nicht auf.

Vorher setzte `npm run test:e2e` für **alle** Worktrees fest `VITE_DEV_PORT=4001`, und
`playwright.config.ts` benutzt lokal `reuseExistingServer`. Antwortete auf 4001
irgendein Server, lief die Suite gegen ihn — ohne zu prüfen, woher der Code stammt.
Gemessen am 2026-08-02 gehörten 4000 **und** 4001 einem fremden Worktree:

```bash
lsof -a -p $(lsof -ti:4001) -d cwd    # zeigt das ausliefernde Verzeichnis
```

Die Folge waren 32 Fehlschläge für Fundstellen, die im eigenen Branch längst behoben
waren. Der gefährliche Fall ist aber der umgekehrte: Der fremde Worktree hat die Stelle
zufällig sauber, der Test wird **grün**, die eigene Regression bleibt unentdeckt. Am
Lauf ist nichts Auffälliges zu sehen. Vermutlich derselbe Ursprung: ein Paletten-Scan,
der nach dem Beheben weiter die alten Fundstellen meldete, und zwei
`legacy-inbox/app.test.js`-Timeouts, die als „Flakiness unter Last" abgelegt wurden.

Zwei Ebenen dagegen, beide in [`src/tools/dev-server-identity.ts`](../src/tools/dev-server-identity.ts):

| Ebene                                          | Wirkung                                                                                                                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worktreeDevPort()` — Port aus dem Pfad-Hash   | Jeder Worktree zieht einen Port aus 41000–44999, derselbe Worktree stets denselben. Kollisionen sind damit unwahrscheinlich, nicht ausgeschlossen (Geburtstagsproblem: ~1 % bei 10 Worktrees, ~5 % bei 20) |
| `assertServerIdentity()` in `e2e/global-setup` | Der Dev-Server meldet unter `/__dev-server-identity` sein `process.cwd()`. Weicht es ab, **bricht der Lauf ab**                                                                                            |

Die zweite Ebene fängt die erste auf: Ziehen zwei Worktrees denselben Port, ist das
kein stiller Fehler, sondern ein Abbruch mit beiden Verzeichnissen in der Meldung. Der
zweite Worktree kann erst testen, wenn der fremde Server beendet ist — unbequem, aber
in die richtige Richtung.

Der Abbruch ist Absicht — nicht eine Warnung, die im Log untergeht. Stillschweigend
fremden Code zu testen ist genau der Fehler, der verhindert werden soll:

```
E2E-Abbruch: Der Server liefert aus einem fremden Arbeitsverzeichnis aus.
  URL:       https://localhost:4412
  liefert:   /…/.claude/worktrees/hopeful-curie-90f94e
  erwartet:  /…/.claude/worktrees/auth0-prod-settings-499d2e
```

`reuseExistingServer` bleibt lokal an: Ein übrig gebliebener Server _dieses_ Worktrees
spart den Kaltstart, und dass er der richtige ist, ist jetzt geprüft statt geraten. Der
Endpunkt hängt am Vite-Plugin `devServerIdentity()`, läuft also nur im Dev-Server und
kommt nicht in den Production-Build. Ein manuell gesetztes `VITE_DEV_PORT` hat weiterhin
Vorrang — praktisch, um den Abbruch vorzuführen:

```bash
VITE_DEV_PORT=<port eines fremden Worktrees> npx playwright test e2e/about-page.spec.ts
```

**CI ist nicht betroffen** und bleibt bei Port 4000: dort gilt `reuseExistingServer:
false`, und der Job startet seinen eigenen Server im eigenen Container. Der
Identitäts-Check läuft dort trotzdem mit, damit ein versehentlich entferntes Plugin
auffällt, statt die Prüfung still abzuschalten.

### Komponenten-Tests: derselbe Fehler, eigener Port

Vitest bindet im Browser-Modus fest auf **63315** — in jedem Worktree derselbe Port.
Seit die Komponenten-Tests Teil von `npm run test:quick` sind (2026-08-10), ist der
gleichzeitige Lauf in zwei Worktrees der Normalfall, und der Zusammenstoß meldete sich
nicht als Portfehler, sondern als vereinzelter Fehlschlag oder als „no tests": ein
Befund, der nach einem Defekt am Code aussieht und keiner ist.

`worktreeBrowserApiPort()` zieht deshalb aus demselben Pfad-Hash einen Port aus
**45000–48999** — eigenes Fenster, damit sich Dev-Server und Komponenten-Tests im
selben Worktree nicht verdrängen. Welcher Port es ist, steht in den Fehlermeldungen des
Laufs (`http://localhost:<port>/src/…`).

## `CI=1` lokal: Adressfamilie, nicht Port (behoben 2026-08-04)

Bis zum 2026-08-04 brach `CI=1 npx playwright test` bei parallel laufendem
`npm run dev` mit `Timed out waiting 120000ms from config.webServer` ab — ohne jeden
Hinweis auf die Ursache. Es hat zweimal zu Fehldiagnosen geführt: einmal wurde der
Timeout für einen Testfehler gehalten, einmal wurde ein `git stash`-Vergleich wertlos,
weil der Lauf gar nicht erst startete.

**Es war keine Portkollision** — deshalb half die Portvergabe pro Worktree hier nicht:

| Prozess                                        | Bind                             |
| ---------------------------------------------- | -------------------------------- |
| `npm run dev` (`vite.config.ts`, `localhost`)  | nur `[::1]:4000` (IPv6-Loopback) |
| E2E-webServer (`vite.config.ci.ts`, `0.0.0.0`) | nur `*:4000` (IPv4-Wildcard)     |

Zwei Adressfamilien, kein Zusammenstoß: **beide** Server binden erfolgreich, `strictPort`
schlägt nie an. `strictPort` schützt nur innerhalb _einer_ Familie — die stille Annahme,
es decke jede Doppelbelegung ab, war falsch.

Der Fehler steckte in der Gegenrichtung: `playwright.config.ts` wartete auf
`http://localhost:4000`, und `localhost` löst auf macOS zuerst nach `::1` auf. Der
Readiness-Poll landete also beim fremden **HTTPS**-Dev-Server, bekam auf Klartext-HTTP nie
eine gültige Antwort — und lief die vollen 120 s. Der eigene E2E-Server stand die ganze
Zeit fertig daneben, nur unter `127.0.0.1` statt unter `localhost`.

Nachmessen lässt sich das so — die Spalte hinter `TCP` ist der Punkt:

```bash
lsof -nP -iTCP:4000 -sTCP:LISTEN
```

Behoben in [`src/tools/dev-server-identity.ts`](../src/tools/dev-server-identity.ts):
`CI_DEV_HOST` und `ciDevPort()` sind jetzt die **eine** Quelle, aus der
`vite.config.ci.ts` seinen Bind und `playwright.config.ts` seine Warte-Adresse beziehen;
`loopbackHostFor()` leitet die Loopback-Adresse aus dem Bind ab, statt `localhost` zu
raten. Beide Server laufen seitdem nebeneinander — verifiziert: `npm run dev` auf
`[::1]:4000` und `CI=1 npx playwright test --project=chromium e2e/homepage.test.ts`
gleichzeitig, 7 passed. Nebeneffekt: Weil Playwright jetzt die Adresse abfragt, die der
Server auch bedient, greift dessen eigene Vorabprüfung wieder und meldet eine echte
Doppelbelegung **sofort** statt nach 120 s:

```
Error: http://127.0.0.1:4000 is already used, make sure that nothing is running
on the port/url or set reuseExistingServer:true in config.webServer.
```

Zwei Dinge, die dabei auffielen und beim nächsten Mal Zeit sparen:

- **`e2e/global-setup.ts` kann diesen Fall nicht abfangen.** Playwright startet den
  webServer **vor** dem `globalSetup`; bei einem webServer-Timeout läuft `globalSetup`
  nie an (nachgemessen: keine seiner Ausgaben erscheint). Die Identitätsprüfung dort
  bleibt für den lokalen `reuseExistingServer`-Pfad richtig und wichtig — als Wache gegen
  webServer-Timeouts ist sie strukturell zu spät.
- **`vite.config.ci.ts` ignorierte `VITE_DEV_PORT`**, obwohl `playwright.config.ts` es an
  den webServer durchreicht. Der Port ist jetzt über `ciDevPort()` wirklich steuerbar:

```bash
CI=1 VITE_DEV_PORT=4300 npx playwright test --project=chromium
```

## Geteilte Ressourcen — Vorsicht

Alle Worktrees zeigen über den `.env`-Symlink auf **dieselbe** Datenbank und dieselben
Uploads.

- `npm run db:push` aus einem Worktree ändert das Schema für alle
- `npm run media:cleanup-orphans` löscht Dateien für alle
- Migrations-Branches deshalb bevorzugt gegen die Docker-DB (Port 5433) testen
- Manuelle Browser-Verifikation von Foto-/Video-Upload (Pflicht bei
  UI-Änderungen) schreibt echte Zeilen und Dateien in genau diese geteilte DB —
  Aufräumbefehl und Hintergrund: `.claude/rules/upload.md` §
  „Aufbewahrung unverknüpfter Uploads"

## Code-Graph-Tools

`.tokensave/` und `.codegraph/` liegen nur im Haupt-Repo und sind nicht committet.
Abfragen aus einem Worktree beantworten sie aus dem Index des Haupt-Repos — Symbole,
die es nur auf dem Branch gibt, fehlen dort. `tokensave` warnt in dem Fall selbst.
Bei branch-spezifischen Fragen mit Read/Grep gegenprüfen.

## Aufräumen

```bash
git worktree list                         # Übersicht
git worktree remove .claude/worktrees/<name>
git worktree prune                        # verwaiste Einträge
```

Alte Worktrees mit eigenem `node_modules` (aus der Zeit vor diesem Setup) lassen sich
gefahrlos verschlanken:

```bash
du -sh .claude/worktrees/*/node_modules   # Kandidaten finden
rm -rf .claude/worktrees/<name>/node_modules
```
