# Bauplan: In-Game-Shop mit echtem Geld (Google Play Billing)

Dieses Dokument ist ein vollständiger Bauplan für später. Einfach an Claude schicken mit "bau mir
das nach diesem Plan", wenn es soweit ist.

**Grundsatzentscheidung (bereits getroffen):** Google Play Billing, keine eigene
Zahlungsanbindung. Google behält 15-30% Provision, dafür übernimmt Google die komplette
Zahlungsabwicklung, Rechnungsstellung, Betrugsprävention und internationale Steuerthemen (MOSS/OSS)
automatisch - für ein Einzelprojekt ohne eigenes Buchhaltungsteam der mit Abstand unkomplizierteste
Weg.

---

## 1. Was vor dem eigentlichen Bauen zu klären ist

- [ ] **Impressum** ergänzen (bei echtem Geldfluss sehr wahrscheinlich verpflichtend) - eigene
      Seite nach demselben Muster wie `datenschutz.html`
- [ ] **Datenschutzerklärung** um einen Abschnitt zu Zahlungsdaten/Google Play Billing ergänzen
- [ ] **Widerrufsrecht-Hinweis** für digitale Inhalte formulieren (EU-Verbraucherrecht,
      Ausnahmen für digitale Inhalte müssen korrekt vor Kaufabschluss angezeigt werden)
- [ ] Play-Console-Konto muss für Zahlungen freigeschaltet sein (separate Einrichtung von einem
      Zahlungsprofil in der Konsole, unabhängig von der App-Veröffentlichung selbst)
- [ ] Steuerliche Fragen (Kleinunternehmerregelung, Gewerbeanmeldung falls nötig) idealerweise
      vorher einmal mit Steuerberatung klären

## 2. Technische Grundlage: Google Play Billing Library

Play Billing ist eine **native Android-Bibliothek** - sie funktioniert nicht direkt in einer
reinen Web-App/TWA ohne Weiteres. Für die Integration gibt es zwei praktikable Wege:

**Weg A - Digital Goods API (empfohlen für TWA):**
Google bietet für genau den TWA-Anwendungsfall (Web-App verpackt als Android-App) eine
JavaScript-Schnittstelle namens "Digital Goods API", die Play Billing aus dem Web heraus
ansteuerbar macht, ohne die App nativ umschreiben zu müssen. Das passt am besten zu diesem
Projekt, da die komplette App weiterhin reines HTML/JS bleiben kann.

**Weg B - Trusted Web Activity mit natives Billing-Bridge:**
Aufwendiger, nur nötig falls die Digital Goods API in der Praxis Einschränkungen zeigt, die wir
zum Bauzeitpunkt neu bewerten müssten.

→ **Startpunkt beim Bauen:** Erst prüfen, ob die Digital Goods API zum Bauzeitpunkt noch aktuell
und ausreichend ist (Google entwickelt das weiter, Stand kann sich ändern).

## 3. Der kritische Baustein: Serverseitige Kaufbestätigung

**Das ist der wichtigste technische Punkt im ganzen Plan.** Ohne serverseitige Prüfung könnte
jeder über die Browser-Konsole behaupten "ich habe bezahlt" und sich Credits gutschreiben.

Das Projekt hat aktuell **keine Cloud Functions**, nur Firestore-Sicherheitsregeln - und
Firestore-Regeln allein können keine Zahlung bei Google verifizieren (das braucht einen
echten Server-Aufruf an Googles Play Developer API mit einem geheimen Schlüssel, der niemals im
Client landen darf).

**Das heißt: Für einen echten Shop müssen wir an diesem Punkt erstmals Cloud Functions einführen.**
Ablauf beim Bauen:
1. Spieler schließt Kauf über die Digital Goods API ab → bekommt ein Kauf-Token von Google
2. Client schickt dieses Token an eine neue Cloud Function (nicht direkt an Firestore)
3. Die Cloud Function prüft das Token bei Googles Play Developer API (serverseitig, mit
   Service-Account-Zugangsdaten)
4. Erst wenn Google die Zahlung bestätigt, schreibt die Cloud Function die Gutschrift in
   Firestore - der Client selbst darf diese Gutschrift niemals direkt schreiben dürfen
5. Die Cloud Function bestätigt (acknowledged) den Kauf bei Google, sonst wird er nach ein paar
   Tagen automatisch zurückerstattet

## 4. Produktkatalog-Vorschlag

Ausgehend vom bestehenden Spiel-Ökonomie-Modell, zur Diskussion beim Bauen:

| Produkt | Vorschlag | Kommentar |
|---|---|---|
| Credits-Pakete | z.B. 500 / 2.500 / 12.000 Credits | Gestaffelte Pakete, größere Pakete relativ günstiger (üblich, motiviert größere Käufe) |
| Materiezellen-Pakete | Kleinere Mengen als Credits | Seltener/wertvoller in der bestehenden Ökonomie |
| Chronos-Zellen | Kleine Mengen | Aktuell die "Premium"-Ressource im Spiel (u.a. Holoprojektor-Nachrichten) |
| Zeitersparnis | "Agent sofort fertig" o.ä. | Klassisches, bei Free-to-Play übliches Pay-to-Skip |
| Kosmetik | Exklusive Möbelstück-Skins | Kein Balance-Eingriff, nur optisch - geringeres "Pay to Win"-Gefühl |
| **Premium-Zeit** | **6 Std. / 12 Std. / 1 Tag / 1 Woche** | **Siehe eigener Abschnitt 4a unten - nach dem Vorbild von Supremacy 1914** |

### 4a. Premium-Zeit (zeitlich begrenzter Boost) - detailliert

