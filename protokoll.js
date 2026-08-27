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
    let protokollFallbackInterval = null;

    async function ladeProtokollEinmalig() {
        if (!window.db || !window.agentName) return;
        const mySlug = window.agentSlug(window.agentName);
        const logContainer = document.getElementById('log-display');
        if (!logContainer) return;
        try {
            const q = window.query(
                window.collection(window.db, "protokolle", mySlug, "eintraege"),
                window.orderBy("ts", "desc"),
                window.limit(8)
            );
            const snapshot = await window.getDocs(q);
            if (snapshot.empty) {
                logContainer.innerHTML = '<div class="log-entry" style="opacity:0.5;">Noch keine Protokoll-Einträge vorhanden.</div>';
                return;
            }
            logContainer.innerHTML = snapshot.docs.map(d => {
                const data = d.data();
                return `<div class="log-entry">&gt; ${window.escHtml ? window.escHtml(data.text) : data.text}</div>`;
            }).join('');
        } catch (e) { console.error("Protokoll-Sicherheitsauffrischung fehlgeschlagen:", e); }
    }

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

        // Sicherheitsnetz: zusätzlich zum Live-Listener alle 15s einmal frisch nachladen - falls
        // der Live-Listener aus irgendeinem (bisher nicht eindeutig reproduzierbarem) Grund
        // stumm hängen bleiben sollte, sorgt das dafür, dass spätestens nach 15s der korrekte
        // Stand nachgezogen wird, statt dauerhaft veraltet zu bleiben.
        if (protokollFallbackInterval) clearInterval(protokollFallbackInterval);
        protokollFallbackInterval = setInterval(ladeProtokollEinmalig, 15000);
    };

    // --- Konsolenbefehl "log": listet die komplette Missions-Historie auf ---
    // Aufruf einfach als log() in der Browser-Konsole (F12).
    window.log = async function() {
        await wartenAufAgentName();
        const mySlug = window.agentSlug(window.agentName);
        try {
            const q = window.query(
                window.collection(window.db, "protokolle", mySlug, "missionsverlauf"),
                window.orderBy("startTs", "desc"),
                window.limit(50)
            );
            const snapshot = await window.getDocs(q);
            if (snapshot.empty) {
                console.log("Keine Missionen im Verlauf gefunden.");
                return;
            }
            const statusLabel = { gestartet: 'LÄUFT/ABGEBROCHEN', abgeschlossen: 'ERFOLGREICH ABGESCHLOSSEN', abgebrochen: 'ABGEBROCHEN' };
            const typLabel = { normal: 'Normale Mission', fortgeschritten: 'Fortgeschrittene Mission', weit: 'Weit entfernte Mission', galaktisch: 'Galaktische Mission' };
            const zeilen = snapshot.docs.map(d => {
                const a = d.data();
                const start = (a.startTs && typeof a.startTs.toDate === 'function') ? a.startTs.toDate().toLocaleString('de-DE') : '(Zeitstempel unbekannt)';
                const status = statusLabel[a.status] || a.status || 'unbekannt';
                const typ = typLabel[a.typ] || a.typ || 'unbekannt';
                let belohnungText = '-';
                if (a.belohnung) {
                    const teile = [];
                    if (a.belohnung.credits > 0) teile.push(a.belohnung.credits + ' Credits');
                    if (a.belohnung.materiezellen > 0) teile.push(a.belohnung.materiezellen + ' Materiezellen');
                    if (a.belohnung.xp > 0) teile.push(a.belohnung.xp + ' XP');
                    if (a.belohnung.levelBonus > 0) teile.push('+' + a.belohnung.levelBonus + ' Level');
                    belohnungText = teile.length > 0 ? teile.join(', ') : 'keine';
                }
                return { Start: start, Status: status, Missionstyp: typ, Belohnung: belohnungText };
            });
            console.table(zeilen);
            return zeilen;
        } catch (e) {
            console.error("Missions-Historie konnte nicht geladen werden:", e);
        }
    };
})();
