# Signierungsschlüssel: Erzeugen und sicher aufbewahren

## Warum das der wichtigste technische Schritt in diesem ganzen Prozess ist

Jede Android-App wird mit einem privaten Schlüssel signiert. Google erkennt darüber, dass ein
Update tatsächlich vom selben Entwickler stammt wie die ursprüngliche App. **Verlierst du diesen
Schlüssel, kannst du dieselbe App (unter demselben Paketnamen) nie wieder aktualisieren** – die
einzige Möglichkeit wäre, die App komplett neu unter einem anderen Namen zu veröffentlichen, alle
bisherigen Bewertungen und Installationen gehen dabei verloren. Das ist mit Abstand der Punkt in
diesem ganzen Ablauf, bei dem ein Fehler nicht mehr reparierbar ist.

## Schritt 1: App über PWABuilder erzeugen

1. Gehe zu **pwabuilder.com**
2. Gib die URL deiner Website ein (die mit dem fertigen Manifest aus Punkt 2)
3. PWABuilder scannt die Seite automatisch und zeigt an, ob Manifest/Service Worker korrekt
   erkannt werden – an dieser Stelle siehst du direkt, ob unsere PWA-Grundlagen aus Punkt 1/2
   korrekt funktionieren
4. Wähle "Android-Paket erstellen"
5. Trage den **Paketnamen** ein (z. B. `com.duckflux.zeitreiseagentur`) – **diesen Namen später
   nicht mehr ändern**, er ist die dauerhafte Kennung deiner App

## Schritt 2: Signierungsschlüssel erzeugen

PWABuilder bietet zwei Wege an:

**Option A – PWABuilder verwaltet den Schlüssel für dich (empfohlen für den Einstieg)**
Einfacher, aber du bist darauf angewiesen, dass der Dienst verfügbar bleibt. PWABuilder zeigt dir
nach der Erstellung eine Datei zum Herunterladen an – diese sofort sichern (siehe Schritt 3).

**Option B – Eigenen Schlüssel selbst erzeugen (mehr Kontrolle)**
Über das Kommandozeilen-Tool `keytool` (Teil jeder Java-Installation):
```
keytool -genkey -v -keystore zeitreise-agentur.jks -keyalg RSA -keysize 2048 -validity 10000 -alias zeitreise-key
```
Das Tool fragt dich nach einem Passwort für die Datei und ein paar Angaben zu dir – die Antworten
sind für die Funktion der App nicht entscheidend, das Passwort dagegen unbedingt sicher merken.

## Schritt 3: Sicher aufbewahren – die wichtigste Regel überhaupt

- Speichere die Schlüssel-Datei (`.jks` bzw. `.keystore`) an mindestens zwei unabhängigen Orten –
  z. B. einmal auf deinem Rechner, einmal in einem Cloud-Speicher (Google Drive, Dropbox), den
  nur du kontrollierst
- Notiere dir das zugehörige Passwort getrennt von der Datei selbst (z. B. in einem
  Passwort-Manager), niemals im selben Ordner wie die Schlüssel-Datei
- Niemals die Schlüssel-Datei in ein öffentliches GitHub-Repository hochladen – falls dein
  Projekt-Repo öffentlich ist, muss die Datei zwingend außerhalb davon aufbewahrt werden

## Schritt 4: Fingerabdruck auslesen (für assetlinks.json)

Sobald der Schlüssel existiert, brauchst du seinen SHA-256-Fingerabdruck für die
assetlinks.json-Datei aus Punkt 1/2:
```
keytool -list -v -keystore zeitreise-agentur.jks -alias zeitreise-key
```
In der Ausgabe nach der Zeile "SHA256:" suchen und den kompletten Wert (inklusive Doppelpunkte)
in die assetlinks.json eintragen – die genaue Stelle steht in der beigelegten
README-assetlinks.md aus Punkt 1/2.

## Kurz zusammengefasst
Erzeugen ist der einfache Teil. Der entscheidende Teil ist, die Datei und das Passwort ab sofort
wie einen Haustürschlüssel zu behandeln, den du nie wieder ersetzen kannst, falls er verloren
geht.
