// ============================================================
// DUAL-MISSION: lokaler GPS-Koop zwischen zwei Spielern.
// Ersetzt "Galaktische Mission" im Missions-Menü. Zwei Wege, eine Einladung zu starten
// (direkt per Namenssuche, oder automatisch an den nächstgelegenen Spieler), eine gemeinsame
// Anomalie an einem echten, öffentlichen Ort. Beide Spieler sehen sich gegenseitig live auf der
// Karte. "Radar starten" ist erst möglich, wenn BEIDE nah genug am Ziel sind. Die eigentliche
// Extraktion läuft über dasselbe AR-Kamera-System wie bei normalen Missionen (siehe app.js,
// startArMission/completeExtraction) - beide Spieler müssen dafür gleichzeitig den
// Extrahieren-Button halten; rutscht einer weg oder lässt vorzeitig los, bricht der Versuch für
// beide ab und muss neu zentriert werden.
// ============================================================

(function() {
    const SCAN_RADIUS_M = 25;
    let dualMissionWatchId = null;
    let dualMissionCheckInterval = null;
    let currentDualMissionId = null;
    let dualMissionMap = null;

    function haversineDM(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // --- Menü öffnen ---
    // Frischer GPS-Ping direkt vom Gerät - wird SOFORT beim Öffnen des Dual-Mission-Menüs
    // angefordert (nicht erst später), damit er bereit ist, sobald der Spieler eine Option
    // wählt. Ersetzt die vorherige Abhängigkeit vom serverseitig gespeicherten lat/lon (das nur
    // beim Login per IP-Ortung gesetzt wird und oft fehlt oder veraltet ist).
    let frischerStandort = null;
    function holeFrischenStandort() {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((pos) => {
            frischerStandort = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        }, () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 });
    }

    window.openDualMissionMenu = function() {
        holeFrischenStandort();
        const modal = document.getElementById('dual-mission-start-modal');
        const inhalt = document.getElementById('dual-mission-start-inhalt');
        if (!modal || !inhalt) return;
        inhalt.innerHTML =
            '<div style="display:flex; gap:5px; margin-bottom:10px;">' +
                '<input type="text" id="dual-mission-such-name" placeholder="Spielername..." style="flex-grow:1; background:#000; border:1px solid #b0f; color:#e0c0ff; padding:8px; font-family:inherit;">' +
                '<button class="modell-btn" style="border-color:#b0f; color:#b0f;" onclick="window.dualMissionEinladenDirekt()">EINLADEN</button>' +
            '</div>' +
            '<button class="modell-btn" style="width:100%; border-color:#b0f; color:#b0f;" onclick="window.dualMissionZufaellig()">🎲 ZUFÄLLIGEN SPIELER IN DER NÄHE FINDEN</button>' +
            '<div id="dual-mission-start-status" style="font-size:0.75em; color:#aaa; margin-top:10px;"></div>';
        modal.style.display = 'flex';
    };

    // --- Einladung: direkt per Namenssuche ---
    window.dualMissionEinladenDirekt = async function() {
        const input = document.getElementById('dual-mission-such-name');
        const status = document.getElementById('dual-mission-start-status');
        const name = input ? input.value.trim() : '';
        if (!name) return;
        const zielSlug = window.agentSlug(name);
        const mySlug = window.agentSlug(window.agentName);
        if (zielSlug === mySlug) { status.innerText = 'Du kannst nicht dich selbst einladen.'; return; }
        status.innerText = 'Suche Agent...';
        try {
            const snap = await window.getDoc(window.doc(window.db, "agenten", zielSlug));
            if (!snap.exists()) { status.innerText = 'Kein Agent mit diesem Namen gefunden.'; return; }
            await erstelleDualMissionEinladung(zielSlug, 'direkt', frischerStandort ? frischerStandort.lat : undefined, frischerStandort ? frischerStandort.lon : undefined);
            status.innerText = 'Einladung an ' + name + ' gesendet.';
        } catch (e) {
            console.error(e);
            status.innerText = 'Einladung fehlgeschlagen.';
        }
    };

    // --- Einladung: zufälligen, nächstgelegenen Spieler finden ---
    // Für die EIGENE Position wird jetzt der frische GPS-Ping genutzt (siehe oben), nicht mehr
    // das ggf. fehlende serverseitige lat/lon. Für ANDERE Spieler bleibt nur deren zuletzt
    // bekannter Näherungsstandort verfügbar, da keine kontinuierliche Live-GPS-Verfolgung aller
    // Spieler mitgeführt wird.
    window.dualMissionZufaellig = async function() {
        const status = document.getElementById('dual-mission-start-status');
        status.innerText = 'Suche nächstgelegenen Agenten...';
        const mySlug = window.agentSlug(window.agentName);
        try {
            let meinLat, meinLon;
            if (frischerStandort) {
                meinLat = frischerStandort.lat; meinLon = frischerStandort.lon;
            } else {
                // Frischer Ping noch nicht eingetroffen - kurz nachfragen, dann auf den
                // serverseitigen Näherungsstandort als letzten Ausweg zurückfallen.
                await new Promise(r => setTimeout(r, 1500));
                if (frischerStandort) { meinLat = frischerStandort.lat; meinLon = frischerStandort.lon; }
                else {
                    const mySnap = await window.getDoc(window.doc(window.db, "agenten", mySlug));
                    const myData = mySnap.exists() ? mySnap.data() : {};
                    meinLat = myData.lat; meinLon = myData.lon;
                }
            }
            if (meinLat === undefined || meinLat === null || meinLon === undefined || meinLon === null) {
                status.innerText = 'Standort konnte nicht ermittelt werden - bitte GPS-Zugriff erlauben und erneut versuchen.';
                return;
            }
            const allSnap = await window.getDocs(window.collection(window.db, "agenten"));
            let bester = null, besteDist = Infinity;
            allSnap.forEach(d => {
                if (d.id === mySlug) return;
                const data = d.data();
                if (data.lat === undefined || data.lon === undefined) return;
                const dist = haversineDM(meinLat, meinLon, data.lat, data.lon);
                if (dist < besteDist) { besteDist = dist; bester = d.id; }
            });
            if (!bester) { status.innerText = 'Kein anderer Agent mit bekanntem Standort gefunden.'; return; }
            await erstelleDualMissionEinladung(bester, 'zufaellig', meinLat, meinLon);
            status.innerText = 'Anfrage an nächstgelegenen Agenten gesendet (' + Math.round(besteDist/1000) + ' km entfernt).';
        } catch (e) {
            console.error(e);
            status.innerText = 'Suche fehlgeschlagen.';
        }
    };

    async function erstelleDualMissionEinladung(zielSlug, typ, meinLatOverride, meinLonOverride) {
        const mySlug = window.agentSlug(window.agentName);
        let vonLat = meinLatOverride, vonLon = meinLonOverride;
        if (vonLat === undefined || vonLat === null) {
            if (frischerStandort) { vonLat = frischerStandort.lat; vonLon = frischerStandort.lon; }
            else {
                const mySnap = await window.getDoc(window.doc(window.db, "agenten", mySlug));
                const myData = mySnap.exists() ? mySnap.data() : {};
                vonLat = myData.lat; vonLon = myData.lon;
            }
        }
        await window.addDoc(window.collection(window.db, "dual_missionen"), {
            von: mySlug, an: zielSlug, typ: typ, status: 'offen',
            vonLat: vonLat || null, vonLon: vonLon || null,
            gescanntVon: [], createdAt: Date.now()
        });
        if (typeof window.logEreignis === 'function') window.logEreignis('Dual-Mission gestartet (Einladung an ' + zielSlug + ').');
    }

    // --- Eingehende Einladungen prüfen (Polling, alle 15s, solange eingeloggt) ---
    let letzteAngezeigteId = null;
    function pruefeEingehendeDualMissionen() {
        if (!window.db || !window.agentName || currentDualMissionId) return;
        const mySlug = window.agentSlug(window.agentName);
        window.getDocs(window.query(window.collection(window.db, "dual_missionen"), window.where('an', '==', mySlug), window.where('status', '==', 'offen')))
            .then(snap => {
                if (snap.empty) return;
                const d = snap.docs[0];
                if (d.id === letzteAngezeigteId) return;
                letzteAngezeigteId = d.id;
                const a = d.data();
                const text = (a.typ === 'direkt')
                    ? 'Direkte Einladung von ' + a.von
                    : 'Zufällige Anfrage aus deiner Nähe';
                const modal = document.getElementById('dual-mission-invite-modal');
                const textEl = document.getElementById('dual-mission-invite-text');
                if (modal && textEl) {
                    textEl.innerText = text;
                    modal.dataset.missionId = d.id;
                    modal.style.display = 'flex';
                }
            }).catch(() => {});
        // Auch aktive (angenommene) eigene Missionen prüfen, um nach einem Reload wieder
        // anzuknüpfen.
        window.getDocs(window.query(window.collection(window.db, "dual_missionen"), window.where('an', '==', mySlug), window.where('status', '==', 'angenommen')))
            .then(snap => { if (!snap.empty && !currentDualMissionId) starteDualMissionNavigation(snap.docs[0].id, snap.docs[0].data()); }).catch(() => {});
        window.getDocs(window.query(window.collection(window.db, "dual_missionen"), window.where('von', '==', mySlug), window.where('status', '==', 'angenommen')))
            .then(snap => { if (!snap.empty && !currentDualMissionId) starteDualMissionNavigation(snap.docs[0].id, snap.docs[0].data()); }).catch(() => {});
    }
    dualMissionCheckInterval = setInterval(pruefeEingehendeDualMissionen, 15000);

    window.dualMissionAntworten = async function(angenommen) {
        const modal = document.getElementById('dual-mission-invite-modal');
        const missionId = modal ? modal.dataset.missionId : null;
        if (modal) modal.style.display = 'none';
        if (!missionId) return;
        letzteAngezeigteId = null;
        try {
            if (!angenommen) {
                await window.setDoc(window.doc(window.db, "dual_missionen", missionId), { status: 'abgelehnt' }, { merge: true });
                return;
            }
            const ref = window.doc(window.db, "dual_missionen", missionId);
            const snap = await window.getDoc(ref);
            const a = snap.data();
            // Zielort anhand des Standorts des Einladenden suchen (echter, öffentlicher Ort).
            const ziel = await sucheOeffentlichenOrt(a.vonLat, a.vonLon);
            if (!ziel) { window.zeigeInfo('Konnte keinen geeigneten öffentlichen Zielort finden. Bitte später erneut versuchen.'); return; }
            await window.setDoc(ref, { status: 'angenommen', zielLat: ziel.lat, zielLng: ziel.lng }, { merge: true });
            starteDualMissionNavigation(missionId, { ...a, zielLat: ziel.lat, zielLng: ziel.lng });
        } catch (e) {
            console.error(e);
            window.zeigeInfo('Aktion fehlgeschlagen.');
        }
    };

    async function sucheOeffentlichenOrt(lat, lng) {
        if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
        const radius = 5000; // 5 km, wie gewünscht
        const query = '[out:json][timeout:15];(way["highway"~"^(primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service)$"]["access"!~"^(private|no)$"](around:' + radius + ',' + lat + ',' + lng + '););out geom;';
        try {
            const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(query) });
            const data = await response.json();
            const candidates = [];
            (data.elements || []).forEach(el => {
                if (el.geometry) el.geometry.forEach(node => candidates.push({ lat: node.lat, lng: node.lon }));
            });
            if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
        } catch (e) {}
        return null;
    }

    // --- Navigation zum gemeinsamen Ziel: eigene UND fremde Live-Position auf der Karte,
    // "RADAR STARTEN" erst wenn BEIDE nah genug am Ziel sind ---
    let dualMissionZielA = null;
    let dualMissionOtherMarker = null;
    let dualMissionPosWriteInterval = null;
    let dualMissionOtherCheckInterval = null;
    let dualMissionMeineDistanz = Infinity;
    let dualMissionAndereDistanz = Infinity;

    function starteDualMissionNavigation(missionId, a) {
        currentDualMissionId = missionId;
        dualMissionZielA = a;
        const modal = document.getElementById('dual-mission-active-modal');
        const inhalt = document.getElementById('dual-mission-active-inhalt');
        if (!modal || !inhalt) return;
        modal.style.display = 'flex';
        inhalt.innerHTML =
            '<div id="dual-mission-map" style="width:100%; height:200px; margin-bottom:10px; border:1px solid #b0f;"></div>' +
            '<div id="dual-mission-distanz" style="color:#e0c0ff; margin-bottom:4px;">Suche GPS-Signal...</div>' +
            '<div id="dual-mission-distanz-anderer" style="color:#888; font-size:0.8em; margin-bottom:10px;">Position des anderen Agenten wird geladen...</div>' +
            '<button class="modell-btn" id="dual-mission-radar-btn" style="width:100%; border-color:#0f8; color:#0f8;" onclick="window.dualMissionRadarStarten()">RADAR STARTEN</button>';

        if (dualMissionMap) { dualMissionMap.remove(); dualMissionMap = null; }
        dualMissionMap = L.map('dual-mission-map', { zoomControl: false, attributionControl: false }).setView([a.zielLat, a.zielLng], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22 }).addTo(dualMissionMap);
        L.marker([a.zielLat, a.zielLng], { icon: L.divIcon({ className: 'gps-target-marker', iconSize: [18,18] }) }).addTo(dualMissionMap);

        const mySlug = window.agentSlug(window.agentName);
        let myMarker = null;

        if (dualMissionWatchId !== null) navigator.geolocation.clearWatch(dualMissionWatchId);
        dualMissionWatchId = navigator.geolocation.watchPosition((pos) => {
            const lat = pos.coords.latitude, lng = pos.coords.longitude;
            dualMissionMeineDistanz = haversineDM(lat, lng, a.zielLat, a.zielLng);
            const distEl = document.getElementById('dual-mission-distanz');
            if (distEl) distEl.innerText = 'Deine Entfernung zur Anomalie: ' + Math.round(dualMissionMeineDistanz) + ' m';
            if (!myMarker) myMarker = L.marker([lat, lng], { icon: L.divIcon({ className: 'gps-player-marker', iconSize: [16,16] }) }).addTo(dualMissionMap);
            else myMarker.setLatLng([lat, lng]);
        }, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });

        // Eigene Position regelmäßig für den anderen Spieler in Firestore hinterlegen.
        if (dualMissionPosWriteInterval) clearInterval(dualMissionPosWriteInterval);
        dualMissionPosWriteInterval = setInterval(() => {
            if (gpsLetzterStand) {
                window.setDoc(window.doc(window.db, "dual_missionen", missionId), {
                    pos: { [mySlug]: { lat: gpsLetzterStand.lat, lng: gpsLetzterStand.lng, ts: Date.now() } }
                }, { merge: true }).catch(() => {});
            }
        }, 4000);

        // Position des anderen Spielers regelmäßig abrufen und als zweiten Marker anzeigen.
        if (dualMissionOtherCheckInterval) clearInterval(dualMissionOtherCheckInterval);
        dualMissionOtherCheckInterval = setInterval(async () => {
            try {
                const snap = await window.getDoc(window.doc(window.db, "dual_missionen", missionId));
                const d = snap.data();
                const andererSlug = (d.von === mySlug) ? d.an : d.von;
                const andererPos = (d.pos || {})[andererSlug];
                const distAnEl = document.getElementById('dual-mission-distanz-anderer');
                if (andererPos) {
                    dualMissionAndereDistanz = haversineDM(andererPos.lat, andererPos.lng, a.zielLat, a.zielLng);
                    if (distAnEl) distAnEl.innerText = andererSlug + ': ' + Math.round(dualMissionAndereDistanz) + ' m entfernt';
                    if (!dualMissionOtherMarker) dualMissionOtherMarker = L.marker([andererPos.lat, andererPos.lng], { icon: L.divIcon({ className: 'gps-player-marker', iconSize: [16,16], html: '<div style="filter:hue-rotate(200deg);"></div>' }) }).addTo(dualMissionMap);
                    else dualMissionOtherMarker.setLatLng([andererPos.lat, andererPos.lng]);
                } else if (distAnEl) {
                    distAnEl.innerText = andererSlug + ': Position noch unbekannt';
                }
            } catch (e) {}
        }, 4000);
    }

    // Zwischenspeicher der letzten eigenen Position (für den periodischen Firestore-Schreiber
    // oben, ohne einen zweiten watchPosition zu benötigen).
    // WICHTIG: Der Standort-Zugriff darf NICHT schon beim reinen Laden der Seite angefragt
    // werden - das schreckt Spieler ab, die noch gar nicht eingeloggt sind und den Eindruck
    // bekommen könnten, geortet zu werden, bevor sie überhaupt im Spiel sind. Erst NACH
    // erfolgreichem Login (window.isAgentVerified) startet die Anfrage, per Polling geprüft.
    let gpsLetzterStand = null;
    (function warteAufLoginFuerStandort() {
        if (window.isAgentVerified && navigator.geolocation) {
            navigator.geolocation.watchPosition((pos) => {
                gpsLetzterStand = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            }, () => {}, { enableHighAccuracy: false, maximumAge: 10000 });
        } else {
            setTimeout(warteAufLoginFuerStandort, 1000);
        }
    })();

    window.dualMissionRadarStarten = function() {
        if (dualMissionMeineDistanz > SCAN_RADIUS_M) {
            zeigeKleineInfo('Du bist noch zu weit von der Anomalie entfernt.');
            return;
        }
        if (dualMissionAndereDistanz > SCAN_RADIUS_M) {
            zeigeKleineInfo('Zweiter Agent fehlt noch.');
            return;
        }
        // Aufräumen der Navigations-Intervalle, AR-Modus übernimmt jetzt.
        if (dualMissionPosWriteInterval) { clearInterval(dualMissionPosWriteInterval); dualMissionPosWriteInterval = null; }
        if (dualMissionOtherCheckInterval) { clearInterval(dualMissionOtherCheckInterval); dualMissionOtherCheckInterval = null; }
        if (dualMissionWatchId !== null) { navigator.geolocation.clearWatch(dualMissionWatchId); dualMissionWatchId = null; }

        document.getElementById('dual-mission-active-modal').style.display = 'none';
        window.activeDualMissionId = currentDualMissionId;
        window.currentMissionType = 'normal'; // nur für evtl. Restformatierungen im AR-Overlay
        if (typeof window.startArMission === 'function') window.startArMission();
    };

    function zeigeKleineInfo(text) {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:99999; background:rgba(30,0,40,0.95); color:#e0c0ff; border:1px solid #b0f; box-shadow:0 0 20px rgba(187,0,255,0.5); padding:12px 20px; border-radius:6px; font-family:monospace; font-size:0.85em; text-align:center; max-width:90vw;';
        el.innerText = text;
        document.body.appendChild(el);
        setTimeout(() => { el.style.transition = 'opacity 1s ease-out'; el.style.opacity = '0'; setTimeout(() => el.remove(), 1000); }, 2500);
    }

    // --- Synchronisierte Extraktion: von app.js aufgerufen, sobald EIN Spieler 3s durchgehalten
    // hat. Beide müssen dies innerhalb eines kurzen Zeitfensters schaffen, sonst muss neu
    // zentriert und erneut gehalten werden. ---
    window.handleDualExtractionAttempt = async function() {
        if (!currentDualMissionId) return;
        const mySlug = window.agentSlug(window.agentName);
        const ref = window.doc(window.db, "dual_missionen", currentDualMissionId);
        const now = Date.now();
        try {
            await window.setDoc(ref, { bereit: { [mySlug]: now } }, { merge: true });
            const snap = await window.getDoc(ref);
            const a = snap.data();
            const andererSlug = (a.von === mySlug) ? a.an : a.von;
            const andererBereit = (a.bereit || {})[andererSlug];
            if (andererBereit && Math.abs(now - andererBereit) < 5000) {
                if (typeof window._arCompleteExtraction === 'function') window._arCompleteExtraction();
            } else {
                const bar = document.getElementById('ar-extract-bar');
                if (bar) bar.style.width = '0%';
                const inst = document.getElementById('ar-instructions');
                if (inst) inst.innerText = 'Warte auf den anderen Agenten - beide müssen gleichzeitig halten!';
            }
        } catch (e) { console.error(e); }
    };

    window.dualMissionMarkNotCharging = function() {
        if (!currentDualMissionId) return;
        const mySlug = window.agentSlug(window.agentName);
        window.setDoc(window.doc(window.db, "dual_missionen", currentDualMissionId), { bereit: { [mySlug]: null } }, { merge: true }).catch(() => {});
    };

    // Nach erfolgreicher, synchronisierter Extraktion (von app.js/completeExtraction aufgerufen).
    window.grantDualMissionReward = async function() {
        if (!currentDualMissionId) return;
        const missionId = currentDualMissionId;
        currentDualMissionId = null;
        const mySlug = window.agentSlug(window.agentName);
        try {
            const ref = window.doc(window.db, "dual_missionen", missionId);
            const snap = await window.getDoc(ref);
            const a = snap.data();
            const andererSlug = (a.von === mySlug) ? a.an : a.von;

            window.playerLevel = (window.playerLevel || 1) + 8;
            window.playerCredits = (window.playerCredits || 0) + 1500;
            window.playerMateriezellen = (window.playerMateriezellen || 0) + 10;
            await window.setDoc(window.doc(window.db, "agenten", mySlug), {
                lvl: window.playerLevel, credits: window.playerCredits, materiezellen: window.playerMateriezellen
            }, { merge: true });

            const andererSnap = await window.getDoc(window.doc(window.db, "agenten", andererSlug));
            const andererData = andererSnap.exists() ? andererSnap.data() : {};
            await window.setDoc(window.doc(window.db, "agenten", andererSlug), {
                lvl: (andererData.lvl || 1) + 8,
                credits: (andererData.credits || 0) + 1500,
                materiezellen: (andererData.materiezellen || 0) + 10
            }, { merge: true });

            await window.setDoc(ref, { status: 'abgeschlossen' }, { merge: true });
            window.zeigeInfo('🎉 DUAL-MISSION ABGESCHLOSSEN! +8 Level, +10 Materiezellen, +1.500 Credits.');
        } catch (e) {
            console.error(e);
            window.zeigeInfo('Belohnung konnte nicht vollständig gutgeschrieben werden - bitte Support kontaktieren.');
        }
    };
})();
