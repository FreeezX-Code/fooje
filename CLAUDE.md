# Rezept-Wochenplaner

Web-App (PWA) für zwei Personen: Sie verwaltet unsere gemeinsamen Rezepte, plant jede Woche automatisch einen ausgewogenen Essensplan und schickt die Zutaten an die Einkaufslisten-App Bring!. Genutzt wird sie auf einem Android-Handy und einem iPhone, jeweils vom Startbildschirm aus.

## Über mich (wichtig für die Zusammenarbeit)

- Das ist mein erstes Programmierprojekt. Ich bin technisch versiert (Maschinenbautechniker) und habe schon einfache HTML-Tools gebaut, bin aber kein Entwickler.
- Antworte und erkläre auf Deutsch, in einfachen Worten. Fachbegriffe kurz erklären, wenn sie das erste Mal vorkommen.
- Erkläre vor größeren Änderungen in 2–3 Sätzen, was du vorhast und warum.
- Frag nach, bevor du Programme installierst, Dateien löschst, die Projektstruktur umbaust oder etwas online veröffentlichst.
- Wenn ich etwas außerhalb dieses Rechners tun muss (z. B. Konto bei Supabase anlegen, Einstellungen im Browser), gib mir eine kurze Schritt-für-Schritt-Anleitung.
- Lieber einfach und verständlich als clever. Keine Features einbauen, die ich nicht angefragt habe.
- Wenn etwas nicht funktioniert, erkläre die Ursache, nicht nur die Lösung.

## Technik

- **Kein Framework, kein Build-Schritt:** HTML, CSS und JavaScript (ES-Module). Die Dateien sollen so, wie sie im Ordner liegen, online gestellt werden können.
- **PWA:** `manifest.json`, Service Worker, App-Icons. Muss auf Android (Chrome) und iPhone (Safari, „Zum Home-Bildschirm“) als App vom Startbildschirm laufen.
- **Daten und Login:** Supabase über die offizielle JavaScript-Bibliothek `supabase-js`.
  - Login per E-Mail und Passwort, nur zwei Konten (wir beide). Öffentliche Registrierung nach dem Anlegen der zwei Konten abschalten.
  - Alle Tabellen mit Row Level Security: nur angemeldete Nutzer dürfen lesen und schreiben.
  - Änderungen sollen ohne Neuladen auf dem anderen Handy erscheinen (Supabase Realtime).
  - Datenbankänderungen als SQL-Migrationsdateien im Projekt ablegen, damit nachvollziehbar ist, wie die Datenbank aufgebaut ist.
- **Geheimnisse:** Nur der öffentliche Supabase-Schlüssel (anon key) darf in den App-Dateien stehen. Passwörter und API-Schlüssel (Bring!, KI) gehören in Supabase-Funktionen, niemals in den App-Code oder in Git.
- **Hosting:** kostenlos bei GitHub Pages oder Netlify, per HTTPS.
- **Lokal testen:** mit einem einfachen lokalen Webserver.
- Code-Bezeichner (Variablen, Funktionen, Dateien) auf Englisch, alle Texte in der App auf Deutsch.
- Wenige, übersichtliche Dateien. Externe Bibliotheken nur, wenn wirklich nötig.
- Nach jedem funktionierenden Schritt ein Git-Commit mit kurzer deutscher Beschreibung.

## Datenmodell Rezept (Stufe 1)

- Name
- Zutaten: Liste aus Name, Menge, Einheit (Menge/Einheit optional, z. B. „Salz, etwas“)
- Zubereitung: Liste von Schritten
- Portionen
- Zubereitungszeit in Minuten
- Hauptkomponente: Fleisch, Geflügel, Fisch, vegetarisch, vegan
- Beilage: Nudeln, Reis, Kartoffeln, Brot, keine
- Tags (frei, z. B. „schnell“, „Sommer“)
- Bild (optional, Foto aus Galerie oder Kamera, gespeichert in Supabase Storage)
- Quelle (optional, Link)
- Favorit (ja/nein)
- Zuletzt gekocht (Datum, optional)
- Angelegt von, angelegt am, geändert am

Das Modell so anlegen, dass später Felder und Tabellen für die Wochenplanung ergänzt werden können, ohne vorhandene Rezepte zu verlieren.

