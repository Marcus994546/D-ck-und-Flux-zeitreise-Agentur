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

    // --- Terminal-Befehl "protokoll": Tagesansicht mit Datums-Navigation ---
    let aktuellesProtokollDatum = new Date(); // Startet immer beim heutigen Tag
    function datumAlsString(d) {
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    function tagesGrenzen(d) {
        const start = new Date(d); start.setHours(0, 0, 0, 0);
        const ende = new Date(d); ende.setHours(23, 59, 59, 999);
        return { start, ende };
    }

    async function ladeUndZeigeProtokollTag(container) {
        if (!window.db || !window.agentName) return;
        const { start, ende } = tagesGrenzen(aktuellesProtokollDatum);
        const kopf = document.getElementById('protokoll-panel-kopf');
        const liste = document.getElementById('protokoll-panel-liste');
        if (kopf) kopf.innerText = datumAlsString(aktuellesProtokollDatum);
        if (liste) liste.innerHTML = '<div style="opacity:0.6;">Lade...</div>';
        try {
            const mySlug = window.agentSlug(window.agentName);
            const q = window.query(
                window.collection(window.db, "protokolle", mySlug, "eintraege"),
                window.orderBy("ts", "asc")
            );
            const snapshot = await window.getDocs(q);
            const startMs = start.getTime(), endeMs = ende.getTime();
            const zeilen = [];
            snapshot.forEach(d => {
                const data = d.data();
                if (!data.ts || typeof data.ts.toMillis !== 'function') return;
                const ms = data.ts.toMillis();
                if (ms >= startMs && ms <= endeMs) {
                    zeilen.push({ zeit: data.ts.toDate().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), text: data.text });
                }
            });
            if (liste) {
                liste.innerHTML = zeilen.length === 0
                    ? '<div style="opacity:0.5; font-style:italic;">Keine Protokoll-Einträge für diesen Tag.</div>'
                    : zeilen.map(z => '<div class="log-entry" style="margin-bottom:4px;"><span style="opacity:0.6;">[' + z.zeit + ']</span> &gt; ' + (window.escHtml ? window.escHtml(z.text) : z.text) + '</div>').join('');
            }
        } catch (e) {
            console.error('Protokoll-Tag konnte nicht geladen werden:', e);
            if (liste) liste.innerHTML = '<div style="color:#f44;">Fehler beim Laden: ' + (e && e.message ? e.message : 'unbekannt') + '</div>';
        }
    }

    window.zeigeProtokollPanel = async function(container) {
        aktuellesProtokollDatum = new Date();
        container.innerHTML = `
            <div style="padding:15px; text-align:left;">
                <div style="display:flex; align-items:center; justify-content:center; gap:12px; color:#0f8; margin-bottom:12px;">
                    <button onclick="window.protokollTagWechseln(-1)" style="background:none; border:1px solid #0f8; color:#0f8; padding:4px 12px; cursor:pointer; border-radius:3px; font-family:monospace;">◀</button>
                    <span id="protokoll-panel-kopf" style="font-weight:bold; min-width:110px; text-align:center;">-</span>
                    <button onclick="window.protokollTagWechseln(1)" style="background:none; border:1px solid #0f8; color:#0f8; padding:4px 12px; cursor:pointer; border-radius:3px; font-family:monospace;">▶</button>
                </div>
                <div id="protokoll-panel-liste" style="max-height:55vh; overflow-y:auto; font-size:0.85em; color:#0f8;"></div>
            </div>
        `;
        await ladeUndZeigeProtokollTag(container);
    };

    window.protokollTagWechseln = async function(delta) {
        const neu = new Date(aktuellesProtokollDatum);
        neu.setDate(neu.getDate() + delta);
        // Kein Navigieren in die Zukunft über heute hinaus.
        if (neu.getTime() > Date.now()) return;
        aktuellesProtokollDatum = neu;
        await ladeUndZeigeProtokollTag(document.getElementById('anzeige'));
    };

    // ============================================================
    // VIBRATIONSFEEDBACK (Android)
    // ============================================================
    // navigator.vibrate() gibt es NUR unter Android/Chrome - iOS Safari unterstützt die
    // Vibration API grundsätzlich nicht (Plattform-Einschränkung von Apple, kein Bug hier).
    // Feature-Detection über "typeof" statt einfachem falsy-Check, da manche Browser die
    // Eigenschaft zwar kennen, aber beim Aufruf leise scheitern - try/catch fängt das zusätzlich
    // ab, damit niemals etwas abstürzt, egal auf welchem Gerät gespielt wird.
    window.vibriere = function(muster) {
        if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
        try { navigator.vibrate(muster); } catch (e) { /* stillschweigend ignorieren */ }
    };
})();
