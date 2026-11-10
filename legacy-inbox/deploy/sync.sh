#!/bin/sh
#
# Schickt den Legacy-Posteingang an die konfigurierte Instanz und verschiebt
# jede angenommene Datei nach importiert/. Gedacht für einen Zeitplan alle
# 15 Minuten.
#
# Das Werkzeug selbst liegt im deployten Repo; ein `plesk ext git --deploy`
# zieht es mit.
#
# Dieser Wrapper beantwortet eine einzige Frage: Muss ein Mensch hinsehen?
#
#   nichts zu tun            → still
#   alles übertragen         → kurze Ausgabe, keine Meldung
#   Rate-Limit erreicht      → kurze Ausgabe, keine Meldung  ← siehe unten
#   alles andere             → Ausgabe UND Mail, Exit ≠ 0
#
# Warum das Rate-Limit keine Meldung wert ist: Die Zielinstanz nimmt 20
# Meldungen pro Stunde und IP an. Ein Rückstand — etwa am 2026-08-12, als ein
# Nutzer 111 Sichtungen aus sechs Jahren nachtrug — verteilt sich deshalb über
# Stunden, und jeder Lauf dazwischen endet am Limit. Das ist der vorgesehene
# Ablauf und heilt sich beim nächsten Lauf von selbst; bei vier Läufen je
# Stunde wären es vier Meldungen für einen Zustand, der in Ordnung ist.
#
# Anders als `netzwerk` (unklar, ob die Sichtung angelegt wurde) und
# `verschieben` (Sichtung angelegt, Datei liegt noch im Posteingang) braucht
# hier niemand einzugreifen. Die Ausnahme gilt nur, wenn sonst nichts auffiel:
# Kam zusätzlich eine Ablehnung vor, bleibt es bei Mail und Exit ≠ 0.
#
# Der Versand läuft über melde.sh und nicht über den Plesk-Zeitplan — dessen
# Benachrichtigung kommt nachweislich nicht an (Begründung dort).
set -u

VERZEICHNIS=$(dirname "$0")
KONFIG="${LEGACY_SYNC_CONFIG:-/var/www/vhosts/schweinswalsichtung.de/legacy-sync/config}"

# Fehlende oder unlesbare Bausteine ausdrücklich abfangen. Ohne diese Prüfung
# scheitert der Lauf zwar auch, aber an einer Folgewirkung: `set -u` meldet
# dann eine nicht gesetzte Variable, und im Cron-Protokoll steht ein Fehler,
# der nichts mit der Ursache zu tun hat. Genau dieser Fall trat beim
# Einrichten auf, als melde.sh root-eigen mit Modus 640 lag.
for BAUSTEIN in "$KONFIG" "$VERZEICHNIS/melde.sh"; do
	if [ ! -r "$BAUSTEIN" ]; then
		echo "Nicht lesbar: $BAUSTEIN"
		echo "Prüfen: existiert die Datei, und gehört sie dem ausführenden Benutzer?"
		exit 1
	fi
done

. "$KONFIG"
. "$VERZEICHNIS/melde.sh"

# Aufbewahrungsfrist: einmal am Tag abgelaufene Dateien aus importiert/ und
# abgewiesen/ löschen (src/tools/prune-legacy-inbox.js). Die Dateien tragen
# Name, E-Mail und Telefon der Melder; in der Datenbank werden diese Angaben
# nach 3 Monaten geleert, hier dürfen sie nicht länger liegen.
#
# Einmal am Tag statt bei jedem Lauf: Ein Befund, der einen Menschen braucht
# (Posteingang über der Frist), käme sonst alle 15 Minuten als Mail. Die
# Marke wird auch nach einem Fehler gesetzt — aus demselben Grund. Sie liegt
# in der Wurzel des Datenverzeichnisses, die der Dienst nicht liest.
#
# Das Aufräumen hält den Sync nie auf: Scheitert es, wird gemeldet und
# trotzdem übertragen.
AUFRAEUM_CLI="$REPO_TOOLS/prune-legacy-inbox-cli.js"
AUFRAEUM_MARKE="$DATEN_DIR/.aufgeraeumt-am"
HEUTE=$(date +%Y-%m-%d)
if [ "$(cat "$AUFRAEUM_MARKE" 2>/dev/null)" != "$HEUTE" ]; then
	echo "$HEUTE" >"$AUFRAEUM_MARKE"
	if [ ! -f "$AUFRAEUM_CLI" ]; then
		echo "Aufräum-Skript fehlt: $AUFRAEUM_CLI" | melde "Posteingang: Aufräumen nicht möglich"
	else
		AUFRAEUM_AUSGABE=$("$NODE" "$AUFRAEUM_CLI" "--dir=$DATEN_DIR" 2>&1)
		AUFRAEUM_CODE=$?
		echo "$AUFRAEUM_AUSGABE"
		if [ "$AUFRAEUM_CODE" -ne 0 ]; then
			echo "$AUFRAEUM_AUSGABE" | melde "Posteingang: Aufräumen braucht einen Blick"
		fi
	fi
fi

CLI="$REPO_TOOLS/send-legacy-inbox-cli.js"

if [ ! -f "$CLI" ]; then
	# Lieber laut scheitern als still nichts tun: Fehlt das Skript, ist der
	# Deploy kaputt oder verschoben — und ein Sync, der bloß schweigt, sähe
	# von außen wie ein ruhiger Tag aus.
	TEXT="Das Sync-Skript wurde nicht gefunden: $CLI

Der Posteingang wird derzeit NICHT nach Produktion übertragen.
Ist der Git-Deploy des Repos durchgelaufen? (plesk ext git --deploy)"
	echo "$TEXT"
	echo "$TEXT" | melde "Posteingang-Sync: Skript fehlt"
	exit 1
fi

AUSGABE=$("$NODE" "$CLI" "$ZIEL_URL" "--dir=$DATEN_DIR" 2>&1)
CODE=$?

if [ "$CODE" -ne 0 ]; then
	# Rate-Limit ohne begleitende Ablehnung: erwarteter Zwischenstand.
	case "$AUSGABE" in
	*"Rate-Limit erreicht"*)
		case "$AUSGABE" in
		*", 0 abgelehnt."*)
			echo "$AUSGABE" | grep "übernommen und nach importiert"
			echo "Rate-Limit der Zielinstanz erreicht — der Rest folgt beim nächsten Lauf."
			exit 0
			;;
		esac
		;;
	esac

	echo "$AUSGABE"
	printf '%s\n\n%s\n' "$AUSGABE" "Offen im Posteingang: $(ls -1 "$DATEN_DIR/posteingang" 2>/dev/null | wc -l | tr -d ' ') Datei(en)." |
		melde "Posteingang-Sync fehlgeschlagen"
	exit "$CODE"
fi

# Erfolgreicher Lauf ohne Übertragung: der Normalfall zwischen zwei Meldungen.
case "$AUSGABE" in
*"0/0 übernommen"*) exit 0 ;;
esac

echo "$AUSGABE"
