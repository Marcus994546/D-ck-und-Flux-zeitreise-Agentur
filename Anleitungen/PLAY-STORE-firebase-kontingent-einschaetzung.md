# Kontingent-Einschätzung: Kostenloser "Spark"-Tarif

## Die Grenzen, die realistisch zuerst eng werden

Firebase Firestore (Spark-Tarif) begrenzt vor allem drei Dinge pro Tag: **Lesevorgänge** (50.000),
**Schreibvorgänge** (20.000) und **Löschvorgänge** (20.000). Basierend auf dem tatsächlichen Code
sind das die Stellen, die am meisten davon verbrauchen:

### 1. Der 15-Sekunden-Tick in der Basis (größter Dauerverbraucher)
Jeder Spieler, der die Basis-Ansicht offen hat, löst alle 15 Sekunden einen Nachhol-Tick aus. Bei
z. B. 50 gleichzeitig aktiven Spielern macht das allein schon mehrere Tausend Lese-/Schreibzugriffe
pro Stunde – der mit Abstand größte, kontinuierliche Verbraucher im gesamten Spiel.

### 2. Die Rangliste und das Radar (jetzt entschärft)
Das waren vor der heutigen Überarbeitung die zwei mit Abstand teuersten Einzelvorgänge:
- Die Rangliste hat bei **jedem einzelnen Aufruf** die komplette Spieler- und Basis-Tabelle
  ungefiltert geladen
- Das Radar hatte einen **dauerhaften Live-Listener auf die komplette Spieler-Collection** – jede
  Änderung irgendeines Spielers hat bei jedem offenen Radar eine erneute Vollübertragung ausgelöst

**Das habe ich in diesem Durchgang bereits behoben:** Die Rangliste nutzt jetzt einen geteilten
Zwischenspeicher (Neuberechnung höchstens alle 5 Minuten), das Radar filtert serverseitig auf
kürzlich aktive Spieler vor, statt die gesamte Collection abzufragen. Beide Stellen sind dadurch
für ein wachsendes Spielerfeld erheblich robuster als vorher.

### 3. Live-Chat-Listener (Komm-Link)
Jeder offene Chat und jede offene Kanal-Übersicht ist ein Live-Listener. Bei wenigen gleichzeitig
chattenden Spielern unproblematisch, bei sehr vielen gleichzeitig aktiven Unterhaltungen ein
Verbraucher, den man im Blick behalten sollte – aktuell aber kein akuter Handlungsbedarf.

## Realistische Einschätzung

Mit einer kleinen bis mittleren Spielerzahl (bis zu einigen hundert aktiven Spielern täglich)
sollte das kostenlose Kontingent nach den heutigen Korrekturen ausreichend Puffer bieten. Bei
echtem, sprunghaftem Wachstum durch die Play-Store-Veröffentlichung ist ein Umstieg auf den
"Blaze"-Tarif trotzdem empfehlenswert – nicht weil sofort Kosten anfallen (die kostenlosen
Kontingente bleiben identisch), sondern damit die App bei einem unerwarteten Ansturm nicht einfach
stehen bleibt, wenn das Tageslimit erreicht ist.
