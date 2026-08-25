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
                '<button class="netzwerk-tab-btn" data-tab="allianz" onclick="window.switchNetzwerkTab(\'allianz\')">ALLIANZEN</button>' +
                '<button class="netzwerk-tab-btn" data-tab="saison" onclick="window.switchNetzwerkTab(\'saison\')">SAISON</button>' +
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
        else if (tab === 'allianz') renderAllianz();
        else if (tab === 'saison') renderSaison();
    };

    // --- TITEL/ABZEICHEN ---
    // Rein clientseitig aus bereits vorhandenen Werten berechnet, kein eigenes Firestore-Feld
    // nötig. Absteigend nach Prestige sortiert - es wird immer nur der EINE höchste zutreffende
    // Titel angezeigt, um die Anzeige nicht zu überladen.
    const TITLE_TIERS = [
        { check: (s) => s.artifactCount >= 40, label: '🏆 Archiv-Vollender' },
        { check: (s) => s.isAllianzGruender, label: '👑 Allianz-Gründer' },
        { check: (s) => s.artifactCount >= 25, label: '💎 Artefakt-Meister' },
        { check: (s) => s.maxRoomLevel >= 10, label: '⚙️ Architekt' },
        { check: (s) => s.lvl >= 50, label: '⚡ Meister-Agent' },
        { check: (s) => s.artifactCount >= 10, label: '🔹 Artefakt-Sammler' },
        { check: (s) => s.credits >= 100000, label: '💰 Wohlhabender Agent' },
        { check: (s) => s.lvl >= 25, label: '🌟 Erfahrener Agent' },
        { check: (s) => s.agentCount >= 8, label: '🧑‍🤝‍🧑 Vollbesetzte Agentur' }
    ];
    function computeBestTitle(stats) {
        const tier = TITLE_TIERS.find(t => t.check(stats));
        return tier ? tier.label : '';
    }

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
            const maxRoomLevels = {};
            const agentCounts = {};
            baseSnap.forEach(d => {
                const bd = d.data();
                const arr = bd.collectedArtifacts;
                artifactCounts[d.id] = Array.isArray(arr) ? arr.length : 0;
                maxRoomLevels[d.id] = Array.isArray(bd.baseData) ? Math.max(0, ...bd.baseData.map(r => r.lvl || 1)) : 0;
                agentCounts[d.id] = Array.isArray(bd.agents) ? bd.agents.length : 0;
            });
            let allianzGruender = {};
            try {
                const allianzSnap = await window.getDocs(window.collection(window.db, "allianzen"));
                allianzSnap.forEach(d => { allianzGruender[d.data().ownerSlug] = true; });
            } catch (e) {}

            const entries = [];
            agentenSnap.forEach(d => {
                const data = d.data();
                const stats = {
                    slug: d.id,
                    lvl: data.lvl || 1,
                    credits: data.credits || 0,
                    materiezellen: (data.materiezellen !== undefined) ? data.materiezellen : (data.materialzellen || 0),
                    chronoszellen: data.chronoszellen || 0,
                    artifactCount: artifactCounts[d.id] || 0,
                    maxRoomLevel: maxRoomLevels[d.id] || 0,
                    agentCount: agentCounts[d.id] || 0,
                    isAllianzGruender: !!allianzGruender[d.id]
                };
                entries.push({ ...stats, score: computeAgenturScore(stats), title: computeBestTitle(stats) });
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
                    '<td style="padding:4px; text-align:left;">' + window.escHtml(e.slug) + (isMe ? ' (Du)' : '') + (e.title ? '<br><span style="font-size:0.85em; opacity:0.75;">' + e.title + '</span>' : '') + '</td>' +
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
            let artifactCount = 0, maxRoomLevel = 0, agentCount = 0;
            try {
                const baseSnap = await window.getDoc(window.doc(window.db, "Agent - Base", slug));
                if (baseSnap.exists()) {
                    const bd = baseSnap.data();
                    if (Array.isArray(bd.collectedArtifacts)) artifactCount = bd.collectedArtifacts.length;
                    if (Array.isArray(bd.baseData)) maxRoomLevel = Math.max(0, ...bd.baseData.map(r => r.lvl || 1));
                    if (Array.isArray(bd.agents)) agentCount = bd.agents.length;
                }
            } catch (e) {}
            let isAllianzGruender = false;
            try {
                const allianzSnap = await window.getDocs(window.collection(window.db, "allianzen"));
                allianzSnap.forEach(d => { if (d.data().ownerSlug === slug) isAllianzGruender = true; });
            } catch (e) {}
            const mz = (data.materiezellen !== undefined) ? data.materiezellen : (data.materialzellen || 0);
            const title = computeBestTitle({ lvl: data.lvl || 1, credits: data.credits || 0, artifactCount, maxRoomLevel, agentCount, isAllianzGruender });
            ergebnis.innerHTML =
                '<div style="border:1px solid #0ff; padding:15px; text-align:left; font-size:0.85em;">' +
                    '<b style="color:#0ff; font-size:1.1em;">' + window.escHtml(name) + '</b>' +
                    (title ? '<div style="opacity:0.8; margin-bottom:8px;">' + title + '</div>' : '<br><br>') +
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

    // --- ALLIANZEN ---
    async function renderAllianz() {
        const content = document.getElementById('netzwerk-content');
        if (!content) return;
        content.innerHTML = '<p style="color:#0f8; text-align:center;">Lade...</p>';
        if (!window.db) { content.innerHTML = '<p style="color:#f44;">Keine Verbindung zur Datenbank.</p>'; return; }

        const mySlug = window.agentSlug(window.agentName);
        try {
            // Eigene Allianz suchen: einmalig alle Allianzen laden und nach der eigenen Slug in
            // "mitglieder" filtern (die Collection bleibt bei einer kleinen Spielerbasis günstig
            // in einem Rutsch abfragbar).
            const allSnap = await window.getDocs(window.collection(window.db, "allianzen"));
            let myAllianz = null;
            const alleAllianzen = [];
            allSnap.forEach(d => {
                const data = d.data();
                alleAllianzen.push({ id: d.id, ...data });
                if (Array.isArray(data.mitglieder) && data.mitglieder.includes(mySlug)) myAllianz = { id: d.id, ...data };
            });

            if (myAllianz) {
                renderEigeneAllianz(myAllianz);
            } else {
                renderAllianzBrowser(alleAllianzen);
            }
        } catch (e) {
            console.error(e);
            content.innerHTML = '<p style="color:#f44; text-align:center;">Allianzen konnten nicht geladen werden.</p>';
        }
    }

    async function renderEigeneAllianz(allianz) {
        const content = document.getElementById('netzwerk-content');
        if (!content) return;
        const mySlug = window.agentSlug(window.agentName);
        const isOwner = (allianz.ownerSlug === mySlug);
        const otherMembers = allianz.mitglieder.filter(s => s !== mySlug);

        // Für jedes Mitglied die Basisdaten für eine kleine Mitgliederliste nachladen.
        let memberRows = '';
        for (const slug of allianz.mitglieder) {
            try {
                const snap = await window.getDoc(window.doc(window.db, "agenten", slug));
                const d = snap.exists() ? snap.data() : {};
                let artifactCount = 0, maxRoomLevel = 0, agentCount = 0;
                try {
                    const baseSnap = await window.getDoc(window.doc(window.db, "Agent - Base", slug));
                    if (baseSnap.exists()) {
                        const bd = baseSnap.data();
                        if (Array.isArray(bd.collectedArtifacts)) artifactCount = bd.collectedArtifacts.length;
                        if (Array.isArray(bd.baseData)) maxRoomLevel = Math.max(0, ...bd.baseData.map(r => r.lvl || 1));
                        if (Array.isArray(bd.agents)) agentCount = bd.agents.length;
                    }
                } catch (e) {}
                const title = computeBestTitle({ lvl: d.lvl || 1, credits: d.credits || 0, artifactCount, maxRoomLevel, agentCount, isAllianzGruender: slug === allianz.ownerSlug });
                memberRows += '<tr style="border-bottom:1px solid rgba(0,255,255,0.15);">' +
                    '<td style="padding:4px; text-align:left;">' + window.escHtml(slug) + (slug === allianz.ownerSlug ? ' 👑' : '') + (slug === mySlug ? ' (Du)' : '') + (title ? '<br><span style="font-size:0.85em; opacity:0.75;">' + title + '</span>' : '') + '</td>' +
                    '<td style="padding:4px;">' + (d.lvl || 1) + '</td>' +
                '</tr>';
            } catch (e) {}
        }

        // Der Besitzer kann beim Verlassen optional selbst einen Nachfolger bestimmen - lässt er
        // die Auswahl auf "Automatisch", entscheidet der Algorithmus (siehe waehleNachfolger()).
        let successorSelect = '';
        if (isOwner && otherMembers.length > 0) {
            successorSelect = '<select id="allianz-nachfolger-select" style="width:100%; background:#000; border:1px solid #0ff; color:#0ff; padding:6px; margin-bottom:8px; font-family:inherit;">' +
                '<option value="">Nachfolger automatisch bestimmen</option>' +
                otherMembers.map(s => '<option value="' + s + '">' + window.escHtml(s) + ' als Nachfolger festlegen</option>').join('') +
            '</select>';
        }

        // Handelsangebote statt einfachem Senden: "ich will X, ich biete dafür Y".
        let handelHtml = '';
        if (otherMembers.length > 0) {
            handelHtml =
                '<div style="border-top:1px solid rgba(0,255,255,0.3); margin-top:12px; padding-top:12px;">' +
                    '<b style="color:#0ff; font-size:0.85em;">NEUES HANDELSANGEBOT</b>' +
                    '<div style="font-size:0.75em; color:#aaa; margin:4px 0;">An wen, und was du im Tausch dafür anbietest.</div>' +
                    '<select id="handel-empfaenger" style="width:100%; background:#000; border:1px solid #0ff; color:#0ff; padding:6px; margin-bottom:6px; font-family:inherit;">' +
                        otherMembers.map(s => '<option value="' + s + '">' + window.escHtml(s) + '</option>').join('') +
                    '</select>' +
                    '<div style="display:flex; gap:5px; align-items:center; margin-bottom:6px; flex-wrap:wrap;">' +
                        '<span style="font-size:0.75em; color:#0f8;">ICH WILL</span>' +
                        '<input type="number" id="handel-will-menge" min="1" placeholder="Menge" style="width:70px; background:#000; border:1px solid #0f8; color:#0f8; padding:6px; font-family:inherit;">' +
                        '<select id="handel-will-typ" style="flex:1; background:#000; border:1px solid #0f8; color:#0f8; padding:6px; font-family:inherit;">' +
                            '<option value="credits">Credits (max 1000)</option>' +
                            '<option value="materiezellen">Materiezellen (max 5)</option>' +
                            '<option value="chronoszellen">Chronos-Zellen (max 2)</option>' +
                        '</select>' +
                    '</div>' +
                    '<div style="display:flex; gap:5px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">' +
                        '<span style="font-size:0.75em; color:#ffcc00;">ICH BIETE</span>' +
                        '<input type="number" id="handel-bietet-menge" min="1" placeholder="Menge" style="width:70px; background:#000; border:1px solid #ffcc00; color:#ffcc00; padding:6px; font-family:inherit;">' +
                        '<select id="handel-bietet-typ" style="flex:1; background:#000; border:1px solid #ffcc00; color:#ffcc00; padding:6px; font-family:inherit;">' +
                            '<option value="credits">Credits (max 1000)</option>' +
                            '<option value="materiezellen">Materiezellen (max 5)</option>' +
                            '<option value="chronoszellen">Chronos-Zellen (max 2)</option>' +
                        '</select>' +
                    '</div>' +
                    '<button class="modell-btn" onclick="window.handelAngebotErstellen(\'' + allianz.id + '\')">ANGEBOT ERSTELLEN</button>' +
                '</div>' +
                '<div id="handel-offene-angebote" style="margin-top:15px;"><p style="color:#0f8; font-size:0.8em;">Lade Angebote...</p></div>';
        }

        content.innerHTML =
            '<div style="border:1px solid #0ff; padding:15px; text-align:left;">' +
                '<h4 style="color:#0ff; margin-top:0;">' + window.escHtml(allianz.name) + '</h4>' +
                '<p style="font-size:0.8em; color:#aaa;">' + allianz.mitglieder.length + ' Mitglied' + (allianz.mitglieder.length === 1 ? '' : 'er') + '</p>' +
                '<table style="width:100%; border-collapse:collapse; font-size:0.8em; margin-bottom:15px;">' +
                    '<tr style="color:#0ff; border-bottom:1px solid #0ff;"><th style="text-align:left; padding:4px;">Agent</th><th style="padding:4px;">Lvl</th></tr>' +
                    memberRows +
                '</table>' +
                handelHtml +
                successorSelect +
                '<button class="modell-btn" style="border-color:#f44; color:#f44; margin-top:12px;" onclick="window.allianzVerlassen(\'' + allianz.id + '\')">' + (isOwner && otherMembers.length > 0 ? 'ALLIANZ VERLASSEN' : (isOwner ? 'ALLIANZ AUFLÖSEN' : 'ALLIANZ VERLASSEN')) + '</button>' +
            '</div>';

        if (otherMembers.length > 0) renderHandelsangebote();
    }

    const HANDEL_MAX = { credits: 1000, materiezellen: 5, chronoszellen: 2 };
    const HANDEL_LABEL = { credits: 'Credits', materiezellen: 'Materiezellen', chronoszellen: 'Chronos-Zellen' };

    // Bucht den angebotenen Betrag SOFORT vom eigenen Konto ab (Treuhand) - wird bei Ablehnung
    // oder Stornierung wieder gutgeschrieben. So bleibt jede Kontoänderung immer eine reine
    // Erhöhung auf einem FREMDEN Dokument (die einzige Art, die die Firestore-Regeln zulassen),
    // nie eine Verringerung.
    window.handelAngebotErstellen = async function(allianzId) {
        const empfaenger = document.getElementById('handel-empfaenger').value;
        const willTyp = document.getElementById('handel-will-typ').value;
        const willMenge = parseInt(document.getElementById('handel-will-menge').value) || 0;
        const bietetTyp = document.getElementById('handel-bietet-typ').value;
        const bietetMenge = parseInt(document.getElementById('handel-bietet-menge').value) || 0;

        if (willMenge <= 0 || bietetMenge <= 0) { alert('Bitte für beide Seiten eine Menge größer als 0 eingeben.'); return; }
        if (willMenge > HANDEL_MAX[willTyp]) { alert('Maximal ' + HANDEL_MAX[willTyp] + ' ' + HANDEL_LABEL[willTyp] + ' pro Angebot.'); return; }
        if (bietetMenge > HANDEL_MAX[bietetTyp]) { alert('Maximal ' + HANDEL_MAX[bietetTyp] + ' ' + HANDEL_LABEL[bietetTyp] + ' pro Angebot.'); return; }

        const mySlug = window.agentSlug(window.agentName);
        try {
            const myRef = window.doc(window.db, "agenten", mySlug);
            const mySnap = await window.getDoc(myRef);
            const myData = mySnap.exists() ? mySnap.data() : {};
            const meinBestand = (bietetTyp === 'materiezellen') ? ((myData.materiezellen !== undefined) ? myData.materiezellen : (myData.materialzellen || 0)) : (myData[bietetTyp] || 0);
            if (meinBestand < bietetMenge) { alert('Nicht genug ' + HANDEL_LABEL[bietetTyp] + ' vorhanden, um das anzubieten.'); return; }

            // Treuhand: eigenes Angebot sofort vom eigenen Konto abbuchen.
            await window.setDoc(myRef, { [bietetTyp]: meinBestand - bietetMenge }, { merge: true });
            if (bietetTyp === 'credits') window.playerCredits = meinBestand - bietetMenge;
            else if (bietetTyp === 'materiezellen') window.playerMateriezellen = meinBestand - bietetMenge;

            await window.addDoc(window.collection(window.db, "handelsangebote"), {
                allianzId, von: mySlug, an: empfaenger,
                willTyp, willMenge, bietetTyp, bietetMenge,
                status: 'offen', createdAt: Date.now()
            });
            alert('Angebot erstellt.');
            renderAllianz();
        } catch (e) {
            console.error(e);
            alert('Angebot konnte nicht erstellt werden.');
        }
    };

    async function renderHandelsangebote() {
        const box = document.getElementById('handel-offene-angebote');
        if (!box) return;
        const mySlug = window.agentSlug(window.agentName);
        try {
            const snap = await window.getDocs(window.query(window.collection(window.db, "handelsangebote"), window.where('status', '==', 'offen')));
            const eingehend = [], ausgehend = [];
            snap.forEach(d => {
                const a = { id: d.id, ...d.data() };
                if (a.an === mySlug) eingehend.push(a);
                else if (a.von === mySlug) ausgehend.push(a);
            });

            let html = '';
            if (eingehend.length > 0) {
                html += '<b style="color:#0ff; font-size:0.85em;">EINGEHENDE ANGEBOTE</b>';
                eingehend.forEach(a => {
                    html += '<div style="border:1px solid rgba(0,255,255,0.4); padding:8px; margin-top:6px; font-size:0.8em;">' +
                        window.escHtml(a.von) + ' will <b>' + a.willMenge + ' ' + HANDEL_LABEL[a.willTyp] + '</b> von dir, bietet dafür <b>' + a.bietetMenge + ' ' + HANDEL_LABEL[a.bietetTyp] + '</b>.' +
                        '<div style="display:flex; gap:5px; margin-top:6px;">' +
                            '<button class="modell-btn" style="flex:1; border-color:#0f8; color:#0f8;" onclick="window.handelAnnehmen(\'' + a.id + '\')">ANNEHMEN</button>' +
                            '<button class="modell-btn" style="flex:1; border-color:#f44; color:#f44;" onclick="window.handelAblehnen(\'' + a.id + '\')">ABLEHNEN</button>' +
                        '</div>' +
                    '</div>';
                });
            }
            if (ausgehend.length > 0) {
                html += '<b style="color:#0ff; font-size:0.85em; display:block; margin-top:10px;">MEINE OFFENEN ANGEBOTE</b>';
                ausgehend.forEach(a => {
                    html += '<div style="border:1px solid rgba(0,255,255,0.4); padding:8px; margin-top:6px; font-size:0.8em;">' +
                        'An ' + window.escHtml(a.an) + ': will <b>' + a.willMenge + ' ' + HANDEL_LABEL[a.willTyp] + '</b>, bietest <b>' + a.bietetMenge + ' ' + HANDEL_LABEL[a.bietetTyp] + '</b>.' +
                        '<button class="modell-btn" style="width:100%; margin-top:6px; border-color:#f44; color:#f44;" onclick="window.handelStornieren(\'' + a.id + '\')">ZURÜCKZIEHEN</button>' +
                    '</div>';
                });
            }
            if (!html) html = '<p style="color:#aaa; font-size:0.8em;">Keine offenen Handelsangebote.</p>';
            box.innerHTML = html;
        } catch (e) {
            console.error(e);
            box.innerHTML = '<p style="color:#f44; font-size:0.8em;">Angebote konnten nicht geladen werden.</p>';
        }
    }

    window.handelAnnehmen = async function(angebotId) {
        const mySlug = window.agentSlug(window.agentName);
        try {
            const ref = window.doc(window.db, "handelsangebote", angebotId);
            const snap = await window.getDoc(ref);
            if (!snap.exists() || snap.data().status !== 'offen') { alert('Angebot nicht mehr verfügbar.'); return; }
            const a = snap.data();

            const myRef = window.doc(window.db, "agenten", mySlug);
            const mySnap = await window.getDoc(myRef);
            const myData = mySnap.exists() ? mySnap.data() : {};
            const meinWillBestand = (a.willTyp === 'materiezellen') ? ((myData.materiezellen !== undefined) ? myData.materiezellen : (myData.materialzellen || 0)) : (myData[a.willTyp] || 0);
            if (meinWillBestand < a.willMenge) { alert('Du hast nicht genug ' + HANDEL_LABEL[a.willTyp] + ', um das Angebot anzunehmen.'); return; }
            const meinBietetBestand = myData[a.bietetTyp] || 0;

            // Eigenes Dokument: das Verlangte abgeben, das (treuhänderisch hinterlegte) Angebot
            // des anderen entgegennehmen - beides eigener Besitz, uneingeschränkt erlaubt.
            await window.setDoc(myRef, {
                [a.willTyp]: meinWillBestand - a.willMenge,
                [a.bietetTyp]: meinBietetBestand + a.bietetMenge
            }, { merge: true });

            // Anbieter-Dokument: nur eine Erhöhung um das Verlangte - die einzige Art von
            // Fremdzugriff, die die Regeln erlauben.
            const vonRef = window.doc(window.db, "agenten", a.von);
            const vonSnap = await window.getDoc(vonRef);
            const vonBestand = vonSnap.exists() ? (vonSnap.data()[a.willTyp] || 0) : 0;
            await window.setDoc(vonRef, { [a.willTyp]: vonBestand + a.willMenge }, { merge: true });

            await window.setDoc(ref, { status: 'angenommen' }, { merge: true });

            if (a.willTyp === 'credits') window.playerCredits = meinWillBestand - a.willMenge;
            else if (a.willTyp === 'materiezellen') window.playerMateriezellen = meinWillBestand - a.willMenge;
            if (a.bietetTyp === 'credits') window.playerCredits = (window.playerCredits || 0) + a.bietetMenge;
            else if (a.bietetTyp === 'materiezellen') window.playerMateriezellen = (window.playerMateriezellen || 0) + a.bietetMenge;

            alert('Handel abgeschlossen.');
            renderAllianz();
        } catch (e) {
            console.error(e);
            alert('Annahme fehlgeschlagen.');
        }
    };

    window.handelAblehnen = async function(angebotId) {
        try {
            const ref = window.doc(window.db, "handelsangebote", angebotId);
            const snap = await window.getDoc(ref);
            if (!snap.exists() || snap.data().status !== 'offen') return;
            const a = snap.data();
            // Treuhand-Rückerstattung an den Anbieter (reine Erhöhung, erlaubt).
            const vonRef = window.doc(window.db, "agenten", a.von);
            const vonSnap = await window.getDoc(vonRef);
            const vonBestand = vonSnap.exists() ? (vonSnap.data()[a.bietetTyp] || 0) : 0;
            await window.setDoc(vonRef, { [a.bietetTyp]: vonBestand + a.bietetMenge }, { merge: true });
            await window.setDoc(ref, { status: 'abgelehnt' }, { merge: true });
            renderAllianz();
        } catch (e) {
            console.error(e);
            alert('Ablehnung fehlgeschlagen.');
        }
    };

    window.handelStornieren = async function(angebotId) {
        const mySlug = window.agentSlug(window.agentName);
        try {
            const ref = window.doc(window.db, "handelsangebote", angebotId);
            const snap = await window.getDoc(ref);
            if (!snap.exists() || snap.data().status !== 'offen') return;
            const a = snap.data();
            // Eigene Treuhand-Rückerstattung, auf dem eigenen Dokument - uneingeschränkt erlaubt.
            const myRef = window.doc(window.db, "agenten", mySlug);
            const mySnap = await window.getDoc(myRef);
            const meinBestand = mySnap.exists() ? (mySnap.data()[a.bietetTyp] || 0) : 0;
            await window.setDoc(myRef, { [a.bietetTyp]: meinBestand + a.bietetMenge }, { merge: true });
            if (a.bietetTyp === 'credits') window.playerCredits = meinBestand + a.bietetMenge;
            else if (a.bietetTyp === 'materiezellen') window.playerMateriezellen = meinBestand + a.bietetMenge;
            await window.setDoc(ref, { status: 'storniert' }, { merge: true });
            renderAllianz();
        } catch (e) {
            console.error(e);
            alert('Stornierung fehlgeschlagen.');
        }
    };

    function renderAllianzBrowser(alleAllianzen) {
        const content = document.getElementById('netzwerk-content');
        if (!content) return;
        let listHtml = '';
        if (alleAllianzen.length === 0) {
            listHtml = '<p style="color:#aaa; font-size:0.85em;">Noch keine Allianzen gegründet - sei die erste!</p>';
        } else {
            listHtml = '<div style="max-height:250px; overflow-y:auto; margin-bottom:15px;">';
            alleAllianzen.sort((a, b) => (b.mitglieder || []).length - (a.mitglieder || []).length).forEach(a => {
                listHtml += '<div style="display:flex; justify-content:space-between; align-items:center; border:1px solid rgba(0,255,255,0.3); padding:8px; margin-bottom:6px;">' +
                    '<span>' + window.escHtml(a.name) + ' <span style="opacity:0.6; font-size:0.8em;">(' + (a.mitglieder || []).length + ')</span></span>' +
                    '<button class="netzwerk-tab-btn" onclick="window.allianzBeitreten(\'' + a.id + '\')">BEITRETEN</button>' +
                '</div>';
            });
            listHtml += '</div>';
        }
        content.innerHTML =
            '<p style="font-size:0.8em; color:#aaa;">Du bist noch in keiner Allianz.</p>' +
            listHtml +
            '<div style="display:flex; gap:5px; margin-top:10px;">' +
                '<input type="text" id="allianz-name-input" placeholder="Name für neue Allianz..." maxlength="40" style="flex-grow:1; background:#000; border:1px solid #0ff; color:#0ff; padding:8px; font-family:inherit;">' +
                '<button class="modell-btn" onclick="window.allianzGruenden()">GRÜNDEN</button>' +
            '</div>';
    }

    window.allianzGruenden = async function() {
        const input = document.getElementById('allianz-name-input');
        const name = input ? input.value.trim() : '';
        if (!name) return;
        const mySlug = window.agentSlug(window.agentName);
        const allianzId = window.agentSlug(name) + '_' + Date.now();
        try {
            await window.setDoc(window.doc(window.db, "allianzen", allianzId), {
                name: name,
                ownerSlug: mySlug,
                mitglieder: [mySlug],
                createdAt: Date.now()
            });
            await window.setDoc(window.doc(window.db, "agenten", mySlug), { allianzId: allianzId }, { merge: true });
            renderAllianz();
        } catch (e) {
            console.error(e);
            alert('Allianz konnte nicht gegründet werden.');
        }
    };

    window.allianzBeitreten = async function(allianzId) {
        const mySlug = window.agentSlug(window.agentName);
        try {
            const ref = window.doc(window.db, "allianzen", allianzId);
            const snap = await window.getDoc(ref);
            if (!snap.exists()) return;
            const data = snap.data();
            if (Array.isArray(data.mitglieder) && data.mitglieder.includes(mySlug)) return;
            await window.setDoc(ref, { mitglieder: [...(data.mitglieder || []), mySlug] }, { merge: true });
            await window.setDoc(window.doc(window.db, "agenten", mySlug), { allianzId: allianzId }, { merge: true });
            renderAllianz();
        } catch (e) {
            console.error(e);
            alert('Beitritt fehlgeschlagen.');
        }
    };

    window.allianzVerlassen = async function(allianzId) {
        const mySlug = window.agentSlug(window.agentName);
        try {
            const ref = window.doc(window.db, "allianzen", allianzId);
            const snap = await window.getDoc(ref);
            if (!snap.exists()) return;
            const data = snap.data();
            const restMitglieder = (data.mitglieder || []).filter(s => s !== mySlug);
            const amOwner = (data.ownerSlug === mySlug);

            if (restMitglieder.length === 0) {
                await window.deleteDoc(ref);
                await window.setDoc(window.doc(window.db, "agenten", mySlug), { allianzId: null }, { merge: true });
                renderAllianz();
                return;
            }

            if (!amOwner) {
                await window.setDoc(ref, { mitglieder: restMitglieder }, { merge: true });
                await window.setDoc(window.doc(window.db, "agenten", mySlug), { allianzId: null }, { merge: true });
                renderAllianz();
                return;
            }

            // Ich bin Besitzer und verlasse die Allianz - manuelle Auswahl hat Vorrang vor dem
            // Algorithmus.
            const selectEl = document.getElementById('allianz-nachfolger-select');
            const manualChoice = selectEl ? selectEl.value : '';
            const newOwner = manualChoice || await waehleNachfolger(restMitglieder);

            await window.setDoc(ref, { mitglieder: restMitglieder, ownerSlug: newOwner }, { merge: true });
            await window.setDoc(window.doc(window.db, "agenten", mySlug), { allianzId: null }, { merge: true });
            renderAllianz();
        } catch (e) {
            console.error(e);
            alert('Aktion fehlgeschlagen.');
        }
    };

    // Nachfolge-Algorithmus (nur wenn der Besitzer verlässt, OHNE selbst einen Nachfolger zu
    // bestimmen): betrachtet die ERSTEN 10 beigetretenen Mitglieder (Array-Reihenfolge = exakte
    // Beitrittsreihenfolge, da neue Mitglieder immer nur ans Ende angehängt werden). Von diesen
    // wird per kombiniertem Punktwert aus Level (stärker gewichtet) und Aktivitätstagen der
    // letzten 10 Tage der/die Beste ausgewählt.
    async function waehleNachfolger(restMitglieder) {
        const kandidaten = restMitglieder.slice(0, 10);
        let bester = kandidaten[0];
        let besterScore = -1;
        for (const slug of kandidaten) {
            try {
                const snap = await window.getDoc(window.doc(window.db, "agenten", slug));
                const d = snap.exists() ? snap.data() : {};
                const lvl = d.lvl || 1;
                const aktiveTage = Array.isArray(d.activeDays) ? d.activeDays.length : 0;
                const score = lvl * 10 + aktiveTage;
                if (score > besterScore) { besterScore = score; bester = slug; }
            } catch (e) {}
        }
        return bester;
    }

    // --- SAISON (rollierende 7-Tage-Rangliste) ---
    // Ohne eigenen Server/Cron-Job ist ein "harter" Wochenreset zum exakt gleichen Zeitpunkt für
    // alle Spieler nicht sauber umsetzbar. Stattdessen führt jeder Spieler selbst einen
    // täglichen Verlaufs-Snapshot (siehe app.js/saveProgress, Feld "dailyHistory", 14 Tage
    // Historie). Die Saison-Rangliste vergleicht den AKTUELLEN Stand mit dem Snapshot von vor
    // rund 7 Tagen (oder dem ältesten verfügbaren, falls noch keine 7 Tage Historie vorliegen)
    // und zeigt den reinen Zuwachs seither - ehrlich benannt als "Fortschritt der letzten 7 Tage",
    // nicht als klassischer Wochenreset.
    function findSevenDaySnapshot(dailyHistory) {
        if (!Array.isArray(dailyHistory) || dailyHistory.length === 0) return null;
        const targetTs = Date.now() - 7 * 86400000;
        const sorted = [...dailyHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
        let best = sorted[0];
        for (const h of sorted) {
            if (new Date(h.date + 'T00:00:00').getTime() <= targetTs) best = h;
            else break;
        }
        return best;
    }

    async function renderSaison() {
        const content = document.getElementById('netzwerk-content');
        if (!content) return;
        content.innerHTML = '<p style="color:#0f8; text-align:center;">Lade Saison-Rangliste...</p>';
        if (!window.db || !window.getDocs || !window.collection) {
            content.innerHTML = '<p style="color:#f44; text-align:center;">Keine Verbindung zur Datenbank.</p>';
            return;
        }
        try {
            const agentenSnap = await window.getDocs(window.collection(window.db, "agenten"));
            const entries = [];
            agentenSnap.forEach(d => {
                const data = d.data();
                const snapshot = findSevenDaySnapshot(data.dailyHistory);
                if (!snapshot) return; // noch keine Historie vorhanden - taucht in der Saison-Liste noch nicht auf
                const creditsGain = (data.credits || 0) - (snapshot.credits || 0);
                const lvlGain = (data.lvl || 1) - (snapshot.lvl || 1);
                if (creditsGain <= 0 && lvlGain <= 0) return; // kein Fortschritt seither
                entries.push({ slug: d.id, creditsGain, lvlGain, seitDatum: snapshot.date });
            });
            entries.sort((a, b) => (b.creditsGain + b.lvlGain * 1000) - (a.creditsGain + a.lvlGain * 1000));

            const myName = window.agentSlug(window.agentName);
            let html = '<p style="font-size:0.7em; color:#888; margin-bottom:10px;">Fortschritt der letzten 7 Tage (kein klassischer Reset, sondern gleitender Vergleich zum jeweils eigenen Stand von vor rund einer Woche).</p>';
            if (entries.length === 0) {
                html += '<p style="color:#aaa; font-size:0.85em;">Noch keine Saison-Daten vorhanden - schau in ein paar Tagen wieder rein.</p>';
            } else {
                html += '<div style="max-height:400px; overflow-y:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.78em;">';
                html += '<tr style="color:#0ff; border-bottom:1px solid #0ff;"><th style="text-align:left; padding:4px;">#</th><th style="text-align:left; padding:4px;">Agent</th><th style="padding:4px;">+Credits</th><th style="padding:4px;">+Level</th></tr>';
                entries.slice(0, 25).forEach((e, i) => {
                    const isMe = (e.slug === myName);
                    html += '<tr style="' + (isMe ? 'background:rgba(0,255,255,0.15); font-weight:bold;' : '') + ' border-bottom:1px solid rgba(0,255,255,0.15);">' +
                        '<td style="padding:4px;">' + (i + 1) + '</td>' +
                        '<td style="padding:4px; text-align:left;">' + window.escHtml(e.slug) + (isMe ? ' (Du)' : '') + '</td>' +
                        '<td style="padding:4px;">+' + e.creditsGain.toLocaleString('de-DE') + '</td>' +
                        '<td style="padding:4px;">+' + e.lvlGain + '</td>' +
                    '</tr>';
                });
                html += '</table></div>';
            }
            content.innerHTML = html;
        } catch (e) {
            console.error(e);
            content.innerHTML = '<p style="color:#f44; text-align:center;">Saison-Rangliste konnte nicht geladen werden.</p>';
        }
    }
})();
