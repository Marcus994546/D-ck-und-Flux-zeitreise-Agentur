// ============================================================
// AGENTUR-NETZWERK (vorher: "Zeit Stränge", war zuletzt reiner
// Platzhalter ohne jede Funktion) - eigenständiges Modul für alles,
// was Spieler untereinander vergleicht: Rangliste und Spielersuche.
// Läuft auf demselben Firestore-Projekt wie der Komm-Link, nutzt die
// bereits bestehenden, breit lesbaren Collections "agenten" und
// "Agent - Base".
// ============================================================

(function() {
    let currentNetzwerkTab = 'rangliste';

    window.openNetzwerk = function() {
        if (typeof triggerScan === 'function') triggerScan();
        renderNetzwerkShell();
    };

    function renderNetzwerkShell() {
        const body = document.getElementById('content-body');
        if (!body) return;
        body.innerHTML =
            '<h3>Agentur-Netzwerk</h3>' +
            '<div id="netzwerk-tabs" style="display:flex; gap:8px; justify-content:center; margin-bottom:15px;">' +
                '<button class="netzwerk-tab-btn" data-tab="rangliste" onclick="window.switchNetzwerkTab(\'rangliste\')">RANGLISTE</button>' +
                '<button class="netzwerk-tab-btn" data-tab="suche" onclick="window.switchNetzwerkTab(\'suche\')">SPIELER SUCHEN</button>' +
            '</div>' +
            '<div id="netzwerk-content"></div>' +
            '<hr><button onclick="f_start()">Zurück</button>';
        window.switchNetzwerkTab(currentNetzwerkTab);
    }

    window.switchNetzwerkTab = function(tab) {
        currentNetzwerkTab = tab;
        document.querySelectorAll('.netzwerk-tab-btn').forEach(btn => {
            btn.classList.toggle('netzwerk-tab-active', btn.dataset.tab === tab);
        });
        if (tab === 'rangliste') renderRangliste();
        else if (tab === 'suche') renderSpielerSuche();
    };

    // --- RANGLISTE ---
    // Score-Formel: bewusst simpel und transparent gehalten, gewichtet Artefakte und
    // Spieler-Level stärker als reine Ressourcenmenge.
    function computeAgenturScore(stats) {
        return Math.round(
            (stats.lvl || 0) * 100 +
            (stats.artifactCount || 0) * 250 +
            (stats.credits || 0) / 50 +
            (stats.materiezellen || 0) * 10 +
            (stats.chronoszellen || 0) * 40
        );
    }

    async function renderRangliste() {
        const content = document.getElementById('netzwerk-content');
        if (!content) return;
        content.innerHTML = '<p style="color:#0f8; text-align:center;">Lade Rangliste...</p>';
        if (!window.db || !window.getDocs || !window.collection) {
            content.innerHTML = '<p style="color:#f44; text-align:center;">Keine Verbindung zur Datenbank.</p>';
            return;
        }
        try {
            const agentenSnap = await window.getDocs(window.collection(window.db, "agenten"));
            const baseSnap = await window.getDocs(window.collection(window.db, "Agent - Base"));
            const artifactCounts = {};
            baseSnap.forEach(d => {
                const arr = d.data().collectedArtifacts;
                artifactCounts[d.id] = Array.isArray(arr) ? arr.length : 0;
            });

            const entries = [];
            agentenSnap.forEach(d => {
                const data = d.data();
                const stats = {
                    slug: d.id,
                    lvl: data.lvl || 1,
                    credits: data.credits || 0,
                    materiezellen: (data.materiezellen !== undefined) ? data.materiezellen : (data.materialzellen || 0),
                    chronoszellen: data.chronoszellen || 0,
                    artifactCount: artifactCounts[d.id] || 0
                };
                entries.push({ ...stats, score: computeAgenturScore(stats) });
            });
            entries.sort((a, b) => b.score - a.score);

            const myName = window.agentSlug(window.agentName);
            const myRank = entries.findIndex(e => e.slug === myName) + 1;

            let html = '<div style="max-height:400px; overflow-y:auto;">';
            html += '<table style="width:100%; border-collapse:collapse; font-size:0.78em;">';
            html += '<tr style="color:#0ff; border-bottom:1px solid #0ff;"><th style="text-align:left; padding:4px;">#</th><th style="text-align:left; padding:4px;">Agent</th><th style="padding:4px;">Lvl</th><th style="padding:4px;">Artefakte</th><th style="padding:4px;">Score</th></tr>';
            entries.slice(0, 25).forEach((e, i) => {
                const isMe = (e.slug === myName);
                html += '<tr style="' + (isMe ? 'background:rgba(0,255,255,0.15); font-weight:bold;' : '') + ' border-bottom:1px solid rgba(0,255,255,0.15);">' +
                    '<td style="padding:4px;">' + (i + 1) + '</td>' +
                    '<td style="padding:4px; text-align:left;">' + window.escHtml(e.slug) + (isMe ? ' (Du)' : '') + '</td>' +
                    '<td style="padding:4px;">' + e.lvl + '</td>' +
                    '<td style="padding:4px;">' + e.artifactCount + '/40</td>' +
                    '<td style="padding:4px;">' + e.score.toLocaleString('de-DE') + '</td>' +
                '</tr>';
            });
            html += '</table></div>';
            if (myRank > 25) {
                html += '<p style="color:#0ff; margin-top:10px; font-size:0.8em;">Dein Rang: #' + myRank + ' von ' + entries.length + '</p>';
            }
            content.innerHTML = html;
        } catch (e) {
            console.error(e);
            content.innerHTML = '<p style="color:#f44; text-align:center;">Rangliste konnte nicht geladen werden.</p>';
        }
    }

    // --- SPIELER SUCHEN ---
    function renderSpielerSuche() {
        const content = document.getElementById('netzwerk-content');
        if (!content) return;
        content.innerHTML =
            '<div style="display:flex; gap:5px; margin-bottom:15px;">' +
                '<input type="text" id="netzwerk-such-input" placeholder="Agentenname..." autocomplete="off" style="flex-grow:1; background:#000; border:1px solid #0ff; color:#0ff; padding:8px; font-family:inherit;">' +
                '<button class="modell-btn" onclick="window.suchSpieler()">SUCHEN</button>' +
            '</div>' +
            '<div id="netzwerk-such-ergebnis"></div>';
        const input = document.getElementById('netzwerk-such-input');
        if (input) input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') window.suchSpieler(); });
    }

    window.suchSpieler = async function() {
        const input = document.getElementById('netzwerk-such-input');
        const ergebnis = document.getElementById('netzwerk-such-ergebnis');
        if (!input || !ergebnis) return;
        const name = input.value.trim();
        if (!name) return;
        ergebnis.innerHTML = '<p style="color:#0f8;">Suche...</p>';
        try {
            const slug = window.agentSlug(name);
            const agentRef = window.doc(window.db, "agenten", slug);
            const snap = await window.getDoc(agentRef);
            if (!snap.exists()) {
                ergebnis.innerHTML = '<p style="color:#f44;">Kein Agent mit diesem Namen gefunden.</p>';
                return;
            }
            const data = snap.data();
            let artifactCount = 0;
            try {
                const baseSnap = await window.getDoc(window.doc(window.db, "Agent - Base", slug));
                if (baseSnap.exists() && Array.isArray(baseSnap.data().collectedArtifacts)) {
                    artifactCount = baseSnap.data().collectedArtifacts.length;
                }
            } catch (e) {}
            const mz = (data.materiezellen !== undefined) ? data.materiezellen : (data.materialzellen || 0);
            ergebnis.innerHTML =
                '<div style="border:1px solid #0ff; padding:15px; text-align:left; font-size:0.85em;">' +
                    '<b style="color:#0ff; font-size:1.1em;">' + window.escHtml(name) + '</b><br><br>' +
                    'Level: <b>' + (data.lvl || 1) + '</b><br>' +
                    'Credits: <b>' + (data.credits || 0).toLocaleString('de-DE') + '</b><br>' +
                    'Materiezellen: <b>' + mz + '</b><br>' +
                    'Chronos-Zellen: <b>' + (data.chronoszellen || 0) + '</b><br>' +
                    'Artefakte: <b>' + artifactCount + '/40</b>' +
                '</div>';
        } catch (e) {
            console.error(e);
            ergebnis.innerHTML = '<p style="color:#f44;">Suche fehlgeschlagen.</p>';
        }
    };
})();
