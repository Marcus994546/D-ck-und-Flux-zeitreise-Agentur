# Umstieg auf "Blaze" und Budget-Warnsystem einrichten

## Was sich beim Umstieg tatsächlich ändert

"Blaze" ist Pay-as-you-go, aber die kostenlosen Kontingente bleiben identisch zum Spark-Tarif
(dieselben 50.000 Lesevorgänge/Tag usw.). Der einzige Unterschied: Statt dass die App bei
Erreichen des Tageslimits einfach nicht mehr funktioniert, zahlst du für alles, was darüber
hinausgeht, nach tatsächlichem Verbrauch. Für die allermeisten kleinen bis mittelgroßen Spiele
bleibt das faktisch bei 0€ Kosten, solange sich niemand krass daneben benimmt oder die Nutzerzahl
extrem wächst.

## Schritt-für-Schritt: Umstieg

1. Firebase-Konsole - dein Projekt öffnen
2. Unten links auf den aktuellen Tarif-Namen klicken ("Spark-Plan")
3. "Plan ändern" - "Blaze" auswählen
4. Eine Kreditkarte hinterlegen (wird nur bei tatsächlichem Verbrauch über die kostenlosen
   Kontingente hinaus belastet)

## Schritt-für-Schritt: Budget-Warnsystem (unbedingt direkt danach einrichten)

1. In der Google Cloud Console (nicht Firebase-Konsole - dasselbe Projekt, andere Oberfläche):
   "Abrechnung" - "Budgets & Warnungen"
2. "Budget erstellen"
3. Einen Betrag festlegen, der zu deinem Komfort-Niveau passt - z. B. 20 Euro pro Monat
4. Mehrere Warnschwellen einrichten, z. B. bei 50%, 90% und 100% des Budgets
5. E-Mail-Benachrichtigung an deine eigene Adresse aktivieren

Wichtig: Diese Budget-Warnung stoppt die App nicht automatisch bei Erreichen des Limits - sie
benachrichtigt dich nur. Für ein hartes Ausgaben-Limit, das den Dienst tatsächlich pausiert,
müsste eine zusätzliche Cloud Function eingerichtet werden, die bei Überschreitung automatisch
Ressourcen deaktiviert - für den Start reicht die E-Mail-Warnung als Frühwarnsystem völlig aus,
damit du rechtzeitig reagieren kannst, bevor irgendetwas Überraschendes passiert.

## Kurz zusammengefasst
Der Umstieg selbst ist in wenigen Minuten erledigt und kostet erstmal nichts - die Budget-Warnung
danach ist der eigentlich wichtige Schritt, damit du niemals von einer Rechnung überrascht wirst.