Nach dem Vorbild von Supremacy 1914: befristete Pakete (6 Std. / 12 Std. / 1 Tag / 1 Woche), die
für die gebuchte Dauer zwei Effekte gleichzeitig aktivieren:

- **Agenten arbeiten 70% schneller** (Aufgabendauer auf 30% der normalen Zeit reduziert)
- **+10% auf alle Credits-Einnahmen**
- **Eine zusätzliche Mission** - Konzept noch offen, wird bei Bedarf separat weiter ausgearbeitet,
  bevor das gebaut wird
- **Visuelles Upgrade für mehrere Bereiche des Spiels** - ebenfalls noch offen, welche Bereiche
  genau und wie das Upgrade konkret aussehen soll (z.B. Basis-Ansicht, Agenten-Darstellung,
  Terminal-Rahmen o.ä.), muss vor dem Bauen gemeinsam ausgearbeitet werden

**Technische Anknüpfungspunkte (schon jetzt im Code identifiziert, damit das Bauen später
schneller geht):**

- **Geschwindigkeit:** Es gibt bereits eine EINZIGE, zentrale Funktion, über die JEDE
  Agenten-Aufgabendauer im ganzen Spiel läuft: `agentScaledDurationMs()` in `base-app.js`. Dort
  existiert schon ein fast identisches Muster für den Admin-Testmodus (`adminTimeFactor()`, macht
  Aufgaben auf 5% der Zeit für Admin-Tests). Der Premium-Boost lässt sich nach demselben Prinzip
  als weiterer Faktor in dieselbe Formel einbauen (`* 0.3` bei aktivem Premium-Status) - EIN
  zentraler Änderungspunkt, kein Suchen an vielen Stellen.
- **Credits-Boost:** Anders als bei der Zeit gibt es hier KEINE einzelne zentrale Stelle - Credits
  werden an mehreren Stellen in `base-app.js` direkt gutgeschrieben (`gameState.credits += ...`,
  aktuell an vier verschiedenen Stellen für unterschiedliche Quellen: Raum-Produktion,
  Missionsbelohnung, Handelsangebote, Sammelsystem-Auszahlung). Für sauberen, wartbaren Code
  empfiehlt sich eine kleine Wrapper-Funktion (z.B. `gutschreibeCreditsMitBoost(betrag)`), die den
  Premium-Aufschlag zentral berechnet und an allen vier Stellen anstelle der direkten Addition
  aufgerufen wird - verhindert, dass der Bonus bei einer künftigen fünften Stelle vergessen wird.
- **Speicherung des Premium-Status:** Ein einzelnes Feld auf dem Spieler-Dokument, z.B.
  `premiumBis: <Zeitstempel>` - beim Kauf gesetzt (bzw. bei bereits aktivem Premium verlängert,
  nicht überschrieben), bei jeder relevanten Berechnung wird nur `Date.now() < premiumBis`
  geprüft. Kein eigener Cron-Job/Ablauf-Mechanismus nötig, der Status "verfällt" einfach von
  selbst durch den Zeitvergleich.

**Wichtige Design-Entscheidung für später:** Je mehr sich der Shop auf **Kosmetik und
Zeitersparnis** statt auf **direkte Stärke** (Credits en masse) konzentriert, desto weniger wird
er von Spielern als unfair empfunden - das ist keine technische, sondern eine
Balance-/Design-Frage, die separat entschieden werden sollte.

## 5. Admin-only-Sichtbarkeit (Aufbauphase)

- Neuer Menüpunkt "SHOP" im Terminal, Sichtbarkeit an `isAdminSession` gekoppelt (Variable
  existiert bereits im Code)
- Sobald fertig getestet: eine einzige Code-Zeile ändern (Bedingung von `isAdminSession` auf z.B.
  `true` oder eine neue Freischalt-Logik), Version hochzählen, fertig - genau wie gewünscht

## 6. Firestore-Struktur (Vorschlag)

Neue Collection `kaeufe/{kaufId}`:
- `slug`, `produktId`, `googleKaufToken`, `status` ('ausstehend'/'bestätigt'/'fehlgeschlagen'),
  `timestamp`
- Nur von der Cloud Function beschreibbar, vom Client nur lesbar (eigene Käufe)

## 7. Geschätzte Bauphasen (zum späteren Abarbeiten)

1. Cloud Functions Grundgerüst aufsetzen (bisher nicht vorhanden im Projekt)
2. Digital Goods API testintegration (Kauf-Dialog anzeigen, Token empfangen)
3. Cloud Function für Kaufverifizierung + Gutschrift
4. Shop-UI (Produktkatalog, Kauf-Buttons), admin-only sichtbar
5. Firestore-Regeln für die neue `kaeufe`-Collection
6. Rechtliche Seiten (Impressum, Widerrufsrecht) einbinden
7. Test-Käufe im Play-Console-Testmodus (Google bietet dafür Testkonten ohne echte Abbuchung)
8. Sichtbarkeit für alle freischalten

---

**Kurz zusammengefasst für den Start eines späteren Gesprächs:** "Baue mir den Shop nach dem
Plan, Google Play Billing, Digital Goods API, mit Cloud Functions für die Kaufverifizierung,
zunächst nur für mich als Admin sichtbar - inklusive Premium-Zeit-Paketen (6 Std./12 Std./1
Tag/1 Woche) mit 70% schnelleren Agenten und +10% Credits-Bonus." Zwei Punkte sind noch offen und
müssen vor dem Bauen erst gemeinsam ausgearbeitet werden: die zusätzliche Mission bei aktivem
Premium-Status, und das visuelle Upgrade für mehrere Spielbereiche während Premium-Zeit - einfach
kurz Bescheid geben, dann klären wir beide Konzepte, bevor programmiert wird.
