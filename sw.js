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

// ============================================================
// PUSH-BENACHRICHTIGUNGEN (Firebase Cloud Messaging) IM HINTERGRUND
// ============================================================
// Zeigt eingehende Nachrichten an, wenn das Spiel gerade NICHT geöffnet ist (das ist der
// eigentliche Sinn von Push-Benachrichtigungen). Läuft im selben, ohnehin schon registrierten
// Service Worker mit - kein zweiter, separater Service Worker nötig. "importScripts" statt ES-
// Modul-Import, da Firebase Cloud Messaging für Service Worker bislang nur die
// "compat"-Variante der SDKs anbietet.
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBPnK30ra0r8pDMOhgRsiY6jSWCbJlt2t4",
    authDomain: "zeitreise-agentur.firebaseapp.com",
    projectId: "zeitreise-agentur",
    storageBucket: "zeitreise-agentur.firebasestorage.app",
    messagingSenderId: "516125325960",
    appId: "1:516125325960:web:936883a5474820b10bfd3d"
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
    const titel = (payload.notification && payload.notification.title) || "Zeitreise-Agentur";
    const optionen = {
        body: (payload.notification && payload.notification.body) || "",
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png"
    };
    self.registration.showNotification(titel, optionen);
});

// Klick auf die Benachrichtigung öffnet das Spiel (bzw. holt ein bereits offenes Fenster nach
// vorne, statt ein weiteres zu öffnen).
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow('./index.html');
        })
    );
});
