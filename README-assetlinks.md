# assetlinks.json - Anleitung zum Ausfüllen

Diese Datei beweist Android gegenüber, dass die TWA-App und diese Website (Domain) zusammengehören.
Ohne korrekt ausgefüllte Werte zeigt die App eine Browser-Adressleiste an, statt sich wie eine
"echte" App zu verhalten.

**Wichtig:** Diese Datei muss über HTTPS erreichbar sein unter genau diesem Pfad:
`https://<deine-domain>/.well-known/assetlinks.json`

Bei GitHub Pages heißt das: die Datei liegt im Repo-Root im Ordner `.well-known/`, GitHub Pages
liefert sie automatisch unter genau diesem Pfad aus - keine weitere Konfiguration nötig.

## Die zwei Platzhalter, die ausgefüllt werden müssen

### 1. `PLATZHALTER_PAKETNAME_HIER_EINTRAGEN`
Das ist der Android-Paketname deiner App, z.B. `com.duckflux.zeitreiseagentur`.
Du wählst diesen Namen selbst, wenn du die App über PWABuilder oder Bubblewrap erstellst -
er lässt sich später nicht mehr ändern, ohne die App als komplett neue App neu zu veröffentlichen.

### 2. `PLATZHALTER_SHA256_FINGERABDRUCK_HIER_EINTRAGEN`
Das ist der SHA-256-Fingerabdruck deines Signierungsschlüssels (Keystore). Diesen bekommst du,
NACHDEM du die App gebaut hast, z.B. über:

```
keytool -list -v -keystore deine-keystore-datei.jks -alias dein-alias
```

Der Fingerabdruck steht dort in der Zeile "SHA256:" - inklusive der Doppelpunkte zwischen den
Hex-Ziffern-Paaren, genau so in die Datei eintragen.

**Falls du PWABuilder.com nutzt:** Das Tool kann diesen Fingerabdruck für dich anzeigen bzw. den
Signierungsschlüssel für dich verwalten - dann bekommst du den korrekten Wert direkt von dort.

## Nach dem Ausfüllen

1. Beide Platzhalter durch die echten Werte ersetzen (Anführungszeichen erhalten, nur den Text
   dazwischen ersetzen).
2. Datei zusammen mit dem Rest der Seite hochladen/veröffentlichen.
3. Prüfen, ob sie korrekt erreichbar ist: einfach die volle URL im Browser aufrufen, es sollte
   der JSON-Inhalt angezeigt werden (kein 404).
4. Google bietet außerdem ein Online-Prüfwerkzeug namens "Statement List Generator and Tester"
   an, mit dem sich die Datei vor der Veröffentlichung der App testen lässt.
