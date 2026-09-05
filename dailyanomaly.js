// ============================================================
// TÄGLICHE ZEITANOMALIE: fünfter Eintrag im normalen Missionsmenü. Läuft wie eine normale
// GPS-Mission (Karte, Kompass, volle AR-Kamera), nutzt dafür die bestehende
// startGpsMission()-Maschinerie aus app.js, nur mit einem festen, einmal pro Tag generierten
// Zielpunkt (300-800m) statt eines bei jedem Versuch neu ausgewürfelten.
//
// Datenmodell: ein einzelnes Feld "taeglicheAnomalie" auf dem agenten/{slug}-Dokument -
// { datum: "YYYY-MM-DD", zielLat, zielLng, status: 'offen'|'abgeschlossen'|'abgebrochen', streak }
// ============================================================

(function() {
    // Belohnung steigt mit der Streak bis Tag 7, danach bleibt sie auf Tag-7-Niveau stehen
    // (kein Zurückfallen auf Tag 1, aber auch kein unbegrenztes Wachstum). Bewusst OHNE
    // Chronos-Zellen - die bleiben laut Vorgabe Basis-exklusiv.
    const BELOHNUNGS_TABELLE = {
        1: { credits: 100,  materiezellen: 1 },
        2: { credits: 250,  materiezellen: 1 },
        3: { credits: 400,  materiezellen: 2 },
        4: { credits: 550,  materiezellen: 2 },
        5: { credits: 700,  materiezellen: 3 },
        6: { credits: 850,  materiezellen: 4 },
        7: { credits: 1000, materiezellen: 5 }
    };

    function heutigesDatum() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function tagImZyklus(streak) {
        return Math.min(streak, 7);
    }

    let aktuellerStand = null; // { datum, zielLat, zielLng, status, streak }
    let frischerStandort = null;

    function holeFrischenStandort() {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((pos) => {
            frischerStandort = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }, () => {}, { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 });
    }

    async function sucheOeffentlichenOrt(lat, lng) {
        const query = '[out:json][timeout:15];(way["highway"~"^(primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service|track)$"]["access"!~"^(private|no)$"](around:1200,' + lat + ',' + lng + '););out geom;';
        try {
            const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(query) });
            const data = await response.json();
            const kandidaten = [];
            (data.elements || []).forEach(el => {
                if (!el.geometry) return;
                el.geometry.forEach(node => {
                    const d = haversineDA(lat, lng, node.lat, node.lon);
                    if (d >= 300 && d <= 800) kandidaten.push({ lat: node.lat, lng: node.lon });
                });
            });
            if (kandidaten.length > 0) return kandidaten[Math.floor(Math.random() * kandidaten.length)];
        } catch (e) { console.error('Anomalie-Standortsuche fehlgeschlagen:', e); }
        return null;
    }

    function haversineDA(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    async function pruefeUndErzeugeTaeglicheAnomalie() {
        if (!window.db || !window.agentName) return;
        holeFrischenStandort();
        const mySlug = window.agentSlug(window.agentName);
        try {
            const ref = window.doc(window.db, "agenten", mySlug);
            const snap = await window.getDoc(ref);
            const data = snap.exists() ? snap.data() : {};
            const bestehend = data.taeglicheAnomalie || null;
            const heute = heutigesDatum();

            if (bestehend && bestehend.datum === heute) {
                aktuellerStand = bestehend;
                return;
            }

            let neueStreak = 1;
            if (bestehend && bestehend.status === 'abgeschlossen') {
                const gestern = new Date(Date.now() - 86400000);
                const gesternStr = gestern.getFullYear() + '-' + String(gestern.getMonth() + 1).padStart(2, '0') + '-' + String(gestern.getDate()).padStart(2, '0');
                if (bestehend.datum === gesternStr) neueStreak = (bestehend.streak || 1) + 1;
            }

            let meinLat, meinLng;
            for (let i = 0; i < 15 && !frischerStandort; i++) await new Promise(r => setTimeout(r, 200));
            if (frischerStandort) { meinLat = frischerStandort.lat; meinLng = frischerStandort.lng; }
            else { meinLat = data.lat; meinLng = data.lon; }
            if (meinLat === undefined || meinLat === null) return;

            const ziel = await sucheOeffentlichenOrt(meinLat, meinLng);
            if (!ziel) return;

            const neuerStand = { datum: heute, zielLat: ziel.lat, zielLng: ziel.lng, status: 'offen', streak: neueStreak };
            await window.setDoc(ref, { taeglicheAnomalie: neuerStand }, { merge: true });
            aktuellerStand = neuerStand;

            const navBtn = document.getElementById('missionen-nav-btn');
            if (navBtn) navBtn.classList.add('status-warn-pulse');
        } catch (e) { console.error('Tägliche Zeitanomalie konnte nicht geprüft/erzeugt werden:', e); }
    }

    window.renderTaeglicheAnomalieEintrag = async function() {
        const container = document.getElementById('taegliche-anomalie-eintrag');
        if (!container) return;
        if (!aktuellerStand) await pruefeUndErzeugeTaeglicheAnomalie();
        if (!aktuellerStand) {
            container.innerHTML = '';
            return;
        }
        const tag = tagImZyklus(aktuellerStand.streak);
        const verfuegbar = (aktuellerStand.status === 'offen');
        const farbe = '#ffe066';

        if (verfuegbar) {
            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;border:1px solid ${farbe};background:rgba(0,0,0,0.3);border-radius:6px;padding:12px;">
                    <button class="modell-btn" style="flex:1;margin:0;border-color:${farbe};color:${farbe};text-align:left;padding:12px;" onclick="window.taeglicheAnomalieStarten()">⏳ Tägliche Zeitanomalie<br><span style="font-size:0.7em;opacity:0.7;">Tag ${tag} · Streak: ${aktuellerStand.streak} · 300 m - 800 m</span></button>
                    <button onclick="window.zeigeTaeglicheAnomalieUebersicht()" style="background:none;border:none;cursor:pointer;padding:5px;font-size:1.8em;" title="7-Tage-Übersicht">📦</button>
                </div>`;
        } else {
            const hinweis = (aktuellerStand.status === 'abgeschlossen') ? 'Bereits erledigt heute' : 'Nicht mehr verfügbar heute';
            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;border:1px solid #444;background:rgba(0,0,0,0.2);border-radius:6px;padding:12px; opacity:0.6;">
                    <div style="flex:1;text-align:left;padding:12px;color:#888;">⏳ Tägliche Zeitanomalie<br><span style="font-size:0.7em;">${hinweis} · Streak: ${aktuellerStand.streak}</span></div>
                    <button onclick="window.zeigeTaeglicheAnomalieUebersicht()" style="background:none;border:none;cursor:pointer;padding:5px;font-size:1.8em;" title="7-Tage-Übersicht">📦</button>
                </div>`;
        }
    };

    window.taeglicheAnomalieStarten = function() {
        if (!aktuellerStand || aktuellerStand.status !== 'offen') return;
        window.dailyAnomalyLat = aktuellerStand.zielLat;
        window.dailyAnomalyLng = aktuellerStand.zielLng;
        const tag = tagImZyklus(aktuellerStand.streak);
        const belohnung = BELOHNUNGS_TABELLE[tag];
        window.missionLootTables.taeglich = { level: 0, xp: 0, credits: belohnung.credits, materiezellen: belohnung.materiezellen };
        window.startGpsMission('taeglich');
    };

    window.taeglicheAnomalieAbgeschlossen = async function() {
        if (!aktuellerStand || !window.db || !window.agentName) return;
        aktuellerStand.status = 'abgeschlossen';
        try {
            await window.setDoc(window.doc(window.db, "agenten", window.agentSlug(window.agentName)), {
                taeglicheAnomalie: aktuellerStand
            }, { merge: true });
        } catch (e) { console.error(e); }
    };

    window.taeglicheAnomalieAbgebrochen = async function() {
        if (!aktuellerStand || !window.db || !window.agentName) return;
        aktuellerStand.status = 'abgebrochen';
        try {
            await window.setDoc(window.doc(window.db, "agenten", window.agentSlug(window.agentName)), {
                taeglicheAnomalie: aktuellerStand
            }, { merge: true });
        } catch (e) { console.error(e); }
        if (typeof window.renderTaeglicheAnomalieEintrag === 'function') window.renderTaeglicheAnomalieEintrag();
    };

    window.zeigeTaeglicheAnomalieUebersicht = function() {
        const streak = aktuellerStand ? aktuellerStand.streak : 1;
        const heutigerTag = tagImZyklus(streak);
        let items = '';
        for (let tag = 1; tag <= 7; tag++) {
            const b = BELOHNUNGS_TABELLE[tag];
            const istHeute = (tag === heutigerTag);
            items += `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-radius:4px; ${istHeute ? 'border:2px solid #ffe066; box-shadow:0 0 10px rgba(255,224,102,0.5);' : 'border:1px solid rgba(255,224,102,0.25);'}">
                <span style="color:${istHeute ? '#ffe066' : '#ccc'}; font-weight:${istHeute ? 'bold' : 'normal'};">Tag ${tag}${istHeute ? ' (heute)' : ''}</span>
                <span style="color:#dfffef; font-size:0.9em;">${b.credits} Credits · ${b.materiezellen} MZ</span>
            </div>`;
        }

        const popup = document.getElementById('loot-popup');
        const popupContent = document.getElementById('loot-popup-content');
        if (!popup || !popupContent) return;
        popupContent.innerHTML = `
            <div style="color:#ffe066;font-weight:bold;font-size:1.1em;margin-bottom:15px;text-align:center;">⏳ Tägliche Zeitanomalie - 7 Tage</div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:0.9em;">${items}</div>
            <div style="font-size:0.7em;color:#aaa;margin-top:15px;text-align:center;">Ab Tag 7 bleibt die Belohnung auf diesem Niveau, solange die Streak nicht abreißt.</div>
            <button class="modell-btn" style="margin-top:15px;" onclick="window.closeLootPopup()">Schließen</button>
        `;
        popup.style.display = 'flex';
    };

    (function warteAufLoginFuerAnomalie() {
        if (window.isAgentVerified && window.db && window.agentName) {
            pruefeUndErzeugeTaeglicheAnomalie();
        } else {
            setTimeout(warteAufLoginFuerAnomalie, 1000);
        }
    })();
})();
