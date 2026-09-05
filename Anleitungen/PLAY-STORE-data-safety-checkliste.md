# Checkliste: "Data Safety"-Formular in der Play Console

Diese Checkliste gibt dir für jede Frage, die Google im Formular stellt, die faktisch korrekte
Antwort – basierend auf dem, was im Code tatsächlich passiert. Googles Formular-Oberfläche ändert
sich gelegentlich leicht in der Reihenfolge/Formulierung, der **Inhalt** bleibt aber gültig.

---

## Schritt 1: "Sammelt oder teilt deine App Nutzerdaten?"
**Antwort: Ja**

---

## Schritt 2: Welche Datentypen werden erfasst?

Hake in Googles Liste genau diese Kategorien an:

| Google-Kategorie | Zutreffend? | Konkret |
|---|---|---|
| **Standort → Präziser Standort** | ✅ Ja | GPS-Koordinaten während aktiver Missionen |
| **Standort → Ungefährer Standort** | Nicht zusätzlich nötig (präzise deckt das ab) | – |
| **Persönliche Daten → Name** | ✅ Ja | Frei gewählter Agentenname |
| **Persönliche Daten → E-Mail-Adresse** | ⚠️ Technisch ja, aber besonders | Es wird KEINE echte private E-Mail des Nutzers abgefragt – die "E-Mail" ist eine intern aus dem Agentennamen generierte technische Kennung für die Anmeldung. Trotzdem als "E-Mail-Adresse" ankreuzen, damit die Angabe vollständig ist. |
| **Nachrichten → Sonstige In-App-Nachrichten** | ✅ Ja | Komm-Link-Chat zwischen Spielern |
| **App-Aktivitäten → App-Interaktionen** | ✅ Ja | Spielfortschritt, Missionsverlauf |
| **Geräte-/andere IDs** | ✅ Ja | Über Firebase Authentication vergebene Nutzer-ID |
| **Finanzdaten** | ❌ Nein | Keine echten Zahlungsdaten – Credits/Materiezellen sind rein virtuelle Spielwährung |
| **Fotos/Videos** | ❌ Nein | Kamera wird nur lokal für die AR-Funktion genutzt, es wird nichts hochgeladen |
| **Kalender/Kontakte** | ❌ Nein | – |
| **Gesundheitsdaten** | ❌ Nein | – |

---

## Schritt 3: Für jeden angekreuzten Datentyp – die drei Folgefragen

Google fragt danach für **jede** oben angekreuzte Zeile einzeln:

**a) "Wird dieser Datentyp gesammelt?"** → Ja, für alle oben markierten.

**b) "Wird dieser Datentyp weitergegeben (an Dritte außerhalb der App)?"**
→ **Nein** für alle – mit einer Ausnahme: Firebase/Google selbst gilt technisch als
Auftragsverarbeiter, das zählt in Googles eigenem Formular aber **nicht** als "Weitergabe an
Dritte" im Sinne dieser Frage (Google verarbeitet die Daten ja bereits selbst als
Infrastrukturanbieter). Falls das Formular explizit nach "Dienstleistern" fragt, dort Firebase
angeben.

**c) "Ist die Erfassung optional oder verpflichtend?"**
- Name/E-Mail-Kennung: **Verpflichtend** (ohne kein Zugang zum Spiel)
- Präziser Standort: **Optional** (das Spiel startet auch ohne – nur GPS-Missionen funktionieren
  dann nicht, das Berechtigungssystem des Betriebssystems fragt das ohnehin separat ab)
- Chat-Nachrichten: **Optional** (Komm-Link ist eine Zusatzfunktion, kein Pflichtbestandteil)

**d) "Zweck der Datenerfassung"** (Mehrfachauswahl möglich)
- Name/E-Mail-Kennung → **"Konto-Verwaltung"**, **"App-Funktionalität"**
- Standort → **"App-Funktionalität"**
- Chat-Nachrichten → **"App-Funktionalität"**
- App-Interaktionen → **"App-Funktionalität"**, optional zusätzlich **"Analyse"**, falls du das
  später mit einem echten Analyse-Tool ergänzt (aktuell nicht der Fall)

---

## Schritt 4: Sicherheitspraktiken

- **"Werden Daten während der Übertragung verschlüsselt?"** → **Ja** (Firebase nutzt durchgehend
  HTTPS/TLS)
- **"Können Nutzer die Löschung ihrer Daten beantragen?"** → **Ja** – direkt im Spiel über
  Einstellungen → "Profil endgültig terminieren", zusätzlich per E-Mail-Kontakt möglich

---

## Kurz zum Mitnehmen
Die ehrliche, korrekte Grundhaltung fürs ganze Formular: **"Ja, wir sammeln Standort- und
Kontodaten sowie Chat-Nachrichten, ausschließlich zur App-Funktionalität, nichts wird an externe
Dritte verkauft oder weitergegeben, Löschung ist jederzeit selbst möglich."**
