// ============================================================
// ZURÜCK-NAVIGATION (Android Back-Taste/-Geste)
// ============================================================
// In einer normalen Browser-Tab-Umgebung fällt eine fehlende Navigationshistorie kaum auf - in
// einer als Android-App verpackten TWA würde die Hardware-/Geste-Zurück-Taste aber sofort die
// GESAMTE App schließen, statt nur die gerade offene Ansicht (Popup, Raum, Menü) zu verlassen,
// da die Seite dafür normalerweise auf echte URL-Wechsel angewiesen wäre.
//
// Diese Datei macht KEINE echten URL-Wechsel nötig: sie registriert einen künstlichen
// History-Eintrag, sobald eine bekannte "öffnen"-Funktion aufgerufen wird, und fängt die
// Zurück-Taste über das popstate-Event ab, um stattdessen die passende "schließen"-Funktion
// aufzurufen. Erst wenn kein offenes Popup/keine offene Ansicht mehr bekannt ist, führt ein
// weiterer Zurück-Druck tatsächlich zum Verlassen der Seite/App - genau das erwartete Verhalten.
//
// Verwendung: window.registerBackable('nameDerOeffnenFunktion', 'nameDerSchliessenFunktion');
// für jedes Paar, das rückgängig machbar sein soll. Muss NACH der Definition beider Funktionen
// aufgerufen werden.
(function() {
    window._backStack = [];
    let programmatischesSchliessen = false;

    window.registerBackable = function(openFnName, closeFnName) {
        const originalOpen = window[openFnName];
        if (typeof originalOpen !== 'function') {
            console.warn('[Zurück-Navigation] Öffnen-Funktion nicht gefunden, übersprungen:', openFnName);
            return;
        }
        window[openFnName] = function(...args) {
            const result = originalOpen.apply(this, args);
            window._backStack.push(closeFnName);
            history.pushState({ zurueckTiefe: window._backStack.length }, '', location.href);
            return result;
        };

        const originalClose = window[closeFnName];
        if (typeof originalClose !== 'function') {
            console.warn('[Zurück-Navigation] Schließen-Funktion nicht gefunden, übersprungen:', closeFnName);
            return;
        }
        window[closeFnName] = function(...args) {
            const result = originalClose.apply(this, args);
            // Nur konsolidieren, wenn GENAU dieses Popup gerade oben auf dem Stack liegt (heißt:
            // es wurde über einen normalen Schließen-Button in der Oberfläche beendet, nicht
            // durch die Zurück-Taste) - sonst käme es zu doppelten/vertauschten History-Einträgen.
            if (window._backStack.length > 0 && window._backStack[window._backStack.length - 1] === closeFnName) {
                window._backStack.pop();
                programmatischesSchliessen = true;
                history.back();
            }
            return result;
        };
    };

    window.addEventListener('popstate', function() {
        if (programmatischesSchliessen) { programmatischesSchliessen = false; return; }
        if (window._backStack.length > 0) {
            const closeFnName = window._backStack.pop();
            const closeFn = window[closeFnName];
            if (typeof closeFn === 'function') {
                try { closeFn(); } catch (e) { console.error('[Zurück-Navigation] Fehler beim Schließen von ' + closeFnName + ':', e); }
            }
        }
        // Stack leer -> bewusst NICHTS erneut pushen. Ein weiterer Zurück-Druck verlässt dann
        // tatsächlich die Seite/App, wie es der Spieler erwarten würde.
    });

    // Öffentliche Schnittstelle für Stellen, die den Zurück-Stack von Hand bedienen müssen (z.B.
    // wenn eine Funktion mehrere Early-Returns hat und der generische registerBackable-Wrapper
    // deshalb nicht passt - siehe window.closeChatNzUeberZurueck in netzwerk-app.js). Lässt
    // solche externen Stellen korrekt mit diesem geteilten popstate-Listener koordinieren, statt
    // sich einen eigenen, unabhängigen (und damit wirkungslosen) Merker zu bauen.
    window._unterdrueckeNaechstesPopstate = function() {
        programmatischesSchliessen = true;
    };
})();
