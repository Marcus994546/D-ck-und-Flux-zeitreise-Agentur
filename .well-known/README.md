# Dück & Flux Zeitreiseagentur – Sicherheits-Update

## ⚠️ Wichtig: Einmalige Einrichtung erforderlich

Der neue Code funktioniert erst vollständig, wenn du zwei Dinge einmalig in der
**Firebase-Konsole** (console.firebase.google.com → Projekt "zeitreise-agentur") erledigst:

### 1. Firestore Security Rules veröffentlichen
`Firestore Database → Regeln` → Inhalt von `firestore.rules` einfügen → Veröffentlichen.
**Ohne diesen Schritt ist der Client-Code kein echter Schutz** – jeder könnte weiterhin direkt
über das Firestore-SDK/die REST-API lesen/schreiben, egal was im JS-Code steht.

### 2. E-Mail/Passwort-Anmeldung aktivieren
`Authentication → Sign-in method → E-Mail/Passwort` → aktivieren (falls noch nicht geschehen).

### 3. Deinen eigenen Admin-Zugang setzen
Der hartcodierte Name `admin_dück_994645` wurde komplett aus dem Code entfernt. Admin-Rechte
werden jetzt ausschließlich über ein Feld `isAdmin: true` im Firestore-Dokument
`agenten/<dein-agentenname-kleingeschrieben>` vergeben – und dieses Feld kann laut den
Security Rules **nur manuell über die Firebase-Konsole** gesetzt werden, nie über die App selbst.

Vorgehen:
1. Melde dich einmal ganz normal mit deinem gewünschten Admin-Namen über "NEUE REKRUTIERUNG" an.
2. Gehe in der Firebase-Konsole zu `Firestore Database → agenten → <dein-name>`.
3. Füge das Feld `isAdmin` (Typ: boolean) mit Wert `true` hinzu.
4. Beim nächsten Login siehst du "[ ADMINISTRATOR EINGELOGGT ]" und der Cheat-Button in
   `base.html` wird sichtbar.

## Was wurde behoben

| Problem | Lösung |
|---|---|
| Passwörter nur base64-kodiert in Firestore gespeichert (trivial reversibel) | Echtes Firebase Authentication (E-Mail/Passwort), altes Feld wird beim ersten Login automatisch entfernt |
| Login-Status wurde nur über manipulierbares `localStorage` geprüft (jeder konnte sich per DevTools als Admin ausgeben – **ohne jedes Passwort**) | Session-Status kommt jetzt ausschließlich von `onAuthStateChanged` (echte, serverseitig verifizierte Firebase-Session) |
| Admin-Name hartcodiert im Frontend lesbar | Entfernt. Admin-Status kommt aus einem Firestore-Feld, das Clients laut Security Rules nie selbst setzen können |
| Cheat-Button in `base.html` für alle sichtbar | Nur noch sichtbar/funktionsfähig, wenn `isAdmin` true ist (zusätzlich serverseitig über die Rules abgesichert) |
| Stored-XSS im Chat (`innerHTML` mit Nutzereingaben) | Ersetzt durch sichere DOM-Erzeugung mit `textContent` |
| "Level = höchster irgendwo gefundener Wert" (auch aus editierbarem `localStorage`) | `localStorage` wird nicht mehr zur Bestimmung des Levels herangezogen – nur noch Firestore |
| Bilder von fremder Domain gehotlinkt | Zeigen jetzt auf dein GitHub-Repo. Audio (`catbox.moe`) unverändert, wie gewünscht |
| Fragiler `:not()`-CSS-Hack | Ersetzt durch stabile `.top-level`-Klasse |
| Monolithische Dateien | Aufgeteilt in HTML / CSS / JS (siehe Dateiliste unten) |
| Toter, fehlerhafter Alt-Code (`finishStartupSetup`, verwies auf nicht existierendes Element und enthielt einen zweiten, passwortlosen Admin-Bypass) | Entfernt |

## Bekannte Grenzen (ehrlich gesagt)

**Es gibt kein Cloud-Functions-Backend in diesem Projekt** (das würde einen kostenpflichtigen
Firebase-"Blaze"-Tarif voraussetzen). Das bedeutet:

- Die Security Rules verhindern die offensichtlichsten Cheats (z. B. `xp` per Konsole auf
  999999 setzen, `isAdmin` selbst setzen), sind aber **kein 100%iger Schutz** gegen sehr
  hartnäckige Manipulation der Wirtschafts-Werte (Credits/Materie-Zellen in `base.html`).
- Für lückenlosen Schutz müsste jede XP/Credit-Vergabe serverseitig durch eine Cloud Function
  validiert werden ("wurde diese Mission wirklich abgeschlossen?"). Das kann ich als nächsten
  Schritt umsetzen, falls du einen Blaze-Tarif einrichten möchtest.

## Dateien in diesem Paket

```
index.html               Haupt-Terminal (HTML-Struktur)
style.css                Zugehöriges Stylesheet
firebase-init.js         Firebase-Setup + Authentifizierung (ES-Modul)
app.js                   Restliche Spiellogik

base.html                Agentur-Basis (HTML-Struktur)
base-style.css           Zugehöriges Stylesheet
base-firebase-init.js    Firebase-Setup + Auth-Guard (ES-Modul)
base-app.js              Restliche Basis-Logik

firestore.rules          Security Rules zum Einfügen in die Firebase-Konsole
```

Einfach den kompletten Ordner in dein GitHub-Repo hochladen (Dateinamen unverändert lassen,
da `index.html`/`base.html` per `<script src="...">` auf die anderen Dateien verweisen).
