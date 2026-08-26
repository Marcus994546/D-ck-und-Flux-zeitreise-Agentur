// ============================================================
// AGENTUR-NETZWERK - jetzt eine komplett eigenständige Seite (netzwerk.html), kein
// Unterbereich des Hauptterminals mehr. Läuft wie base.html mit eigenem Firebase-Auth-Gate.
// ============================================================

(function() {
    window.escHtml = function(str) {
        const div = document.createElement('div');
        div.textContent = String(str ?? '');
        return div.innerHTML;
    };

    window.zeigeBestaetigung = function(text, onJa) {
        const modal = document.getElementById('bestaetigungs-modal');
        const textEl = document.getElementById('bestaetigungs-modal-text');
        const jaBtn = document.getElementById('bestaetigungs-modal-ja');
        if (!modal || !textEl || !jaBtn) return;
        textEl.innerText = text;
        modal.style.display = 'flex';
        const neuerJaBtn = jaBtn.cloneNode(true);
        jaBtn.parentNode.replaceChild(neuerJaBtn, jaBtn);
        neuerJaBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            onJa();
        });
    };

    window.zeigeInfo = function(text) {
        const modal = document.getElementById('info-modal');
        const textEl = document.getElementById('info-modal-text');
        if (!modal || !textEl) return;
        textEl.innerText = text;
        modal.style.display = 'flex';
    };

    // WICHTIG: netzwerk-firebase-init.js läuft als type="module" (vom Browser automatisch
    // verzögert ausgeführt) - dieselbe Wartefunktion wie in base-app.js, sonst könnte das
    // Auth-Gate starten, bevor window.netzwerkAuthReady überhaupt existiert.
    function waitForNetzwerkAuthReady() {
        return new Promise((resolve) => {
            (function check() {
                if (window.netzwerkAuthReady) resolve(window.netzwerkAuthReady);
                else setTimeout(check, 20);
            })();
        });
    }

    let currentNetzwerkTab = 'rangliste';

    (async function guardNetzwerkAccess() {
        const authPromise = await waitForNetzwerkAuthReady();
        const user = await authPromise;
        if (!user) { window.location.href = 'index.html'; return; }
        window.agentName = user.displayName || (user.email || '').split('@')[0];
        if (!window.agentName) { window.location.href = 'index.html'; return; }

        try {
            const mySlug = window.agentSlug(window.agentName);
            const snap = await window.getDoc(window.doc(window.db, "agenten", mySlug));
            const data = snap.exists() ? snap.data() : {};
            window.playerCredits = data.credits || 0;
            window.playerMateriezellen = (data.materiezellen !== undefined) ? data.materiezellen : (data.materialzellen || 0);
            window.playerLevel = data.lvl || 1;
        } catch (e) { console.error(e); }

        window.switchNetzwerkTab(currentNetzwerkTab);
        starteKommLinkPulsUeberwachung();
    })();

    // Grün pulsierender Komm-Link-Tab, sobald irgendwo eine ungelesene Nachricht ODER ein
    // offenes, an mich gerichtetes Handelsangebot wartet - unabhängig davon, welcher Tab gerade
    // aktiv ist.
    function starteKommLinkPulsUeberwachung() {
        const mySlug = window.agentSlug(window.agentName);
        let hatUngelesen = false, hatOffenesAngebot = false;
        function aktualisierePuls() {
            const tabBtn = document.querySelector('.nz-tab-btn[data-tab="chat"]');
            if (!tabBtn) return;
            tabBtn.classList.toggle('nz-tab-pulse-green', hatUngelesen || hatOffenesAngebot);
        }
        const qChat = window.query(window.collection(window.db, "agenten_funk"), window.where("teilnehmer", "array-contains", mySlug));
        window.onSnapshot(qChat, (snapshot) => {
            hatUngelesen = false;
            snapshot.forEach(d => { if (d.data().ungelesen_fuer === mySlug) hatUngelesen = true; });
            aktualisierePuls();
        });
        const qTrade = window.query(window.collection(window.db, "handelsangebote"), window.where("an", "==", mySlug), window.where("status", "==", "offen"));
        window.onSnapshot(qTrade, (snapshot) => {
            hatOffenesAngebot = !snapshot.empty;
            aktualisierePuls();
        });
    }

    window.switchNetzwerkTab = function(tab) {
        currentNetzwerkTab = tab;
        document.querySelectorAll('.nz-tab-btn').forEach(btn => {
            btn.classList.toggle('nz-tab-active', btn.dataset.tab === tab);
        });
        if (tab === 'rangliste') renderRangliste();
        else if (tab === 'suche') renderSpielerSuche();
        else if (tab === 'allianz') renderAllianz();
        else if (tab === 'saison') renderSaison();
        else if (tab === 'chat') renderKommLinkUebersicht();
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

    // --- Gemeinsames Spieler-Profil-Popup (Rangliste, Spielersuche, Allianz-Mitgliederliste) ---
    window.zeigeSpielerProfil = async function(slug) {
        const modal = document.getElementById('spieler-profil-modal');
        const inhalt = document.getElementById('spieler-profil-inhalt');
        if (!modal || !inhalt) return;
        inhalt.innerHTML = '<p style="color:#0f8; text-align:center;">Lade...</p>';
        modal.style.display = 'flex';
        try {
            const snap = await window.getDoc(window.doc(window.db, "agenten", slug));
            if (!snap.exists()) {
                inhalt.innerHTML = '<p style="color:#f44; text-align:center;">Agent nicht gefunden.</p>';
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
            let isAllianzGruender = false, allianzName = '';
            try {
                const allianzSnap = await window.getDocs(window.collection(window.db, "allianzen"));
                allianzSnap.forEach(d => {
                    if (d.data().ownerSlug === slug) isAllianzGruender = true;
                    if (Array.isArray(d.data().mitglieder) && d.data().mitglieder.includes(slug)) allianzName = d.data().name;
                });
            } catch (e) {}
            const mz = (data.materiezellen !== undefined) ? data.materiezellen : (data.materialzellen || 0);
            const title = computeBestTitle({ lvl: data.lvl || 1, credits: data.credits || 0, artifactCount, maxRoomLevel, agentCount, isAllianzGruender });

            inhalt.innerHTML =
                '<h3 style="color:#0ff; margin-top:0; text-shadow:0 0 8px #0ff;">' + window.escHtml(slug) + '</h3>' +
                (title ? '<div style="opacity:0.85; margin-bottom:10px;">' + title + '</div>' : '') +
                (allianzName ? '<div style="font-size:0.8em; color:#aaa; margin-bottom:10px;">Allianz: <b style="color:#0ff;">' + window.escHtml(allianzName) + '</b></div>' : '') +
                '<div>Level: <b>' + (data.lvl || 1) + '</b></div>' +
                '<div>Credits: <b>' + (data.credits || 0).toLocaleString('de-DE') + '</b></div>' +
                '<div>Materiezellen: <b>' + mz + '</b></div>' +
                '<div>Chronos-Zellen: <b>' + (data.chronoszellen || 0) + '</b></div>' +
                '<div>Artefakte: <b>' + artifactCount + '/40</b></div>' +
                '<div>Agenten: <b>' + agentCount + '</b></div>';
        } catch (e) {
            console.error(e);
            inhalt.innerHTML = '<p style="color:#f44; text-align:center;">Profil konnte nicht geladen werden.</p>';
        }
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
                    '<td style="padding:4px; text-align:left;"><span style="cursor:pointer; text-decoration:underline dotted;" onclick="window.zeigeSpielerProfil(\'' + e.slug + '\')">' + window.escHtml(e.slug) + '</span>' + (isMe ? ' (Du)' : '') + (e.title ? '<br><span style="font-size:0.85em; opacity:0.75;">' + e.title + '</span>' : '') + '</td>' +
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
            const snap = await window.getDoc(window.doc(window.db, "agenten", slug));
            if (!snap.exists()) {
                ergebnis.innerHTML = '<p style="color:#f44;">Kein Agent mit diesem Namen gefunden.</p>';
                return;
            }
            ergebnis.innerHTML =
                '<div style="border:1px solid #0ff; padding:15px; text-align:center; cursor:pointer;" onclick="window.zeigeSpielerProfil(\'' + slug + '\')">' +
                    '<b style="color:#0ff; font-size:1.1em; text-decoration:underline dotted;">' + window.escHtml(name) + '</b>' +
                    '<div style="font-size:0.7em; color:#888; margin-top:4px;">Antippen für Profil</div>' +
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
                    '<td style="padding:4px; text-align:left;"><span style="cursor:pointer; text-decoration:underline dotted;" onclick="window.zeigeSpielerProfil(\'' + slug + '\')">' + window.escHtml(slug) + '</span>' + (slug === allianz.ownerSlug ? ' 👑' : '') + (slug === mySlug ? ' (Du)' : '') + (title ? '<br><span style="font-size:0.85em; opacity:0.75;">' + title + '</span>' : '') + '</td>' +
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

        content.innerHTML =
            '<div style="border:1px solid #0ff; padding:15px; text-align:left;">' +
                '<h4 style="color:#0ff; margin-top:0;">' + window.escHtml(allianz.name) + '</h4>' +
                '<p style="font-size:0.8em; color:#aaa;">' + allianz.mitglieder.length + ' Mitglied' + (allianz.mitglieder.length === 1 ? '' : 'er') + '</p>' +
                '<table style="width:100%; border-collapse:collapse; font-size:0.8em; margin-bottom:15px;">' +
                    '<tr style="color:#0ff; border-bottom:1px solid #0ff;"><th style="text-align:left; padding:4px;">Agent</th><th style="padding:4px;">Lvl</th></tr>' +
                    memberRows +
                '</table>' +
                successorSelect +
                '<button class="modell-btn" style="border-color:#f44; color:#f44; margin-top:12px;" onclick="window.allianzVerlassen(\'' + allianz.id + '\')">' + (isOwner && otherMembers.length > 0 ? 'ALLIANZ VERLASSEN' : (isOwner ? 'ALLIANZ AUFLÖSEN' : 'ALLIANZ VERLASSEN')) + '</button>' +
            '</div>';
    }

    const HANDEL_MAX = { credits: 1000, materiezellen: 5, chronoszellen: 2 };
    const HANDEL_LABEL = { credits: 'Credits', materiezellen: 'Materiezellen', chronoszellen: 'Chronos-Zellen' };
    let handelChatEmpfaenger = null;

    window.openHandelAusChat = function(targetName) {
        handelChatEmpfaenger = targetName;
        const el = document.getElementById('handel-chat-empfaenger');
        if (el) el.innerText = targetName.toUpperCase();
        const modal = document.getElementById('handel-chat-modal');
        if (modal) modal.style.display = 'flex';
    };

    // Bucht den angebotenen Betrag SOFORT vom eigenen Konto ab (Treuhand) - wird bei Ablehnung
    // oder Stornierung wieder gutgeschrieben. So bleibt jede Kontoänderung immer eine reine
    // Erhöhung auf einem FREMDEN Dokument (die einzige Art, die die Firestore-Regeln zulassen),
    // nie eine Verringerung.
    window.handelAusChatErstellen = async function() {
        const empfaenger = handelChatEmpfaenger;
        if (!empfaenger) return;
        const willTyp = document.getElementById('handel-chat-will-typ').value;
        const willMenge = parseInt(document.getElementById('handel-chat-will-menge').value) || 0;
        const bietetTyp = document.getElementById('handel-chat-bietet-typ').value;
        const bietetMenge = parseInt(document.getElementById('handel-chat-bietet-menge').value) || 0;

        if (willMenge <= 0 || bietetMenge <= 0) { window.zeigeInfo('Bitte für beide Seiten eine Menge größer als 0 eingeben.'); return; }
        if (willMenge > HANDEL_MAX[willTyp]) { window.zeigeInfo('Maximal ' + HANDEL_MAX[willTyp] + ' ' + HANDEL_LABEL[willTyp] + ' pro Angebot.'); return; }
        if (bietetMenge > HANDEL_MAX[bietetTyp]) { window.zeigeInfo('Maximal ' + HANDEL_MAX[bietetTyp] + ' ' + HANDEL_LABEL[bietetTyp] + ' pro Angebot.'); return; }

        const mySlug = window.agentSlug(window.agentName);
        try {
            const myRef = window.doc(window.db, "agenten", mySlug);
            const mySnap = await window.getDoc(myRef);
            const myData = mySnap.exists() ? mySnap.data() : {};
            const meinBestand = (bietetTyp === 'materiezellen') ? ((myData.materiezellen !== undefined) ? myData.materiezellen : (myData.materialzellen || 0)) : (myData[bietetTyp] || 0);
            if (meinBestand < bietetMenge) { window.zeigeInfo('Nicht genug ' + HANDEL_LABEL[bietetTyp] + ' vorhanden, um das anzubieten.'); return; }

            // Treuhand: eigenes Angebot sofort vom eigenen Konto abbuchen.
            await window.setDoc(myRef, { [bietetTyp]: meinBestand - bietetMenge }, { merge: true });
            if (bietetTyp === 'credits') window.playerCredits = meinBestand - bietetMenge;
            else if (bietetTyp === 'materiezellen') window.playerMateriezellen = meinBestand - bietetMenge;

            // Handelsangebote entstehen jetzt genau wie Nachrichten immer innerhalb eines
            // dauerhaften Chat-Kanals - der Kanal wird also (falls noch nicht vorhanden) hier
            // ebenfalls angelegt, damit er dauerhaft in "GESPEICHERTE KANÄLE" auftaucht.
            const channelId = [mySlug, empfaenger].sort().join('_');
            await window.setDoc(window.doc(window.db, "agenten_funk", channelId), {
                teilnehmer: [mySlug, empfaenger],
                ungelesen_fuer: empfaenger,
                last_ping: Date.now()
            }, { merge: true });

            await window.addDoc(window.collection(window.db, "handelsangebote"), {
                von: mySlug, an: empfaenger,
                willTyp, willMenge, bietetTyp, bietetMenge,
                status: 'offen', createdAt: Date.now()
            });
            document.getElementById('handel-chat-modal').style.display = 'none';
        } catch (e) {
            console.error(e);
            window.zeigeInfo('Angebot konnte nicht erstellt werden.');
        }
    };

    window.handelAnnehmen = async function(angebotId) {
        const mySlug = window.agentSlug(window.agentName);
        try {
            const ref = window.doc(window.db, "handelsangebote", angebotId);
            const snap = await window.getDoc(ref);
            if (!snap.exists() || snap.data().status !== 'offen') { window.zeigeInfo('Angebot nicht mehr verfügbar.'); return; }
            const a = snap.data();

            const myRef = window.doc(window.db, "agenten", mySlug);
            const mySnap = await window.getDoc(myRef);
            const myData = mySnap.exists() ? mySnap.data() : {};
            const meinWillBestand = (a.willTyp === 'materiezellen') ? ((myData.materiezellen !== undefined) ? myData.materiezellen : (myData.materialzellen || 0)) : (myData[a.willTyp] || 0);
            if (meinWillBestand < a.willMenge) { window.zeigeInfo('Du hast nicht genug ' + HANDEL_LABEL[a.willTyp] + ', um das Angebot anzunehmen.'); return; }
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

            window.zeigeInfo('Handel abgeschlossen.');
        } catch (e) {
            console.error(e);
            window.zeigeInfo('Annahme fehlgeschlagen.');
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
        } catch (e) {
            console.error(e);
            window.zeigeInfo('Ablehnung fehlgeschlagen.');
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
        } catch (e) {
            console.error(e);
            window.zeigeInfo('Stornierung fehlgeschlagen.');
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
                    '<button class="nz-tab-btn" onclick="window.allianzBeitreten(\'' + a.id + '\')">BEITRETEN</button>' +
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
            window.zeigeInfo('Allianz konnte nicht gegründet werden.');
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
            window.zeigeInfo('Beitritt fehlgeschlagen.');
        }
    };

    window.allianzVerlassen = function(allianzId) {
        const ausfuehren = async () => {
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
                window.zeigeInfo('Aktion fehlgeschlagen.');
            }
        };
        if (typeof window.zeigeBestaetigung === 'function') {
            window.zeigeBestaetigung('Willst du die Allianz wirklich verlassen bzw. auflösen?', ausfuehren);
        } else {
            console.error('zeigeBestaetigung nicht verfügbar.');
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

    // --- KOMM-LINK (portiert aus app.js, rendert jetzt in #netzwerk-content statt #content-body) ---
    let nzChatListListener = null;
    let nzCurrentChatListener = null;
    window.currentChatTarget = null;

    function renderKommLinkUebersicht() {
        const content = document.getElementById('netzwerk-content');
        if (!content) return;
        window.currentChatTarget = null;
        if (nzCurrentChatListener) { nzCurrentChatListener(); nzCurrentChatListener = null; }

        content.innerHTML = `
            <h3 style="color: #0f8; margin-top:0;">[ KOMM-LINK ]</h3>
            <div style="margin-bottom: 20px;">
                <div style="font-size: 0.6em; color: #0f8; margin-bottom: 5px;">AGENTEN-ID EINGEBEN:</div>
                <div style="display: flex; gap: 5px;">
                    <input type="text" id="chat-target-input" placeholder="NAME..." autocomplete="off" style="flex-grow: 1; background: #000; border: 1px solid #0f8; color: #0f8; padding: 8px; font-family: monospace; outline: none; text-transform: uppercase;">
                    <button class="modell-btn" style="margin: 0; width: auto; padding: 0 15px;" onclick="window.startDirectFunkNz()">FUNK</button>
                </div>
            </div>
            <div style="text-align: left; margin-bottom: 15px;">
                <div style="font-size: 0.6em; opacity: 0.6; margin-bottom: 5px;">GESPEICHERTE KANÄLE:</div>
                <div id="active-chat-list"><div style="color:#0f8; font-size: 0.8em; margin: 10px 0;">Synchronisiere Funkwellen...</div></div>
            </div>
            <button class="modell-btn" style="border-color: #ffcc00; color: #ffcc00; width:100%;" onclick="window.renderRadarViewNz()">📡 RADAR AKTIVIEREN</button>
        `;

        if (window.db) {
            if (nzChatListListener) nzChatListListener();
            const funkRef = window.collection(window.db, "agenten_funk");
            const q = window.query(funkRef, window.where("teilnehmer", "array-contains", window.agentSlug(window.agentName)));
            nzChatListListener = window.onSnapshot(q, (snapshot) => {
                const listContainer = document.getElementById('active-chat-list');
                if (!listContainer) return;
                if (snapshot.empty) {
                    listContainer.innerHTML = '<div style="color: #555; font-size: 0.8em; margin: 10px 0;">Keine aktiven Verbindungen.</div>';
                    return;
                }
                let html = "";
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const other = data.teilnehmer.find(n => n !== window.agentSlug(window.agentName)) || window.agentSlug(window.agentName);
                    const style = (data.ungelesen_fuer === window.agentSlug(window.agentName)) ? "color: #ffcc00; text-shadow: 0 0 10px #ffcc00;" : "color: #0f8;";
                    html += `<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,255,204,0.1); padding: 8px 0;">
                        <span style="cursor: pointer; flex-grow: 1; ${style}" onclick="window.openPrivateChatNz('${other}')">> AGENT: ${window.escHtml(other.toUpperCase())}${data.ungelesen_fuer === window.agentSlug(window.agentName) ? " [NEUE NACHRICHT]" : ""}</span>
                        <span style="cursor: pointer; color: #f44; padding: 0 10px;" onclick="window.deleteChatNz('${other}')">🗑️</span>
                    </div>`;
                });
                listContainer.innerHTML = html;
            }, (error) => {
                // Vorher wurde ein Fehler hier (z.B. fehlende Berechtigung) komplett
                // stillschweigend verschluckt - der Platzhaltertext "Synchronisiere
                // Funkwellen..." blieb dann für immer stehen, ohne jeden Hinweis, warum.
                console.error("Kanal-Liste konnte nicht geladen werden:", error);
                const listContainer = document.getElementById('active-chat-list');
                if (listContainer) listContainer.innerHTML = '<div style="color:#f44; font-size:0.8em;">Fehler beim Laden der Kanäle: ' + window.escHtml(error.message || String(error)) + '</div>';
            });
        }
    }

    window.startDirectFunkNz = function() {
        const input = document.getElementById('chat-target-input');
        const target = input ? input.value.trim() : '';
        if (!target) return;
        window.openPrivateChatNz(target);
    };

    let nzTradeListener = null;
    let nzLatestMessages = [];
    let nzLatestTrades = [];

    function renderMergedChat() {
        const win = document.getElementById('chat-window');
        if (!win) return;
        const mySlug = window.agentSlug(window.agentName);
        const eintraege = [];
        nzLatestMessages.forEach(m => eintraege.push({ art: 'nachricht', ts: m.ts, data: m }));
        nzLatestTrades.forEach(t => eintraege.push({ art: 'handel', ts: t.createdAt || 0, data: t }));
        eintraege.sort((a, b) => a.ts - b.ts);

        win.innerHTML = '';
        eintraege.forEach(e => {
            if (e.art === 'nachricht') {
                const data = e.data;
                const isMe = (data.absender === window.agentName);
                const msgDiv = document.createElement('div');
                msgDiv.style.cssText = isMe ? "color:#aaa; align-self:flex-end; text-align:right;" : "color:#0f8; align-self:flex-start; text-align:left;";
                const senderEl = document.createElement('b');
                senderEl.textContent = (isMe ? 'Du' : String(data.absender || '')) + ': ';
                const textEl = document.createElement('span');
                textEl.textContent = String(data.text || '');
                msgDiv.appendChild(senderEl);
                msgDiv.appendChild(textEl);
                win.appendChild(msgDiv);
            } else {
                const a = e.data;
                const istEmpfaenger = (a.an === mySlug);
                const kartenDiv = document.createElement('div');
                kartenDiv.style.cssText = 'align-self:center; width:90%; border:1px solid #b0f; border-radius:6px; padding:8px; background:rgba(187,0,255,0.08); font-size:0.9em;';
                let inhaltHtml = '💱 <b>Handelsangebot</b><br>' +
                    window.escHtml(a.von) + ' will <b>' + a.willMenge + ' ' + HANDEL_LABEL[a.willTyp] + '</b>, bietet dafür <b>' + a.bietetMenge + ' ' + HANDEL_LABEL[a.bietetTyp] + '</b>.';
                if (a.status === 'offen' && istEmpfaenger) {
                    inhaltHtml += '<div style="display:flex; gap:5px; margin-top:6px;">' +
                        '<button class="modell-btn" style="flex:1; border-color:#0f8; color:#0f8;" onclick="window.handelAnnehmen(\'' + a.id + '\')">ANNEHMEN</button>' +
                        '<button class="modell-btn" style="flex:1; border-color:#f44; color:#f44;" onclick="window.handelAblehnen(\'' + a.id + '\')">ABLEHNEN</button>' +
                    '</div>';
                } else if (a.status === 'offen' && !istEmpfaenger) {
                    inhaltHtml += '<div style="margin-top:6px; opacity:0.8;">Warte auf Antwort...</div>' +
                        '<button class="modell-btn" style="width:100%; margin-top:6px; border-color:#f44; color:#f44;" onclick="window.handelStornieren(\'' + a.id + '\')">ZURÜCKZIEHEN</button>';
                } else if (a.status === 'angenommen') {
                    inhaltHtml += '<div style="margin-top:6px; color:#0f8; font-weight:bold;">✓ Handelsangebot angenommen</div>';
                } else if (a.status === 'abgelehnt') {
                    inhaltHtml += '<div style="margin-top:6px; color:#f44; font-weight:bold;">✗ Handelsangebot abgelehnt</div>';
                } else if (a.status === 'storniert') {
                    inhaltHtml += '<div style="margin-top:6px; color:#888; font-weight:bold;">Zurückgezogen</div>';
                }
                kartenDiv.innerHTML = inhaltHtml;
                win.appendChild(kartenDiv);
            }
        });
        win.scrollTop = win.scrollHeight;
    }

    window.openPrivateChatNz = function(targetAgentName) {
        const myName = window.agentSlug(window.agentName);
        const targetName = window.agentSlug(targetAgentName);
        const channelId = [myName, targetName].sort().join("_");
        window.currentChatTarget = targetName;

        if (window.db) {
            window.setDoc(window.doc(window.db, "agenten_funk", channelId), { ungelesen_fuer: "" }, { merge: true });
        }
        if (nzChatListListener) { nzChatListListener(); nzChatListListener = null; }

        const content = document.getElementById('netzwerk-content');
        if (!content) return;
        content.innerHTML = `
            <h3 style="color: #0f8; margin-top:0;">[ FUNK: <span id="chat-target-name"></span> ]</h3>
            <div id="chat-window" style="height: 280px; border: 1px solid #0f8; background: rgba(0,0,0,0.8); margin-bottom: 10px; padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; text-align: left; font-size: 0.8em;"></div>
            <div style="display: flex; gap: 5px;">
                <button onclick="window.openHandelAusChat && window.openHandelAusChat('${targetName}')" title="Handelsangebot senden" style="background:none; border:1px solid #b0f; color:#b0f; border-radius:4px; cursor:pointer; padding:0 10px; font-size:1.2em;">💱</button>
                <input type="text" id="msg-input" placeholder="Nachricht..." autocomplete="off" style="flex-grow: 1; background: #000; border: 1px solid #0f8; color: #0f8; padding: 8px; font-family: monospace; outline: none;">
                <button class="modell-btn" id="chat-send-btn" style="margin: 0; width: auto; padding: 0 15px;">SENDEN</button>
            </div>
            <button class="modell-btn" style="margin-top: 15px; border-style: dashed; width:100%;" onclick="if(window.currentChatListener) window.currentChatListener(); if(window.currentTradeListener) window.currentTradeListener(); window.switchNetzwerkTab('chat');">FUNK TRENNEN</button>
        `;
        document.getElementById('chat-target-name').textContent = targetAgentName.toUpperCase();
        document.getElementById('chat-send-btn').addEventListener('click', () => window.sendMsgNz(channelId, targetName));
        const msgInput = document.getElementById('msg-input');
        if (msgInput) msgInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') window.sendMsgNz(channelId, targetName); });

        nzLatestMessages = [];
        nzLatestTrades = [];

        if (window.db) {
            if (nzCurrentChatListener) nzCurrentChatListener();
            const q = window.query(window.collection(window.db, "agenten_funk", channelId, "nachrichten"), window.orderBy("zeitstempel", "asc"), window.limit(50));
            nzCurrentChatListener = window.onSnapshot(q, (snapshot) => {
                nzLatestMessages = snapshot.docs.map(d => {
                    const data = d.data();
                    const tsMillis = (data.zeitstempel && typeof data.zeitstempel.toMillis === 'function') ? data.zeitstempel.toMillis() : Date.now();
                    return { absender: data.absender, text: data.text, ts: tsMillis };
                });
                renderMergedChat();
            });

            // Handelsangebote zwischen mir und diesem Chat-Partner - ALLE Status (nicht nur
            // "offen"), damit angenommene/abgelehnte/zurückgezogene Angebote als dauerhafter
            // Eintrag im Chat-Verlauf stehen bleiben, genau wie eine Nachricht. Firestore erlaubt
            // nur eine einzige "in"-Klausel pro Abfrage, deshalb zwei getrennte Listener
            // (einmal pro Richtung), die zusammengeführt werden.
            if (nzTradeListener) nzTradeListener();
            let nzTradesAusgehend = [], nzTradesEingehend = [];
            const mergeTrades = () => { nzLatestTrades = [...nzTradesAusgehend, ...nzTradesEingehend]; renderMergedChat(); };
            const qAusgehend = window.query(window.collection(window.db, "handelsangebote"), window.where('von', '==', myName), window.where('an', '==', targetName));
            const qEingehend = window.query(window.collection(window.db, "handelsangebote"), window.where('von', '==', targetName), window.where('an', '==', myName));
            const unsub1 = window.onSnapshot(qAusgehend, (snapshot) => { nzTradesAusgehend = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); mergeTrades(); });
            const unsub2 = window.onSnapshot(qEingehend, (snapshot) => { nzTradesEingehend = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); mergeTrades(); });
            nzTradeListener = () => { unsub1(); unsub2(); };
        }
        window.currentChatListener = nzCurrentChatListener;
        window.currentTradeListener = nzTradeListener;
    };

    window.sendMsgNz = async function(channelId, targetName) {
        const inp = document.getElementById('msg-input');
        const text = inp.value.trim();
        if (text === "" || !window.db) return;
        inp.value = "";
        try {
            const myName = window.agentSlug(window.agentName);
            // WICHTIG: Erst den Kanal mit "teilnehmer" versehen, DANN die Nachricht schreiben -
            // die Sicherheitsregel für /nachrichten prüft, ob der Sender bereits im
            // "teilnehmer"-Feld des Kanal-Dokuments steht. Bei der allerersten Nachricht eines
            // neuen Chats existierte dieses Feld vorher noch gar nicht (nur "ungelesen_fuer" aus
            // dem Platzhalter-Dokument) - der Schreibvorgang wurde dadurch für JEDE erste
            // Nachricht eines neuen Chats von der Regel abgelehnt, ohne dass das im Interface
            // sichtbar wurde.
            const channelRef = window.doc(window.db, "agenten_funk", channelId);
            await window.setDoc(channelRef, {
                teilnehmer: [myName, targetName],
                ungelesen_fuer: targetName,
                last_ping: Date.now()
            }, { merge: true });
            const msgRef = window.collection(window.db, "agenten_funk", channelId, "nachrichten");
            await window.addDoc(msgRef, { absender: window.agentName, text: text, zeitstempel: window.serverTimestamp() });
        } catch (e) { console.error(e); }
    };

    window.deleteChatNz = function(targetName) {
        window.zeigeBestaetigung(`Kanal mit ${targetName.toUpperCase()} wirklich im Briefkasten löschen?`, async () => {
            const myName = window.agentSlug(window.agentName);
            const channelId = [myName, targetName].sort().join("_");
            if (window.db && window.getDocs && window.deleteDoc) {
                try {
                    const msgRef = window.collection(window.db, "agenten_funk", channelId, "nachrichten");
                    const snapshot = await window.getDocs(msgRef);
                    await Promise.all(snapshot.docs.map(mDoc => window.deleteDoc(mDoc.ref)));
                    await window.deleteDoc(window.doc(window.db, "agenten_funk", channelId));
                } catch (e) { console.error(e); }
            }
            renderKommLinkUebersicht();
        });
    };

    // --- SEKTOR-RADAR (ebenfalls aus app.js portiert) ---
    let nzRadarListener = null;
    window.renderRadarViewNz = function() {
        const content = document.getElementById('netzwerk-content');
        if (!content) return;
        content.innerHTML = `
            <h3 style="color: #ffcc00; margin-top:0;">[ SEKTOR-RADAR ]</h3>
            <div id="radar-container" style="position: relative; height: 150px; border: 1px solid rgba(255,204,0,0.3); background: rgba(0,20,0,0.5); margin-bottom: 15px; overflow: hidden; border-radius: 4px;">
                <div style="position: absolute; width: 100%; height: 100%; background: conic-gradient(from 0deg, transparent, rgba(255,204,0,0.1)); animation: radar-spin-nz 4s linear infinite;"></div>
                <div id="radar-agents" style="position: absolute; width: 100%; height: 100%;"></div>
            </div>
            <div id="online-list" style="max-height: 150px; overflow-y: auto; text-align: left;"></div>
            <button class="modell-btn" style="width:100%; margin-top:10px;" onclick="if(window.currentRadarListenerNz) window.currentRadarListenerNz(); window.switchNetzwerkTab('chat');">RADAR DEAKTIVIEREN</button>
        `;
        if (!document.getElementById('nz-radar-keyframe')) {
            const styleTag = document.createElement('style');
            styleTag.id = 'nz-radar-keyframe';
            styleTag.textContent = '@keyframes radar-spin-nz { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
            document.head.appendChild(styleTag);
        }
        if (!window.db) return;
        const listEl = document.getElementById('online-list');
        const radarAgents = document.getElementById('radar-agents');
        if (window.currentRadarListenerNz) window.currentRadarListenerNz();

        const agentRef = window.collection(window.db, "agenten");
        window.currentRadarListenerNz = window.onSnapshot(agentRef, (snapshot) => {
            const now = Date.now();
            let htmlList = "", htmlRadar = "", count = 0;
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.last_ping && (now - data.last_ping < 120000) && doc.id !== window.agentSlug(window.agentName)) {
                    count++;
                    const top = Math.floor(Math.random() * 70) + 15, left = Math.floor(Math.random() * 70) + 15;
                    htmlRadar += `<div style="position: absolute; top:${top}%; left:${left}%; width:6px; height:6px; background:#0f8; border-radius:50%; box-shadow:0 0 5px #0f8;"></div>`;
                    htmlList += `<div style="color:#0f8; cursor:pointer; padding:3px 0;" onclick="window.openPrivateChatNz('${doc.id.toUpperCase()}')">> ${window.escHtml(doc.id.toUpperCase())} (Online)</div>`;
                }
            });
            if (listEl) listEl.innerHTML = count > 0 ? htmlList : '<div style="color:#555; font-size:0.8em;">Keine Agenten im Sektor...</div>';
            if (radarAgents) radarAgents.innerHTML = htmlRadar;
        });
    };
})();
