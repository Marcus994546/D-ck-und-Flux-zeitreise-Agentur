// ============================================================
// PROTOKOLL: echtes, seitenübergreifendes Ereignis-Log (ersetzt die vorherigen ausgedachten
// Platzhalter-Meldungen im Hauptterminal wie "Agent B. Flux: Rückkehr aus Sektor B-4
// erfolgreich"). Wird von index.html, base.html UND netzwerk.html geladen - jede Seite kann
// per window.logEreignis(text) einen Eintrag schreiben, der auf ALLEN Seiten im Protokoll
// erscheint, da alles zentral in Firestore liegt (Collection "protokolle/{agentId}/eintraege").
// ============================================================

(function() {
    // Wartet, bis die jeweilige Seite ihr eigenes Firebase-Auth-Gate durchlaufen und
    // window.agentName gesetzt hat - läuft auf allen drei Seiten unterschiedlich lang, daher
    // hier bewusst per Polling statt eines einzelnen, seitenspezifischen Promise.
    function wartenAufAgentName() {
        return new Promise((resolve) => {
            (function check() {
                if (window.agentName && window.db) resolve();
                else setTimeout(check, 200);
            })();
        });
    }

    window.logEreignis = async function(text) {
        try {
            await wartenAufAgentName();
            const mySlug = window.agentSlug(window.agentName);
            await window.addDoc(window.collection(window.db, "protokolle", mySlug, "eintraege"), {
                text: String(text).slice(0, 200),
                ts: window.serverTimestamp()
            });
        } catch (e) { console.error("Protokoll-Eintrag fehlgeschlagen:", e); }
    };

    // --- Live-Anzeige im Hauptterminal (#log-display) ---
    // Nur relevant auf index.html, aber unschädlich auf den anderen Seiten (findet dort einfach
    // kein #log-display und tut nichts).
    let protokollListener = null;
    window.starteProtokollAnzeige = async function() {
        await wartenAufAgentName();
        const mySlug = window.agentSlug(window.agentName);
        if (protokollListener) protokollListener();
        const q = window.query(
            window.collection(window.db, "protokolle", mySlug, "eintraege"),
            window.orderBy("ts", "desc"),
            window.limit(8)
        );
        protokollListener = window.onSnapshot(q, (snapshot) => {
            const logContainer = document.getElementById('log-display');
            if (!logContainer) return;
            if (snapshot.empty) {
                logContainer.innerHTML = '<div class="log-entry" style="opacity:0.5;">Noch keine Protokoll-Einträge vorhanden.</div>';
                return;
            }
            logContainer.innerHTML = snapshot.docs.map(d => {
                const data = d.data();
                return `<div class="log-entry">&gt; ${window.escHtml ? window.escHtml(data.text) : data.text}</div>`;
            }).join('');
        }, (error) => console.error("Protokoll-Anzeige Fehler:", error));
    };
})();
