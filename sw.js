// ============================================================
// MINIMALER SERVICE WORKER
// ============================================================
// Erfüllt bewusst NUR die technische Mindestanforderung, damit die Seite als "installierbare"
// PWA erkannt wird (Voraussetzung für die spätere Android-TWA-Verpackung über PWABuilder/
// Bubblewrap). Es wird ABSICHTLICH NICHTS zwischengespeichert:
//
// Das Spiel wird über direkte Versionsnummern in den Script-/Link-Tags (?v=...) und live über
// Firestore aktualisiert - jede Änderung soll sofort bei allen Spielern ankommen. Ein
// Service Worker mit echtem Offline-Cache würde genau das verhindern (Spieler bekämen nach
// einem Update unter Umständen eine alte, zwischengespeicherte Version, bis der Cache irgendwann
// abläuft). Sollte später eine echte Offline-Funktion gewünscht sein, kann hier gezielt eine
// Cache-Strategie ergänzt werden - bis dahin bleibt es bewusst bei "immer frisch aus dem Netz".

self.addEventListener('install', (event) => {
    // Sofort aktiv werden, nicht auf das Schließen aller offenen Tabs warten.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Sofort die Kontrolle über bereits offene Seiten übernehmen.
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Bewusst kein caches.match()/caches.put() - jede Anfrage geht immer direkt ans Netz.
    // Der Handler existiert nur, damit Browser/Play-Store-Prüfungen die Seite als "kontrolliert
    // durch einen Service Worker" und damit als vollwertige PWA erkennen.
    event.respondWith(fetch(event.request));
});
