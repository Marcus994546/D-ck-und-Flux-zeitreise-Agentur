# Dück & Flux Zeitreise-Agentur

![Weltraum-Banner](Audio%20%26%20Bild/Milchstra%C3%9Fe.jpeg)

**Ein browserbasiertes Terminal-Game, das echte Standorte in deiner Umgebung in Missionsziele verwandelt.**

▶️ **[Jetzt spielen](https://marcus994546.github.io/D-ck-und-Flux-zeitreise-Agentur/index.html)** – läuft direkt im Browser, keine Installation nötig (lässt sich aber auch als App installieren, siehe unten).

---

## Worum geht's?

Die Zeitlinie ist instabil. Als Agent der Zeitreise-Agentur Dück & Flux erhältst du Missionen, die dich per GPS zu **realen Orten in deiner Nähe** führen. Vor Ort angekommen, fängst du per Kamera eine sich manifestierende Anomalie ein und stabilisierst so Stück für Stück die Zeitlinie – während du gleichzeitig deine unterirdische Basis ausbaust und ein Netzwerk aus Agenten und Verbündeten aufbaust.

Das Terminal ist bewusst im Stil eines alten Text-Interfaces gehalten: Befehle eintippen, Statusmeldungen lesen, sich in die Rolle eines Agenten hineinversetzen.

## Features

- 📍 **GPS-Missionen** – echte Standorte in der Umgebung als Missionsziele, Navigation per Kompass
- 📷 **Kamera-Anomalien** – am Zielort wird die Anomalie live per Gerätekamera eingefangen (Verarbeitung ausschließlich lokal auf dem Gerät)
- 🌀 **Flux-Kopplung** – ab Level 5, eigenes Mini-Modul für zusätzliche XP-Boni
- 🏚️ **Agentur-Basis** – unterirdische Anlage im Aufzug-Querschnitt, Räume mit Credits & Materiezellen ausbauen
- 🤖 **Agenten-System** – eigene Agenten losschicken, die auch offline selbstständig weiterarbeiten
- 💬 **Komm-Link & Netzwerk** – Echtzeit-Chat, Mentoren-Programm, Rangliste, Dual-Missionen mit anderen Spielern
- ⚠️ **Tägliche Anomalie** – täglich wechselnde Sonder-Mission
- 📱 **Als App installierbar** (PWA) – "Zum Startbildschirm hinzufügen" reicht, kein App-Store-Download nötig
- 🔔 Push-Benachrichtigungen für wichtige Ereignisse

## Technik

Reines Frontend (HTML/CSS/Vanilla JS) mit [Firebase](https://firebase.google.com/) als Backend:

- **Firestore** für Spielstände, Netzwerk-Daten und Echtzeit-Chat
- **Cloud Functions** für serverseitig verifizierte Missionsbelohnungen und Admin-Aktionen
- **Firebase Auth** für Agenten-Accounts
- **Cloud Messaging (FCM)** für Push-Benachrichtigungen
- **Service Worker** für Offline-Fähigkeit und Installierbarkeit als PWA

Aktuell in Vorbereitung für den Google Play Store (als [TWA](https://developer.chrome.com/docs/android/trusted-web-activity)).

## Datenschutz

Da das Spiel mit Standortdaten und Kamerazugriff arbeitet, gibt es eine ausführliche [Datenschutzerklärung](datenschutz.html), die genau auflistet, welche Daten wofür verarbeitet werden.

## Kontakt

📧 dueck.flux.zentrale@outlook.com
📷 Instagram: [@dueck.flux.zeitreiseagentur](https://instagram.com/dueck.flux.zeitreiseagentur)