## Ausbaustufen

1. **Grundgerüst, Login und Rezeptsammlung** ✓ abgeschlossen
   - Leere PWA lokal zum Laufen bringen, dann online stellen und auf beiden Handys zum Startbildschirm hinzufügen
   - Supabase einrichten: Projekt, Tabellen, zwei Logins
   - Rezepte anlegen, bearbeiten, löschen, ansehen (das Formular wird später zum Prüf-Bildschirm für importierte Rezepte, siehe „Wie Rezepte in die App kommen“)
   - Liste mit Suche und Filter nach Hauptkomponente und Tags
   - Änderungen erscheinen auf beiden Handys
   - Backup: alle Rezepte als JSON-Datei exportieren und wieder importieren
2. **Wochenplan und Kalender** ← AKTUELL
   - Ein Gericht pro Tag, Wochenansicht Mo–So, Navigation über eine Leiste „Rezepte | Wochenplan“
   - Generator mit Regeln für Ausgewogenheit, die Regeln sind in der App einstellbar: je Hauptkomponente mindestens/höchstens pro Woche, nicht zweimal hintereinander dieselbe Hauptkomponente bzw. Beilage, Rezepte der letzten X Wochen meiden, Favoriten bevorzugen. Reichen die Rezepte nicht, trotzdem planen und sagen, welche Regel nicht eingehalten wurde
   - Pro Tag: neu würfeln, Gericht festhalten (bleibt beim Neu-Würfeln stehen), Tag frei (nichts planen), Rezept selbst auswählen, mit anderem Tag tauschen/verschieben
   - Wochenplan erscheint live auf beiden Handys und ist offline lesbar
   - Später (verschoben): automatische Planung am gewählten Wochentag mit Benachrichtigung
3. Bring!-Anbindung: Zutaten der Woche zusammenfassen und über eine Supabase-Funktion an Bring! übergeben (inoffizielle API), Fallback „als Text teilen“
4. Import aus Web und TikTok: Android über das Teilen-Menü (Web Share Target), iPhone über Link einfügen oder Kurzbefehl; Webrezepte über Schema.org-Daten auslesen, TikTok über Beschreibung und KI; Import als Entwurf

Nur an der aktuellen Stufe arbeiten. Spätere Stufen nicht vorwegnehmen.

## Wie Rezepte in die App kommen

- **Hauptweg ist der Import:** Rezepte werden vor allem aus geteilten Websites und Videos (z. B. TikTok) angelegt, mit KI-Unterstützung durch Claude (Stufe 4). Von Hand abtippen ist nur die Notlösung.
- **Das Formular ist der Prüf-Bildschirm:** Ein Import erzeugt einen Entwurf, der im normalen Rezeptformular vorausgefüllt geöffnet wird. Dort wird geprüft, korrigiert und gespeichert. Das Formular muss deshalb gut mit vorausgefüllten Daten funktionieren.
- **KI-Anbindung:** Die App ruft eine Supabase-Funktion auf, diese fragt Claude über die Anthropic-API. Der API-Schlüssel liegt nur in der Supabase-Funktion. Dafür wird in Stufe 4 ein Anthropic-Konto nötig.
- **Übergangslösung bis Stufe 4:** Links oder Videobeschreibungen im Chat an Claude Code geben. Claude erstellt daraus eine JSON-Datei im Format des Backup-Imports (Stufe 1), die in der App importiert wird.

## Bedienung

- Für Handys gebaut (Hochformat), große Schaltflächen, gut mit dem Daumen bedienbar
- Ruhiges Design in Anthrazit-Tönen, folgt der Einstellung des Handys (hell oder Dunkelmodus); Farbe sparsam als Akzent
- Rezepte als Bildkarten mit Text auf dem Foto; ohne Foto Farbkachel je Hauptkomponente
- Dezente Animationen (Einblenden, Antipp-Rückmeldung); bei „Bewegung reduzieren“ am Handy keine Animationen
- Hält sich an die sicheren Bereiche des iPhones (Notch, Home-Leiste)
- Funktioniert auch bei schlechtem Empfang lesend (zuletzt geladene Rezepte zwischenspeichern)
