
    let currentAgentName = null;
    let isAdminSession = false;

    // WICHTIG: base-firebase-init.js läuft als type="module" (vom Browser automatisch
    // verzögert ausgeführt), dieses Skript hier ist ein normales, sofort blockierendes
    // <script src="...">. Ohne diese Wartefunktion konnte guardBaseAccess() starten,
    // BEVOR window.baseAuthReady überhaupt existiert - "await undefined" löst sofort mit
    // "kein Nutzer" auf und die Seite springt sofort wieder zu index.html zurück.
    function waitForBaseAuthReady() {
        return new Promise((resolve) => {
            (function check() {
                if (window.baseAuthReady) { resolve(window.baseAuthReady); }
                else { setTimeout(check, 20); }
            })();
        });
    }

    (async function guardBaseAccess() {
        const authPromise = await waitForBaseAuthReady();
        const user = await authPromise;
        if (!user) { window.location.href = 'index.html'; return; }
        currentAgentName = user.displayName || (user.email || '').split('@')[0];
        if (!currentAgentName) { window.location.href = 'index.html'; return; }

        try {
            const snap = await window.getDoc(window.doc(window.db, "agenten", window.agentSlug(currentAgentName)));
            isAdminSession = snap.exists() && !!snap.data().isAdmin;
        } catch (e) { isAdminSession = false; }

        const cheatBtn = document.getElementById('btn-cheat-boost');
        if (cheatBtn) cheatBtn.style.display = isAdminSession ? 'inline-block' : 'none';

        window.klickTonAktiv = localStorage.getItem('flux_sound_' + currentAgentName.toLowerCase()) !== 'false';

        window.dispatchEvent(new Event('flux-base-ready'));
    })();

    // --- AUDIO & EINSTELLUNGEN ---

    window.playBeepBase = function(freq = 800, duration = 0.05) {
        if (window.klickTonAktiv === false) return; 
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioContext();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch(e) {}
    };

    window.openSettings = () => { playBeepBase(1000, 0.05); document.getElementById('settings-overlay').style.display = 'flex'; updateSettingsUI(); };
    window.closeSettings = () => { playBeepBase(800, 0.05); document.getElementById('settings-overlay').style.display = 'none'; };

    window.updateSettingsUI = () => {
        let isMusicOn = localStorage.getItem('flux_music_' + currentAgentName.toLowerCase()) === 'true';
        let isSoundOn = localStorage.getItem('flux_sound_' + currentAgentName.toLowerCase()) !== 'false';
        const btnM = document.getElementById('btn-toggle-music');
        const btnS = document.getElementById('btn-toggle-sound');
        if(btnM) { btnM.innerText = isMusicOn ? "MUSIK: AN" : "MUSIK: AUS"; btnM.style.color = isMusicOn ? "#0f8" : "#f44"; }
        if(btnS) { btnS.innerText = isSoundOn ? "KLICK-SOUND: AN" : "KLICK-SOUND: AUS"; btnS.style.color = isSoundOn ? "#0f8" : "#f44"; }
    };

    window.toggleBaseMusic = () => {
        let isM = localStorage.getItem('flux_music_' + currentAgentName.toLowerCase()) === 'true';
        isM = !isM; localStorage.setItem('flux_music_' + currentAgentName.toLowerCase(), isM);
        const bgm = document.getElementById('bg-music-base');
        if (isM) bgm.play().catch(e => {}); else bgm.pause();
        updateSettingsUI();
    };

    window.toggleBaseSound = () => {
        let isS = localStorage.getItem('flux_sound_' + currentAgentName.toLowerCase()) !== 'false';
        isS = !isS; localStorage.setItem('flux_sound_' + currentAgentName.toLowerCase(), isS);
        window.klickTonAktiv = isS; playBeepBase(1200, 0.05); updateSettingsUI();
    };

    // --- GAME STATE & RÄUME ---
    let gameState = { baseData: [{x:2, y:2, type:'ZENTRALE', lvl:1}], credits: 0, materieZellen: 0, userLevel: 1 };
    let pendingCoords = {x: 0, y: 0};

    const roomColors = {
        'ZENTRALE': '#1a0d2a', 'FLUX-REAKTOR': '#220d22', 'HOCHSPANNUNGS-VERTEILER': '#140d2a', 'QUANTEN-LABOR': '#2a0d33', 
        'PARADOXON-FILTER': '#1d0d26', 'ARTEFAKT-ARCHIV': '#170a22', 'TECHNIK-DECK': '#261033', 'AGENTEN-QUARTIERE': '#120822', 
        'SERVER-HUB': '#1f132a', 'IMPULS-KONDENSATOR': '#1c152a', 'OSZILLATIONS-KAMMER': '#251230', 'TRANSFORMATOREN-STATION': '#151025',
        'RENAISSANCE-GENERATOR': '#201515', 'THERMO-KOPPLER': '#2a1a15', 'KINETIK-LABOR': '#152530', 'MATERIE-DEKOMPRESSOR': '#2a1520',
        'VAKUUM-SCHMIEDE': '#101a25', 'RESONANZ-KAMMER': '#201025', 'KYBERNETIK-STATION': '#15202a', 'SCANNER-PHALANX': '#1a251a',
        'DEKONTAMINATIONS-SCHLEUSE': '#1a2a1a', 'ANOMALIE-DETEKTOR': '#25152a', 'KRYO-DEPOT': '#10202a', 'FUNK-RELAIS "HORIZONT"': '#151530',
        'KI-KERNMATRIX': '#121822'
    };

    const roomTypes = [
        { n: 'FLUX-REAKTOR', d: 'Energieerzeugung für die Basis.' }, { n: 'HOCHSPANNUNGS-VERTEILER', d: 'Stabilisiert das Stromnetz.' },
        { n: 'QUANTEN-LABOR', d: 'Ermöglicht technische Forschung.' }, { n: 'PARADOXON-FILTER', d: 'Reduziert Zeitanomalien.' },
        { n: 'ARTEFAKT-ARCHIV', d: 'Generiert passives Einkommen.' }, { n: 'TECHNIK-DECK', d: 'Rabatte auf neue Flux-Modelle.' },
        { n: 'AGENTEN-QUARTIERE', d: 'Erhöht das Personal-Limit.' }, { n: 'SERVER-HUB', d: 'Schützt vor Credit-Diebstahl.' },
        { n: 'IMPULS-KONDENSATOR', d: 'Speichert massive Energiemengen.' }, { n: 'OSZILLATIONS-KAMMER', d: 'Frequenz-Feinabstimmung.' },
        { n: 'TRANSFORMATOREN-STATION', d: 'Wandelt rohe Energie um.' }, { n: 'RENAISSANCE-GENERATOR', d: 'Strom aus Schrott.' },
        { n: 'THERMO-KOPPLER', d: 'Nutzt Erdwärme der Ödnis.' }, { n: 'KINETIK-LABOR', d: 'Erforschung von Bewegungsenergie.' },
        { n: 'MATERIE-DEKOMPRESSOR', d: 'Zerlegt Fundstücke in Rohstoffe.' }, { n: 'VAKUUM-SCHMIEDE', d: 'Löten unter Extrembedingungen.' },
        { n: 'RESONANZ-KAMMER', d: 'Testet übernatürliche Fähigkeiten.' }, { n: 'KYBERNETIK-STATION', d: 'Einbau von Verstärkern.' },
        { n: 'SCANNER-PHALANX', d: 'Überwacht das Gelände.' }, { n: 'DEKONTAMINATIONS-SCHLEUSE', d: 'Reinigt von Strahlung.' },
        { n: 'ANOMALIE-DETEKTOR', d: 'Warnt vor Zeitrissen.' }, { n: 'KRYO-DEPOT', d: 'Lagert seltene Proben.' },
        { n: 'FUNK-RELAIS "HORIZONT"', d: 'Erhöht die Funk-Reichweite.' }, { n: 'KI-KERNMATRIX', d: 'Zentraler künstlicher Verstand.' }
    ];

    // --- CLOUD SYNCHRONISATION (FOOLPROOF LEVEL CHECK) ---
    async function loadGameState() {
        const localKey = 'flux_base_cache_' + currentAgentName.toLowerCase();
        const saved = localStorage.getItem(localKey);
        
        if (saved) { 
            try { 
                const parsed = JSON.parse(saved);
                if (parsed.credits !== undefined) gameState.credits = parsed.credits;
                if (parsed.materieZellen !== undefined) gameState.materieZellen = parsed.materieZellen;
                if (parsed.baseData) gameState.baseData = parsed.baseData;
            } catch(e) {} 
        }
        
        updateUI(); renderGrid();

        if (window.db && window.getDoc) {
            try {
                // Firestore ist die alleinige Quelle der Wahrheit für das Level.
                // localStorage wird NICHT mehr herangezogen, da es beliebig manipulierbar ist
                // (das war zuvor eine Anti-Cheat-Lücke: der jeweils höchste gefundene Wert
                // wurde übernommen, auch wenn er nur lokal im Browser verändert wurde).
                let maxLevel = 1;

                try {
                    const snap1 = await window.getDoc(window.doc(window.db, "agenten", window.agentSlug(currentAgentName)));
                    if (snap1.exists() && snap1.data().lvl) maxLevel = Math.max(maxLevel, snap1.data().lvl);
                } catch(e) {}

                try {
                    const snap2 = await window.getDoc(window.doc(window.db, "SLAs Agent", window.agentSlug(currentAgentName)));
                    if (snap2.exists() && snap2.data().lvl) maxLevel = Math.max(maxLevel, snap2.data().lvl);
                } catch(e) {}

                gameState.userLevel = maxLevel;

                // --- DATEN-FUSION: Credits/Materiezellen gab es bisher doppelt (einmal hier in
                // "Agent - Base", einmal im Haupt-Terminal-Profil unter "agenten"). Das Profil
                // "agenten" ist ab jetzt die EINZIGE Quelle der Wahrheit für Credits/Materiezellen.
                // Einmalig wird der jeweils höhere Wert übernommen, damit beim Umstieg nichts
                // verloren geht; danach schreibt/liest nur noch "agenten".
                let fusedCredits = 0, fusedMz = 0;
                try {
                    const agentSnap = await window.getDoc(window.doc(window.db, "agenten", window.agentSlug(currentAgentName)));
                    if (agentSnap.exists()) {
                        const ad = agentSnap.data();
                        fusedCredits = Math.max(fusedCredits, ad.credits || 0);
                        fusedMz = Math.max(fusedMz, (ad.materiezellen !== undefined ? ad.materiezellen : (ad.materialzellen || 0)));
                    }
                } catch(e) {}

                // 4. Räume aus der Basis-Datenbank laden (Credits/MZ dort sind Legacy und werden nur
                // noch für die einmalige Fusion gelesen, s.o.)
                const baseRef = window.doc(window.db, "Agent - Base", window.agentSlug(currentAgentName));
                const baseSnap = await window.getDoc(baseRef);
                if (baseSnap.exists()) {
                    const data = baseSnap.data();
                    fusedCredits = Math.max(fusedCredits, data.credits || 0);
                    fusedMz = Math.max(fusedMz, data.mz || 0);
                    if (data.baseData) gameState.baseData = data.baseData;
                }
                gameState.credits = fusedCredits;
                gameState.materieZellen = fusedMz;

                // Fusionierten Stand sofort zurück in die kanonische Quelle ("agenten") schreiben.
                try {
                    await window.setDoc(window.doc(window.db, "agenten", window.agentSlug(currentAgentName)), {
                        credits: fusedCredits, materiezellen: fusedMz
                    }, { merge: true });
                } catch(e) { console.error("Fusions-Speicherfehler:", e); }
                
                localStorage.setItem(localKey, JSON.stringify(gameState));
                updateUI(); renderGrid();
            } catch (e) { console.error("Cloud-Ladefehler:", e); }
        } else { setTimeout(loadGameState, 300); }
    }

    async function saveGameState() {
        const localKey = 'flux_base_cache_' + currentAgentName.toLowerCase();
        localStorage.setItem(localKey, JSON.stringify(gameState));

        // Das gefundene, höchste Level sicher in den lokalen Speicher zurückschreiben
        const mainProfileKey = 'flux_agent_' + currentAgentName.toLowerCase();
        let d = {}; const mainP = localStorage.getItem(mainProfileKey);
        if (mainP) { try { d = JSON.parse(mainP); } catch(e) {} }
        d.credits = gameState.credits; 
        d.mz = gameState.materieZellen; 
        d.lvl = gameState.userLevel; 
        localStorage.setItem(mainProfileKey, JSON.stringify(d));

        // Credits/Materiezellen gehen jetzt in die kanonische Quelle "agenten" (fusioniert, s.o.).
        // "Agent - Base" speichert nur noch die Raum-/Grid-Daten (keine Währungen mehr).
        if (window.db && window.setDoc) {
            try {
                await window.setDoc(window.doc(window.db, "agenten", window.agentSlug(currentAgentName)), {
                    credits: gameState.credits, materiezellen: gameState.materieZellen
                }, { merge: true });

                const baseRef = window.doc(window.db, "Agent - Base", window.agentSlug(currentAgentName));
                await window.setDoc(baseRef, {
                    baseData: gameState.baseData,
                    letztesUpdate: new Date().toISOString()
                }, { merge: true });
            } catch (e) { console.error("Cloud-Speicherfehler:", e); }
        }
    }

    function updateUI() {
        document.getElementById('display-credits').innerText = gameState.credits;
        document.getElementById('display-mz').innerText = gameState.materieZellen;
        document.getElementById('display-level').innerText = gameState.userLevel;
    }

    function renderGrid() {
        const grid = document.getElementById('base-grid'); if(!grid) return;
        grid.innerHTML = '';
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 5; x++) {
                const slot = document.createElement('div'); slot.className = 'room-slot';
                slot.style.gridColumn = x + 1; slot.style.gridRow = y + 1;
                const room = gameState.baseData.find(r => r.x === x && r.y === y);
                const isNeighbor = gameState.baseData.some(r => (Math.abs(r.x-x)===1 && r.y===y) || (Math.abs(r.y-y)===1 && r.x===x));
                if (room) {
                    slot.classList.add('room-active'); slot.style.backgroundColor = roomColors[room.type] || '#1a0a2a';
                    slot.onclick = () => { playBeepBase(1200, 0.05); openRoom(room.type); };
                    slot.innerHTML = `<b>${room.type}</b>${room.type !== 'ZENTRALE' ? '<br><small>LVL '+room.lvl+'</small>' : ''}`;
                    slot.style.display = 'flex';
                } else if (isNeighbor) {
                    slot.classList.add('room-buildable'); slot.innerHTML = '<span>+</span>';
                    slot.style.display = 'flex'; slot.onclick = () => { playBeepBase(900, 0.05); buyRoom(x, y); };
                }
                grid.appendChild(slot);
            }
        }
    }

    window.buyRoom = (x, y) => {
        pendingCoords = {x, y}; const list = document.getElementById('selection-list-container');
        list.innerHTML = ''; const reqLvl = gameState.baseData.length * 3;
        const levelI = document.getElementById('next-room-level-info');
        levelI.innerText = gameState.userLevel < reqLvl ? `Sperre: Level ${reqLvl} benötigt!` : `Bereit für Ausbau (Level ${reqLvl})`;
        roomTypes.forEach(room => {
            const built = gameState.baseData.some(r => r.type === room.n);
            const item = document.createElement('div'); item.className = 'selection-item';
            if (built || gameState.userLevel < reqLvl) { item.style.opacity = '0.3'; item.style.pointerEvents = 'none'; }
            else { item.onclick = () => confirmRoomSelection(room.n); }
            item.innerHTML = `<b>[ ${room.n} ]</b> <span style="float:right; color:#0f8; font-weight:bold;">10 MZ</span><br><small>${room.d}</small>${(gameState.userLevel < reqLvl && !built) ? '<span class="level-lock-hint">Benötigt Lvl '+reqLvl+'</span>' : ''}`;
            list.appendChild(item);
        });
        document.getElementById('room-selection-overlay').style.display = 'flex';
    };

    window.hideRoomMenu = () => { playBeepBase(600, 0.05); document.getElementById('room-selection-overlay').style.display = 'none'; };

    window.confirmRoomSelection = async (type) => {
        if (gameState.materieZellen >= 10) {
            gameState.materieZellen -= 10;
            gameState.baseData.push({x: pendingCoords.x, y: pendingCoords.y, type: type, lvl: 1});
            updateUI(); renderGrid(); hideRoomMenu(); await saveGameState();
        } else { hideRoomMenu(); if (typeof showCustomAlert === 'function') showCustomAlert("System: Nicht genügend Materie-Zellen."); }
    };

    window.cheatCredits = async () => {
        if (!isAdminSession) return; // Zusätzliche Absicherung, falls der Button per Konsole wieder eingeblendet wird
        playBeepBase(2000, 0.1); 
        gameState.credits += 50000; 
        gameState.materieZellen += 100;
        updateUI(); renderGrid(); await saveGameState();
    };

    window.onload = async () => {
        const authPromise = await waitForBaseAuthReady();
        const user = await authPromise;
        if (!user) return; // guardBaseAccess leitet in diesem Fall bereits zu index.html um
        currentAgentName = currentAgentName || user.displayName || (user.email || '').split('@')[0];
        let isM = localStorage.getItem('flux_music_' + currentAgentName.toLowerCase()) === 'true';
        if (isM) { document.addEventListener('click', () => { document.getElementById('bg-music-base').play().catch(e=>{}); }, {once: true}); }
        await loadGameState();
        const wrap = document.getElementById('grid-wrapper');
        if(wrap) { wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2; wrap.scrollTop = (wrap.scrollHeight - wrap.clientHeight) / 2; }
    };


/* ==== next block ==== */


    window.showCustomAlert = (msg) => { document.getElementById('custom-alert-msg').innerText = msg; document.getElementById('custom-alert-box').style.display = 'flex'; };
    window.closeCustomAlert = () => { document.getElementById('custom-alert-box').style.display = 'none'; };

    // === AUTOMATISCHER CLOUD-SYNCHRONISATOR FÜR BLOCK 2 & BLOCK 3 ===
    let _invCache = { desk: 0, server: 0, kartograph: 0, lampe: 0, regal: 0, lampe_archiv: 0, bett: 0, lampe_quartier: 0 };
    try {
        const ag = localStorage.getItem("flux_last_agent") || "";
        const lsData = localStorage.getItem('flux_base_inventory_' + ag);
        if (lsData) _invCache = { ..._invCache, ...JSON.parse(lsData) };
    } catch(e) {}

    let inventory = new Proxy(_invCache, {
        set: function(target, prop, val) {
            target[prop] = val;
            setTimeout(() => {
                let credsDisplay = document.getElementById('display-credits');
                if (credsDisplay) {
                    let c = parseInt(credsDisplay.innerText);
                    if (!isNaN(c)) gameState.credits = c;
                }
                if (typeof window.syncInventory === 'function') window.syncInventory();
            }, 50);
            return true;
        }
    });

    window.syncInventory = async function() {
        const ag = localStorage.getItem("flux_last_agent") || "";
        if (!ag) return;
        localStorage.setItem('flux_base_inventory_' + ag, JSON.stringify(inventory));
        const mainPKey = 'flux_agent_' + ag.toLowerCase();
        let d = {}; const mainP = localStorage.getItem(mainPKey);
        if (mainP) { try { d = JSON.parse(mainP); } catch(e) {} }
        d.credits = gameState.credits;
        localStorage.setItem(mainPKey, JSON.stringify(d));
        if (window.db && window.setDoc) {
            try {
                const bRef = window.doc(window.db, "Agent - Base", window.agentSlug(ag));
                await window.setDoc(bRef, { inventory: inventory }, { merge: true });
                await window.setDoc(window.doc(window.db, "agenten", window.agentSlug(ag)), { credits: gameState.credits }, { merge: true });
            } catch(e) {}
        }
    };

    window.loadInventoryFromCloud = async function() {
        const ag = localStorage.getItem("flux_last_agent") || "";
        if (!ag || !window.db || !window.getDoc) return;
        try {
            const bRef = window.doc(window.db, "Agent - Base", window.agentSlug(ag));
            const bSnap = await window.getDoc(bRef);
            if (bSnap.exists() && bSnap.data().inventory) {
                let dInv = bSnap.data().inventory;
                for (let k in dInv) inventory[k] = dInv[k];
                
                const titleEl = document.getElementById('room-title-detail');
                if (titleEl && document.getElementById('interior-screen').style.display === 'flex') {
                    if (typeof window.reloadFurniture === 'function') window.reloadFurniture(titleEl.innerText);
                }
            }
        } catch(e) {}
    };
    setTimeout(window.loadInventoryFromCloud, 1000);

    window.openRoom = (type) => {
        document.getElementById('grid-wrapper').style.display = 'none';
        document.getElementById('interior-screen').style.display = 'flex';
        
        document.getElementById('room-area').style.display = 'block';
        document.getElementById('ausbau-menu').style.display = 'none';
        document.getElementById('toggle-ausbau-btn').innerText = "AGENTUR-AUSBAU ÖFFNEN";
        
        document.getElementById('main-title').innerText = "RAUM-ANSICHT";
        document.getElementById('room-title-detail').innerText = type;

        if (type === 'ZENTRALE') {
            document.getElementById('menu-zentrale').style.display = 'flex';
            document.getElementById('menu-archiv').style.display = 'none';
            document.getElementById('menu-quartiere').style.display = 'none';
            document.getElementById('menu-platzhalter').style.display = 'none';
            reloadFurniture(type); 
        } else if (type === 'ARTEFAKT-ARCHIV') {
            document.getElementById('menu-zentrale').style.display = 'none';
            document.getElementById('menu-archiv').style.display = 'flex';
            document.getElementById('menu-quartiere').style.display = 'none';
            document.getElementById('menu-platzhalter').style.display = 'none';
            reloadFurniture(type); 
        } else if (type === 'AGENTEN-QUARTIERE') {
            document.getElementById('menu-zentrale').style.display = 'none';
            document.getElementById('menu-archiv').style.display = 'none';
            document.getElementById('menu-quartiere').style.display = 'flex';
            document.getElementById('menu-platzhalter').style.display = 'none';
            reloadFurniture(type); 
        } else {
            document.getElementById('menu-zentrale').style.display = 'none';
            document.getElementById('menu-archiv').style.display = 'none';
            document.getElementById('menu-quartiere').style.display = 'none';
            document.getElementById('menu-platzhalter').style.display = 'block';
            clearRoom(); 
        }
    };

    window.closeRoom = () => {
        document.getElementById('interior-screen').style.display = 'none';
        document.getElementById('grid-wrapper').style.display = 'flex';
        document.getElementById('main-title').innerText = "AGENTUR-STRUKTUR";
    };

    window.toggleAusbauMenu = () => {
        const menu = document.getElementById('ausbau-menu');
        const btn = document.getElementById('toggle-ausbau-btn');
        const roomBox = document.getElementById('room-area');
        
        if (menu.style.display === 'none' || menu.style.display === '') {
            menu.style.display = 'flex'; 
            btn.innerText = "AUSBAU-MENÜ SCHLIESSEN";
            roomBox.style.display = 'none'; 
        } else {
            menu.style.display = 'none'; 
            btn.innerText = "AGENTUR-AUSBAU ÖFFNEN";
            roomBox.style.display = 'block'; 
        }
    };

    window.clearRoom = () => {
        document.querySelectorAll('.fixed-item').forEach(el => el.remove());
    };

    window.reloadFurniture = (type) => {
        clearRoom();
        if (type === 'ZENTRALE') {
            if (inventory.desk > 0) spawnFurniture('desk', 1);
            if (inventory.lampe > 0) spawnFurniture('lampe', 1);
            if (inventory.kartograph > 0) spawnFurniture('kartograph', 1);
            for (let i = 1; i <= inventory.server; i++) spawnFurniture('server', i);
        } else if (type === 'ARTEFAKT-ARCHIV') {
            if (inventory.lampe_archiv > 0) spawnFurniture('lampe_archiv', 1);
            for (let i = 1; i <= inventory.regal; i++) spawnFurniture('regal', i);
        } else if (type === 'AGENTEN-QUARTIERE') {
            if (inventory.lampe_quartier > 0) spawnFurniture('lampe_quartier', 1);
            for (let i = 1; i <= inventory.bett; i++) spawnFurniture('bett', i);
        }
    };

    window.buyFurniture = (type, cost) => {
        let creds = parseInt(document.getElementById('display-credits').innerText);
        
        let maxAmt = (type === 'server') ? 2 : (type === 'regal' ? 8 : (type === 'bett' ? 4 : 1));
        
        if (inventory[type] >= maxAmt) return; 

        if (creds >= cost) {
            document.getElementById('display-credits').innerText = creds - cost;
            inventory[type]++;
            
            const btnId = `btn-buy-${type.replace('_', '-')}`;
            const btn = document.getElementById(btnId);
            
            if (inventory[type] >= maxAmt) { 
                btn.innerText = "[ BEREITS INSTALLIERT ]"; btn.disabled = true; 
            } else if (type === 'server') { 
                btn.innerText = `KAUFEN (${cost} C) [${inventory[type]}/2]`; 
            } else if (type === 'regal') { 
                btn.innerText = `KAUFEN (${cost} C) [${inventory[type]}/8]`; 
            } else if (type === 'bett') { 
                btn.innerText = `KAUFEN (${cost} C) [${inventory[type]}/4]`; 
            }
            
            spawnFurniture(type, inventory[type]);
        } else { showCustomAlert("Nicht genügend Credits für diesen Ausbau vorhanden."); }
    };

    window.spawnFurniture = (type, count) => {
        const room = document.getElementById('room-area');
        const item = document.createElement('div');
        item.classList.add('fixed-item');
        
        // ZENTRALE
        if (type === 'desk') {
            item.classList.add('item-desk');
            item.innerHTML = '<div class="desk-console"><div class="desk-led" style="background:#f44;box-shadow:0 0 5px #f44;"></div><div class="desk-led" style="background:#ffcc00;box-shadow:0 0 5px #ffcc00;"></div><div class="desk-led" style="background:#0f8;box-shadow:0 0 5px #0f8;"></div></div>';
            item.style.left = '40%'; item.style.transform = 'translateX(-50%)'; item.style.bottom = '70px';
        } else if (type === 'lampe') {
            item.classList.add('item-lampe');
            item.style.left = '50%'; item.style.transform = 'translateX(-50%)'; item.style.top = '5px';
        } else if (type === 'kartograph') {
            item.classList.add('item-kartograph');
            item.style.left = '45px'; item.style.bottom = '35px';
        } else if (type === 'server') {
            item.classList.add('item-server');
            item.innerHTML = '<div class="server-led"></div><div class="server-led" style="animation-delay:0.3s"></div><div class="server-led" style="animation-delay:0.6s"></div>';
            let offsetR = 50 + ((count - 1) * 45); 
            item.style.right = offsetR + 'px'; item.style.bottom = '70px';
        } 
        // ARCHIV
        else if (type === 'lampe_archiv') {
            item.classList.add('item-lampe-archiv');
            item.style.left = '50%'; item.style.transform = 'translateX(-50%)'; 
            item.style.top = '15px'; 
        } else if (type === 'regal') {
            item.classList.add('item-regal');
            item.innerHTML = '<div class="regal-fach"></div><div class="regal-fach"></div><div class="regal-fach"></div><div class="regal-fach"></div>';
            let offsetL = 45 + ((count - 1) * 32); 
            item.style.left = offsetL + 'px';
            item.style.bottom = '70px'; 
            item.style.zIndex = '2'; 
        }
        // QUARTIERE
        else if (type === 'lampe_quartier') {
            item.classList.add('item-lampe-quartier');
            item.style.left = '50%'; item.style.transform = 'translateX(-50%)'; 
            item.style.top = '10px';
        } else if (type === 'bett') {
            item.classList.add('item-bett');
            item.innerHTML = `
                <div class="bett-etage"><div class="bett-kissen"></div><div class="holo-screen-q"></div></div>
                <div class="bett-etage"><div class="bett-kissen"></div><div class="holo-screen-q"></div></div>
            `;
            let offsetL = 13 + ((count - 1) * 19.5); 
            item.style.left = offsetL + '%';
            item.style.bottom = '70px'; 
            item.style.zIndex = '3'; 
        }
        
        room.appendChild(item);
    };


/* ==== next block ==== */


// 1. HTML Menüs injizieren
const extensionMenus = `
<div id="menu-server-hub" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ NEURO-SERVER CLUSTER ]</b><p style="font-size: 0.7em; color: #aaa;">Rechenknoten. (Max. 4)</p><button id="btn-buy-hub-server" onclick="window.buyFurniture('hub_server', 2500)" class="btn-upgrade-exec">KAUFEN (2500 C)</button></div>
    <div class="upgrade-card"><b>[ HOLO-TERMINAL ]</b><p style="font-size: 0.7em; color: #aaa;">Zentrales Interface.</p><button id="btn-buy-hub-terminal" onclick="window.buyFurniture('hub_terminal', 1800)" class="btn-upgrade-exec">KAUFEN (1800 C)</button></div>
    <div class="upgrade-card"><b>[ PLASMA-KERN LAMPE ]</b><button id="btn-buy-hub-lampe" onclick="window.buyFurniture('hub_lampe', 150)" class="btn-upgrade-exec">KAUFEN (150 C)</button></div>
</div>
<div id="menu-technik-deck" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ HOLO-WERKBANK ]</b><button id="btn-buy-werkbank" onclick="window.buyFurniture('werkbank', 2200)" class="btn-upgrade-exec">KAUFEN (2200 C)</button></div>
    <div class="upgrade-card"><b>[ MONTAGE-ROBOTERARM ]</b><button id="btn-buy-montagearm" onclick="window.buyFurniture('montagearm', 1400)" class="btn-upgrade-exec">KAUFEN (1400 C)</button></div>
    <div class="upgrade-card"><b>[ NANO-FABRICATOR ]</b><button id="btn-buy-fabricator" onclick="window.buyFurniture('fabricator', 1900)" class="btn-upgrade-exec">KAUFEN (1900 C)</button></div>
    <div class="upgrade-card"><b>[ FLUX-SPULEN TESTSTAND ]</b><button id="btn-buy-teststand" onclick="window.buyFurniture('teststand', 1600)" class="btn-upgrade-exec">KAUFEN (1600 C)</button></div>
    <div class="upgrade-card"><b>[ INDUSTRIE-LAMPE ]</b><button id="btn-buy-lampe-technik" onclick="window.buyFurniture('lampe_technik', 200)" class="btn-upgrade-exec">KAUFEN (200 C)</button></div>
</div>
`;
if (!document.getElementById('menu-server-hub')) {
    document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', extensionMenus);
}

// 2. Inventar Sicherung
const newItems = ['hub_server', 'hub_terminal', 'hub_lampe', 'werkbank', 'montagearm', 'fabricator', 'teststand', 'lampe_technik'];
newItems.forEach(item => { if(inventory[item] === undefined) inventory[item] = 0; });

// 3. Raum-Weiche
const originalOpenRoom = window.openRoom;
window.openRoom = (type) => {
    originalOpenRoom(type);
    const menus = ['menu-zentrale', 'menu-archiv', 'menu-quartiere', 'menu-server-hub', 'menu-technik-deck', 'menu-platzhalter'];
    menus.forEach(m => { const el = document.getElementById(m); if(el) el.style.display = 'none'; });
    if (type === 'SERVER-HUB') document.getElementById('menu-server-hub').style.display = 'flex';
    else if (type === 'TECHNIK-DECK') document.getElementById('menu-technik-deck').style.display = 'flex';
    else if (type === 'ZENTRALE') document.getElementById('menu-zentrale').style.display = 'flex';
    else if (type === 'ARTEFAKT-ARCHIV') document.getElementById('menu-archiv').style.display = 'flex';
    else if (type === 'AGENTEN-QUARTIERE') document.getElementById('menu-quartiere').style.display = 'flex';
    else document.getElementById('menu-platzhalter').style.display = 'block';
    window.reloadFurniture(type);
};

// 4. Shop-Kauf
const originalBuyFurniture = window.buyFurniture;
window.buyFurniture = (type, cost) => {
    if (newItems.includes(type)) {
        let creds = parseInt(document.getElementById('display-credits').innerText);
        let maxAmt = (type === 'hub_server' || type === 'montagearm') ? 4 : 1;
        if (inventory[type] >= maxAmt) return; 
        if (creds >= cost) {
            document.getElementById('display-credits').innerText = creds - cost;
            inventory[type]++;
            const btn = document.getElementById(`btn-buy-${type.replaceAll('_', '-')}`);
            btn.innerText = (inventory[type] >= maxAmt) ? "[ INSTALLIERT ]" : `KAUFEN (${cost} C) [${inventory[type]}/${maxAmt}]`;
            if (inventory[type] >= maxAmt) btn.disabled = true;
            window.spawnFurniture(type, inventory[type]);
        } else { if(typeof showCustomAlert === 'function') showCustomAlert("System: Credits unzureichend."); }
    } else originalBuyFurniture(type, cost);
};

// 5. Reload
const originalReload = window.reloadFurniture;
window.reloadFurniture = (type) => {
    originalReload(type);
    if (type === 'SERVER-HUB') {
        if (inventory.hub_lampe > 0) window.spawnFurniture('hub_lampe', 1);
        if (inventory.hub_terminal > 0) window.spawnFurniture('hub_terminal', 1);
        for (let i = 1; i <= inventory.hub_server; i++) window.spawnFurniture('hub_server', i);
    } else if (type === 'TECHNIK-DECK') {
        if (inventory.lampe_technik > 0) window.spawnFurniture('lampe_technik', 1);
        if (inventory.werkbank > 0) window.spawnFurniture('werkbank', 1);
        if (inventory.fabricator > 0) window.spawnFurniture('fabricator', 1);
        if (inventory.teststand > 0) window.spawnFurniture('teststand', 1);
        for (let i = 1; i <= inventory.montagearm; i++) window.spawnFurniture('montagearm', i);
    }
};

// 6. Spawn
const originalSpawn = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    originalSpawn(type, count);
    const room = document.getElementById('room-area');
    if (!room || !newItems.includes(type)) return;
    const item = document.createElement('div');
    item.classList.add('fixed-item');

    if (type === 'hub_lampe') {
        item.classList.add('item-hub-lampe'); item.innerHTML = '<div class="plasma-tube"></div>';
        item.style.left = '50%'; item.style.transform = 'translateX(-50%)'; item.style.top = '0';
    } else if (type === 'hub_terminal') {
        item.classList.add('item-hub-terminal'); 
        item.innerHTML = `<div class="terminal-holo-display"><div class="holo-text">SYSTEM_OK</div><div class="holo-grid-line"></div><div class="holo-text">CPU: 15%</div><div class="holo-grid-line"></div><div class="holo-text">NETZ: OK</div></div><div class="terminal-slot"></div>`;
        item.style.left = '50%'; item.style.transform = 'translateX(-50%)'; item.style.bottom = '45px';
    } else if (type === 'hub_server') {
        item.classList.add('item-hub-server'); item.innerHTML = '<div class="server-unit"><div class="led-neuro"></div><div class="led-data"></div></div>'.repeat(4);
        let offsets = [13, 30, 55, 72]; item.style.left = offsets[count-1] + '%'; item.style.bottom = '70px';
    }
    // TECHNIK-DECK
    else if (type === 'lampe_technik') {
        item.classList.add('item-industrie-lampe'); item.innerHTML = '<div class="lampe-flow"></div>';
        item.style.left = '50%'; item.style.transform = 'translateX(-50%)'; item.style.top = '0';
    } else if (type === 'werkbank') {
        item.classList.add('item-werkbank'); 
        item.innerHTML = '<div class="wb-top"></div><div class="wb-leg"></div><div class="wb-leg"></div><div class="wb-holo-quad"><div class="wb-holo-text">OPT_SEQ</div><div class="wb-holo-text">FLUX_V2</div><div class="wb-holo-text">[ OK ]</div></div>';
        item.style.left = '50%'; item.style.transform = 'translateX(-50%)'; item.style.bottom = '70px';
    } else if (type === 'fabricator') {
        item.classList.add('item-fabricator'); item.innerHTML = '<div class="fab-window"><div class="fab-item"></div><div class="fabricator-laser"></div></div>';
        item.style.left = '8%'; item.style.bottom = '40px';
    } else if (type === 'teststand') {
        item.classList.add('item-teststand'); item.innerHTML = '<div class="test-core"><div class="test-coil"></div></div>';
        item.style.right = '8%'; item.style.bottom = '40px';
    } else if (type === 'montagearm') {
        item.classList.add('item-montagearm'); item.innerHTML = '<div class="arm-base"></div><div class="arm-segment-1"></div><div class="arm-joint"></div><div class="arm-segment-2"><div class="montage-spark"></div></div>';
        let offsets = [10, 25, 75, 90]; item.style.left = offsets[count-1] + '%'; item.style.top = '0';
    }
    room.appendChild(item);
};


/* ==== next block ==== */


    // 1. Menü einfügen
    const menuReaktor = `
    <div id="menu-flux-reaktor" style="display:none; flex-direction:column; gap:15px;">
        <div class="upgrade-card">
            <b>[ FLUX-KERNREAKTOR ]</b><p style="font-size: 0.7em; color: #aaa;">Induktives Hochleistungs-Herzstück.</p>
            <button id="btn-buy-reaktor" onclick="window.buyFurniture('reaktor', 3500)" class="btn-upgrade-exec" style="background:#0f8; border:1px solid #0f8; color:#000;">KAUFEN (3500 C + 40 MZ)</button>
        </div>
        <div class="upgrade-card">
            <b>[ HOCHSPANNUNGS-TRASSE ]</b><p style="font-size: 0.7em; color: #aaa;">Stromableitung vom Reaktor ins Netz. (Max. 3)</p>
            <button id="btn-buy-hv-leitung" onclick="window.buyFurniture('hv_leitung', 800)" class="btn-upgrade-exec">KAUFEN (800 C) [0/3]</button>
        </div>
        <div class="upgrade-card">
            <b>[ PLASMA-BOGENLEUCHTE ]</b><p style="font-size: 0.7em; color: #aaa;">Ionisierter Dual-Lichtbogen.</p>
            <button id="btn-buy-plasma-lampe" onclick="window.buyFurniture('plasma_lampe', 150)" class="btn-upgrade-exec">KAUFEN (150 C)</button>
        </div>
    </div>`;
    
    if (!document.getElementById('menu-flux-reaktor')) {
        document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuReaktor);
    }

    const newItems4 = ['reaktor', 'hv_leitung', 'plasma_lampe'];
    newItems4.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

    // 2. Globaler Button-Fix für ALLE Räume
    window.updateAusbauButtons = function() {
        if (typeof inventory === 'undefined') return;
        const allLimits = {
            desk: 1, lampe: 1, kartograph: 1, server: 2,
            regal: 8, lampe_archiv: 1, lampe_quartier: 1, bett: 4,
            hub_server: 4, hub_terminal: 1, hub_lampe: 1,
            werkbank: 1, montagearm: 4, fabricator: 1, teststand: 1, lampe_technik: 1,
            reaktor: 1, hv_leitung: 3, plasma_lampe: 1
        };
        for (let k in allLimits) {
            let max = allLimits[k];
            let current = inventory[k] || 0;
            let btn = document.getElementById('btn-buy-' + k.replace(/_/g, '-'));
            if (btn) {
                if (current >= max) {
                    btn.innerText = "[ BEREITS INSTALLIERT ]";
                    btn.disabled = true;
                    btn.style.background = "#333";
                    btn.style.color = "#555";
                    btn.style.cursor = "not-allowed";
                } else if (max > 1 && btn.innerText.includes('[')) {
                    btn.innerText = btn.innerText.replace(/\[\d+\/\d+\]/, `[${current}/${max}]`);
                }
            }
        }
    };
    setTimeout(window.updateAusbauButtons, 1000);
    setInterval(window.updateAusbauButtons, 2000);

    // 3. Raumwechsel patchen
    const oldOpenRoomB4 = window.openRoom;
    window.openRoom = (type) => {
        if (oldOpenRoomB4) oldOpenRoomB4(type); 
        const menuReaktorEl = document.getElementById('menu-flux-reaktor');
        if (menuReaktorEl) menuReaktorEl.style.display = (type === 'FLUX-REAKTOR') ? 'flex' : 'none';
        if (type === 'FLUX-REAKTOR') document.getElementById('menu-platzhalter').style.display = 'none'; 
        setTimeout(window.updateAusbauButtons, 50); 
    };

    // 4. Kauf-Logik mit Dual-Währung (Credits + MZ)
    const oldBuyFurnitureB4 = window.buyFurniture;
    window.buyFurniture = async (type, cost) => {
        if (newItems4.includes(type)) {
            let maxAmt = (type === 'hv_leitung') ? 3 : 1;
            if (inventory[type] >= maxAmt) return; 
            
            let isMZ = (type === 'reaktor');
            let costC = isMZ ? 3500 : cost;
            let costMZ = isMZ ? 40 : 0;
            
            let hasEnough = (gameState.credits >= costC) && (gameState.materieZellen >= costMZ);
            
            if (hasEnough) {
                gameState.credits -= costC;
                document.getElementById('display-credits').innerText = gameState.credits;

                if (isMZ) {
                    gameState.materieZellen -= costMZ;
                    document.getElementById('display-mz').innerText = gameState.materieZellen;
                    
                    const ag = localStorage.getItem("flux_last_agent") || "";
                    if (ag) {
                        const mainPKey = 'flux_agent_' + ag.toLowerCase();
                        let d = {}; const mainP = localStorage.getItem(mainPKey);
                        if (mainP) { try { d = JSON.parse(mainP); } catch(e) {} }
                        d.mz = gameState.materieZellen; 
                        localStorage.setItem(mainPKey, JSON.stringify(d));

                        if (window.db && window.setDoc) {
                            // Materiezellen sind fusioniert: kanonisch in "agenten", nicht mehr in "Agent - Base".
                            try {
                                await window.setDoc(window.doc(window.db, "agenten", window.agentSlug(ag)), { materiezellen: gameState.materieZellen }, { merge: true });
                            } catch(e) {}
                        }
                    }
                }
                inventory[type]++;
                window.updateAusbauButtons();
                window.spawnFurniture(type, inventory[type]);
            } else { 
                let msg = isMZ ? "System: Nicht genügend Credits oder Materie-Zellen (3500 C + 40 MZ benötigt)." : "System: Credits unzureichend.";
                if(typeof showCustomAlert === 'function') showCustomAlert(msg); else alert(msg);
            }
        } else {
            if (oldBuyFurnitureB4) oldBuyFurnitureB4(type, cost); 
        }
    };

    // 5. Möbel Laden & Spawnen
    const oldReloadB4 = window.reloadFurniture;
    window.reloadFurniture = (type) => {
        if (oldReloadB4) oldReloadB4(type);
        if (type === 'FLUX-REAKTOR') {
            if (inventory.plasma_lampe > 0) window.spawnFurniture('plasma_lampe', 1);
            if (inventory.reaktor > 0) window.spawnFurniture('reaktor', 1);
            for (let i = 1; i <= inventory.hv_leitung; i++) window.spawnFurniture('hv_leitung', i);
        }
    };

    const oldSpawnB4 = window.spawnFurniture;
    window.spawnFurniture = (type, count) => {
        if (oldSpawnB4) oldSpawnB4(type, count);
        const room = document.getElementById('room-area');
        if (!room || !newItems4.includes(type)) return;
        
        const item = document.createElement('div');
        item.classList.add('fixed-item');

        if (type === 'plasma_lampe') {
            item.classList.add('item-plasma-lampe');
            item.innerHTML = '<div class="plasma-arc"></div><div class="plasma-arc"></div>';
        } else if (type === 'reaktor') {
            item.classList.add('item-reaktor');
            item.innerHTML = `
                <div class="reaktor-center">
                    <div class="reaktor-containment"></div>
                    <div class="reaktor-ring-1"></div>
                    <div class="reaktor-ring-2"></div>
                    <div class="reaktor-ring-3"></div>
                    <div class="reaktor-core"></div>
                    <div class="r-spark" style="--tx: -50px; --ty: -60px; animation-delay: 0.1s;"></div>
                    <div class="r-spark" style="--tx: 50px; --ty: -30px; animation-delay: 0.6s;"></div>
                    <div class="r-spark" style="--tx: 20px; --ty: -80px; animation-delay: 1.2s;"></div>
                </div>
                <div class="reaktor-base">
                    <div class="base-top-plate"></div>
                    <div class="base-mid-section">
                        <div class="base-vent"></div>
                        <div class="r-led"></div>
                        <div class="r-led green"></div>
                        <div class="base-vent"></div>
                    </div>
                    <div class="base-hazard"></div>
                </div>`;
        } else if (type === 'hv_leitung') {
            item.classList.add('item-hv-leitung');
            if (count === 1) { 
                // Linkes Kabel: Fließt vom Reaktor nach links zur Wand (hz-left)
                item.style.left = '0'; item.style.bottom = '100px'; item.style.width = '45%'; item.style.transformOrigin = 'left center'; item.style.transform = 'rotate(15deg)';
                item.innerHTML = '<div class="hv-isolator"></div><div class="hv-kabel" style="flex-grow:1;"><div class="hv-zap hz-left"></div></div><div class="hv-isolator"></div>';
            } else if (count === 2) { 
                // Rechtes Kabel: Fließt vom Reaktor nach rechts zur Wand (hz-right)
                item.style.right = '0'; item.style.bottom = '100px'; item.style.width = '45%'; item.style.transformOrigin = 'right center'; item.style.transform = 'rotate(-15deg)';
                item.innerHTML = '<div class="hv-isolator"></div><div class="hv-kabel" style="flex-grow:1;"><div class="hv-zap hz-right"></div></div><div class="hv-isolator"></div>';
            } else if (count === 3) { 
                // Oberes Kabel: Fließt vom Reaktor nach oben zur Decke (hz-up)
                item.style.left = '50%'; item.style.top = '30px'; item.style.height = '110px'; item.style.width = '24px'; item.style.transform = 'translateX(-50%)'; item.style.flexDirection = 'column';
                item.innerHTML = '<div class="hv-isolator" style="transform:rotate(90deg);"></div><div class="hv-kabel vert" style="flex-grow:1;"><div class="hv-zap vert hz-up"></div></div><div class="hv-isolator" style="transform:rotate(90deg);"></div>';
            }
        }
        room.appendChild(item);
    };


/* ==== next block ==== */


    // 1. Menü einfügen
    const menuQuantenLabor = `
    <div id="menu-quanten-labor" style="display:none; flex-direction:column; gap:15px;">
        <div class="upgrade-card">
            <b>[ QUANTEN-ZENTRALRECHNER ]</b><p style="font-size: 0.7em; color: #aaa;">Schwebender Q-Core für paradoxe Berechnungen.</p>
            <button id="btn-buy-q-core" onclick="window.buyFurniture('q_core', 4000)" class="btn-upgrade-exec" style="background:#84f; border:1px solid #84f; color:#000;">KAUFEN (4000 C + 50 MZ)</button>
        </div>
        <div class="upgrade-card">
            <b>[ VERSCHRÄNKUNGS-KNOTEN ]</b><p style="font-size: 0.7em; color: #aaa;">Optische Hochfrequenz-Datenleiter. (Max. 2)</p>
            <button id="btn-buy-q-node" onclick="window.buyFurniture('q_node', 1200)" class="btn-upgrade-exec">KAUFEN (1200 C) [0/2]</button>
        </div>
        <div class="upgrade-card">
            <b>[ PHOTONEN-SCANNER ]</b><p style="font-size: 0.7em; color: #aaa;">Aktives volumetrisches Überwachungslichtfeld.</p>
            <button id="btn-buy-photon-lampe" onclick="window.buyFurniture('photon_lampe', 250)" class="btn-upgrade-exec">KAUFEN (250 C)</button>
        </div>
    </div>`;
    
    if (!document.getElementById('menu-quanten-labor')) {
        document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuQuantenLabor);
    }

    const newItems5 = ['q_core', 'q_node', 'photon_lampe'];
    newItems5.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

    // 2. Modulares Button-Update (Klinkt sich in bestehendes System ein)
    const oldUpdateAusbauB5 = window.updateAusbauButtons;
    window.updateAusbauButtons = function() {
        if (typeof oldUpdateAusbauB5 === 'function') oldUpdateAusbauB5();
        if (typeof inventory === 'undefined') return;

        const newLimits5 = { q_core: 1, q_node: 2, photon_lampe: 1 };
        for (let k in newLimits5) {
            let max = newLimits5[k];
            let current = parseInt(inventory[k]) || 0;
            let btn = document.getElementById('btn-buy-' + k.replace(/_/g, '-'));

            if (btn) {
                if (current >= max) {
                    btn.innerText = "[ INSTALLIERT ]";
                    btn.disabled = true;
                    btn.style.background = "#333";
                    btn.style.color = "#555";
                    btn.style.border = "1px solid #333";
                    btn.style.cursor = "not-allowed";
                } else if (max > 1 && btn.innerText.includes('[')) {
                    btn.innerText = btn.innerText.replace(/\[\d+\/\d+\]/, `[${current}/${max}]`);
                }
            }
        }
    };

    // 3. Raumwechsel patchen
    const oldOpenRoomB5 = window.openRoom;
    window.openRoom = (type) => {
        if (typeof oldOpenRoomB5 === 'function') oldOpenRoomB5(type); 
        const menuQuantenEl = document.getElementById('menu-quanten-labor');
        if (menuQuantenEl) menuQuantenEl.style.display = (type === 'QUANTEN-LABOR') ? 'flex' : 'none';
        if (type === 'QUANTEN-LABOR') document.getElementById('menu-platzhalter').style.display = 'none'; 
        setTimeout(window.updateAusbauButtons, 50); 
    };

    // 4. Kauf-Logik
    const oldBuyFurnitureB5 = window.buyFurniture;
    window.buyFurniture = async (type, cost) => {
        if (newItems5.includes(type)) {
            let maxAmt = (type === 'q_node') ? 2 : 1;
            let current = parseInt(inventory[type]) || 0;
            if (current >= maxAmt) return; 
            
            let isQCore = (type === 'q_core');
            let costC = cost; 
            let costMZ = isQCore ? 50 : 0; 
            
            let hasEnough = (gameState.credits >= costC) && (gameState.materieZellen >= costMZ);
            
            if (hasEnough) {
                gameState.credits -= costC;
                document.getElementById('display-credits').innerText = gameState.credits;

                if (isQCore) {
                    gameState.materieZellen -= costMZ;
                    document.getElementById('display-mz').innerText = gameState.materieZellen;
                    
                    const ag = localStorage.getItem("flux_last_agent") || "";
                    if (ag) {
                        const mainPKey = 'flux_agent_' + ag.toLowerCase();
                        let d = {}; const mainP = localStorage.getItem(mainPKey);
                        if (mainP) { try { d = JSON.parse(mainP); } catch(e) {} }
                        d.mz = gameState.materieZellen; 
                        localStorage.setItem(mainPKey, JSON.stringify(d));

                        if (window.db && window.setDoc) {
                            // Materiezellen sind fusioniert: kanonisch in "agenten", nicht mehr in "Agent - Base".
                            try {
                                await window.setDoc(window.doc(window.db, "agenten", window.agentSlug(ag)), { materiezellen: gameState.materieZellen }, { merge: true });
                            } catch(e) {}
                        }
                    }
                }
                
                inventory[type] = current + 1;
                
                // Button direkt einfärben
                const btn = document.getElementById(`btn-buy-${type.replaceAll('_', '-')}`);
                if (btn) {
                    if (inventory[type] >= maxAmt) {
                        btn.innerText = "[ INSTALLIERT ]";
                        btn.disabled = true;
                        btn.style.background = "#333";
                        btn.style.color = "#555";
                        btn.style.border = "1px solid #333";
                        btn.style.cursor = "not-allowed";
                    } else {
                        btn.innerText = `KAUFEN (${cost} C) [${inventory[type]}/${maxAmt}]`;
                    }
                }
                
                window.spawnFurniture(type, inventory[type]);
            } else { 
                let msg = isQCore ? "System: Nicht genügend Credits oder Materie-Zellen (4000 C + 50 MZ benötigt)." : "System: Credits unzureichend.";
                if(typeof showCustomAlert === 'function') showCustomAlert(msg); else alert(msg);
            }
        } else {
            if (typeof oldBuyFurnitureB5 === 'function') oldBuyFurnitureB5(type, cost); 
        }
    };

    // 5. Möbel Laden & Spawnen
    const oldReloadB5 = window.reloadFurniture;
    window.reloadFurniture = (type) => {
        if (typeof oldReloadB5 === 'function') oldReloadB5(type);
        if (type === 'QUANTEN-LABOR') {
            if (inventory.photon_lampe > 0) window.spawnFurniture('photon_lampe', 1);
            if (inventory.q_core > 0) window.spawnFurniture('q_core', 1);
            for (let i = 1; i <= inventory.q_node; i++) window.spawnFurniture('q_node', i);
        }
    };

    const oldSpawnB5 = window.spawnFurniture;
    window.spawnFurniture = (type, count) => {
        if (typeof oldSpawnB5 === 'function') oldSpawnB5(type, count);
        const room = document.getElementById('room-area');
        if (!room || !newItems5.includes(type)) return;
        
        const item = document.createElement('div');
        item.classList.add('fixed-item');

        if (type === 'photon_lampe') {
            item.classList.add('item-photon-lampe');
            item.innerHTML = '<div class="photon-track"><div class="photon-laser"><div class="photon-beam"></div></div></div>';
        } else if (type === 'q_core') {
            item.classList.add('item-qcore');
            item.innerHTML = `
                <div class="q-uplink"></div>
                <div class="q-ring-1"></div>
                <div class="q-ring-2"></div>
                <div class="q-cube"></div>
                <div class="q-base"></div>`;
        } else if (type === 'q_node') {
            item.classList.add('item-qnode');
            
            let sparks = `
                <div class="node-spark-pt" style="--tx: -15px; --ty: -30px; animation-delay: 0.1s; top: 30px;"></div>
                <div class="node-spark-pt" style="--tx: 15px; --ty: -40px; animation-delay: 0.6s; top: 40px;"></div>
                <div class="node-spark-pt" style="--tx: 0px; --ty: -50px; animation-delay: 1.1s; top: 25px;"></div>
            `;
            
            if (count === 1) { 
                item.style.left = '15px'; 
                item.innerHTML = sparks + '<div class="node-beam beam-left"></div><div class="node-ring"></div><div class="node-crystal"></div><div class="node-stand"></div>';
            } else if (count === 2) { 
                item.style.right = '15px'; 
                item.innerHTML = sparks + '<div class="node-beam beam-right"></div><div class="node-ring"></div><div class="node-crystal"></div><div class="node-stand"></div>';
            }
        }
        room.appendChild(item);
    };


/* ==== next block ==== */


    const menuVerteiler = `
    <div id="menu-hochspannungs-verteiler" style="display:none; flex-direction:column; gap:15px;">
        <div class="upgrade-card">
            <b>[ HAUPT-TRANSFORMATOR ]</b><p style="font-size: 0.7em; color: #aaa;">Massive Kupferspulen zur Spannungsanpassung.</p>
            <button id="btn-buy-hv-trafo" onclick="window.buyFurniture('hv_trafo', 2800)" class="btn-upgrade-exec">KAUFEN (2800 C)</button>
        </div>
        <div class="upgrade-card">
            <b>[ KONDENSATOR-BANK ]</b><p style="font-size: 0.7em; color: #aaa;">Flüssiggekühlte Energiespeicher. (Max. 4)</p>
            <button id="btn-buy-hv-kondensator" onclick="window.buyFurniture('hv_kondensator', 900)" class="btn-upgrade-exec">KAUFEN (900 C) [0/4]</button>
        </div>
        <div class="upgrade-card">
            <b>[ PLASMA-RELAIS ]</b><p style="font-size: 0.7em; color: #aaa;">Deckenmontierte Entladungsstrecken. (Max. 2)</p>
            <button id="btn-buy-hv-relais" onclick="window.buyFurniture('hv_relais', 400)" class="btn-upgrade-exec">KAUFEN (400 C) [0/2]</button>
        </div>
    </div>`;
    
    if (!document.getElementById('menu-hochspannungs-verteiler')) {
        document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuVerteiler);
    }

    const newItems6 = ['hv_trafo', 'hv_kondensator', 'hv_relais'];
    newItems6.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

    const oldUpdateAusbauB6 = window.updateAusbauButtons;
    window.updateAusbauButtons = function() {
        if (typeof oldUpdateAusbauB6 === 'function') oldUpdateAusbauB6();
        if (typeof inventory === 'undefined') return;

        const newLimits6 = { hv_trafo: 1, hv_kondensator: 4, hv_relais: 2 };
        for (let k in newLimits6) {
            let max = newLimits6[k];
            let current = parseInt(inventory[k]) || 0;
            let btn = document.getElementById('btn-buy-' + k.replace(/_/g, '-'));

            if (btn) {
                if (current >= max) {
                    btn.innerText = "[ INSTALLIERT ]";
                    btn.disabled = true;
                    btn.style.background = "#333";
                    btn.style.color = "#555";
                    btn.style.border = "1px solid #333";
                    btn.style.cursor = "not-allowed";
                } else if (max > 1 && btn.innerText.includes('[')) {
                    btn.innerText = btn.innerText.replace(/\[\d+\/\d+\]/, `[${current}/${max}]`);
                }
            }
        }
    };

    const oldOpenRoomB6 = window.openRoom;
    window.openRoom = (type) => {
        if (typeof oldOpenRoomB6 === 'function') oldOpenRoomB6(type); 
        const menuVerteilerEl = document.getElementById('menu-hochspannungs-verteiler');
        if (menuVerteilerEl) menuVerteilerEl.style.display = (type === 'HOCHSPANNUNGS-VERTEILER') ? 'flex' : 'none';
        
        if (type === 'HOCHSPANNUNGS-VERTEILER') {
            const ph = document.getElementById('menu-platzhalter');
            if (ph) ph.style.setProperty('display', 'none', 'important'); 
        }
        setTimeout(window.updateAusbauButtons, 50); 
    };

    const oldBuyFurnitureB6 = window.buyFurniture;
    window.buyFurniture = async (type, cost) => {
        if (newItems6.includes(type)) {
            let maxAmt = (type === 'hv_kondensator') ? 4 : (type === 'hv_relais' ? 2 : 1);
            let current = parseInt(inventory[type]) || 0;
            if (current >= maxAmt) return; 
            
            if (gameState.credits >= cost) {
                gameState.credits -= cost;
                document.getElementById('display-credits').innerText = gameState.credits;

                inventory[type] = current + 1;
                
                const btn = document.getElementById(`btn-buy-${type.replaceAll('_', '-')}`);
                if (btn) {
                    if (inventory[type] >= maxAmt) {
                        btn.innerText = "[ INSTALLIERT ]";
                        btn.disabled = true;
                        btn.style.background = "#333";
                        btn.style.color = "#555";
                        btn.style.border = "1px solid #333";
                        btn.style.cursor = "not-allowed";
                    } else {
                        btn.innerText = `KAUFEN (${cost} C) [${inventory[type]}/${maxAmt}]`;
                    }
                }
                window.spawnFurniture(type, inventory[type]);
            } else { 
                if(typeof showCustomAlert === 'function') showCustomAlert("System: Credits unzureichend."); else alert("Credits fehlen!");
            }
        } else {
            if (typeof oldBuyFurnitureB6 === 'function') oldBuyFurnitureB6(type, cost); 
        }
    };

    const oldReloadB6 = window.reloadFurniture;
    window.reloadFurniture = (type) => {
        if (typeof oldReloadB6 === 'function') oldReloadB6(type);
        if (type === 'HOCHSPANNUNGS-VERTEILER') {
            if (inventory.hv_trafo > 0) window.spawnFurniture('hv_trafo', 1);
            for (let i = 1; i <= inventory.hv_kondensator; i++) window.spawnFurniture('hv_kondensator', i);
            for (let i = 1; i <= inventory.hv_relais; i++) window.spawnFurniture('hv_relais', i);
        }
    };

    const oldSpawnB6 = window.spawnFurniture;
    window.spawnFurniture = (type, count) => {
        if (typeof oldSpawnB6 === 'function') oldSpawnB6(type, count);
        const room = document.getElementById('room-area');
        if (!room || !newItems6.includes(type)) return;
        
        const item = document.createElement('div');
        item.classList.add('fixed-item');

        if (type === 'hv_trafo') {
            item.classList.add('item-hv-trafo');
            item.innerHTML = `
                <div class="trafo-coils">
                    <div class="trafo-coil"><div class="trafo-arc"></div></div>
                    <div class="trafo-coil"><div class="trafo-arc" style="animation-delay: 1.2s; border-color: #ffaa00;"></div></div>
                </div>
                <div class="trafo-base"></div>`;
        } else if (type === 'hv_kondensator') {
            item.classList.add('item-hv-kondensator');
            item.innerHTML = '<div class="cap-cap"></div><div class="cap-glass"><div class="cap-fluid"></div></div>';
            
            // Symmetrische Ausrichtung (Millimetergenau von links und rechts)
            if (count === 1) { item.style.left = '15%'; }
            else if (count === 2) { item.style.left = '28%'; }
            else if (count === 3) { item.style.right = '28%'; }
            else if (count === 4) { item.style.right = '15%'; }
            
            item.querySelector('.cap-fluid').style.animationDelay = `${count * 0.8}s`;
            
        } else if (type === 'hv_relais') {
            item.classList.add('item-hv-relais');
            item.innerHTML = '<div class="relais-mount"></div><div class="relais-node"><div class="relais-lightning"></div></div>';
            
            // Symmetrische Ausrichtung an der Decke
            if (count === 1) { 
                item.style.left = '25%'; 
                item.querySelector('.relais-lightning').style.animationDelay = '0.5s';
                item.querySelector('.relais-lightning').style.transform = 'rotate(-10deg)';
            } else if (count === 2) { 
                item.style.right = '25%'; 
                item.querySelector('.relais-lightning').style.animationDelay = '2.1s';
                item.querySelector('.relais-lightning').style.transform = 'rotate(10deg)';
            }
        }
        room.appendChild(item);
    };


/* ==== next block ==== */


// 1. Menü für Paradoxon-Filter injizieren
const menuParadoxon = `
<div id="menu-paradoxon-filter" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card">
        <b>[ CHRONO-KERN ]</b><p style="font-size: 0.7em; color: #aaa;">Stabilisiert die lokale Raumzeit.</p>
        <button id="btn-buy-chrono-kern" onclick="window.buyFurniture('chrono_kern', 4500)" class="btn-upgrade-exec" style="background:#c0f; color:#000; border:1px solid #c0f;">KAUFEN (4500 C + 60 MZ)</button>
    </div>
    <div class="upgrade-card">
        <b>[ ANOMALIE-DÄMPFER ]</b><p style="font-size: 0.7em; color: #aaa;">Unterdrückt Realitätsrisse. (Max. 3)</p>
        <button id="btn-buy-anomalie-daempfer" onclick="window.buyFurniture('anomalie_daempfer', 1100)" class="btn-upgrade-exec">KAUFEN (1100 C) [0/3]</button>
    </div>
    <div class="upgrade-card">
        <b>[ TACHYONEN-NETZ ]</b><p style="font-size: 0.7em; color: #aaa;">Deckenmontierter Partikel-Schutzschild.</p>
        <button id="btn-buy-tachyon-netz" onclick="window.buyFurniture('tachyon_netz', 600)" class="btn-upgrade-exec">KAUFEN (600 C)</button>
    </div>
</div>`;

if (!document.getElementById('menu-paradoxon-filter')) {
    document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuParadoxon);
}

// 2. Inventar Sicherung
const itemsParadox = ['chrono_kern', 'anomalie_daempfer', 'tachyon_netz'];
itemsParadox.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

// 3. MASTER-WÄCHTER ERWEITERN (Zwingt das globale System, die neuen Items zu kennen)
const oldUpdateAusbau_Paradox = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_Paradox === 'function') oldUpdateAusbau_Paradox(); // Aktualisiert alle alten Räume
    
    if (typeof inventory === 'undefined') return;
    
    const paradoxLimits = { chrono_kern: 1, anomalie_daempfer: 3, tachyon_netz: 1 };
    
    for (let k in paradoxLimits) {
        let max = paradoxLimits[k];
        let current = parseInt(inventory[k]) || 0;
        let btn = document.getElementById('btn-buy-' + k.replace(/_/g, '-'));

        if (btn) {
            if (current >= max) {
                btn.innerText = "[ INSTALLIERT ]";
                btn.disabled = true;
                btn.style.setProperty('background', '#333', 'important');
                btn.style.setProperty('color', '#555', 'important');
                btn.style.setProperty('border', '1px solid #333', 'important');
                btn.style.setProperty('cursor', 'not-allowed', 'important');
            } else {
                btn.disabled = false;
                btn.style.background = "";
                btn.style.color = "";
                btn.style.border = "";
                btn.style.cursor = "pointer";
                if (max > 1 && btn.innerText.includes('[')) {
                    btn.innerText = btn.innerText.replace(/\[\d+\/\d+\]/, `[${current}/${max}]`);
                }
            }
        }
    }
};

// 4. Raum-Weiche patchen & Glitch aktivieren
const oldOpenRoomParadox = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoomParadox) oldOpenRoomParadox(type);
    const menu = document.getElementById('menu-paradoxon-filter');
    if (menu) menu.style.display = (type === 'PARADOXON-FILTER') ? 'flex' : 'none';
    
    if (type === 'PARADOXON-FILTER') {
        const ph = document.getElementById('menu-platzhalter');
        if (ph) ph.style.setProperty('display', 'none', 'important');
        window.reloadFurniture(type);
        window.updateAusbauButtons(); // Aktualisiert die Buttons direkt beim Betreten
    }
    
    // Glitch-Status verwalten
    const glitchLayer = document.getElementById('dimension-glitch-layer');
    if (glitchLayer) {
        if (type === 'PARADOXON-FILTER') glitchLayer.classList.add('active');
        else glitchLayer.classList.remove('active');
    }
};

// 5. Shop-Kauf Logik (Credits + MZ)
const oldBuyFurnitureParadox = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsParadox.includes(type)) {
        let maxAmt = (type === 'anomalie_daempfer') ? 3 : 1;
        let current = parseInt(inventory[type]) || 0;
        if (current >= maxAmt) return;
        
        let isKern = (type === 'chrono_kern');
        let costC = isKern ? 4500 : cost;
        let costMZ = isKern ? 60 : 0;
        
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC;
            document.getElementById('display-credits').innerText = gameState.credits;
            
            if (isKern) {
                gameState.materieZellen -= costMZ;
                document.getElementById('display-mz').innerText = gameState.materieZellen;
                // Speichern der MZ
                const ag = localStorage.getItem("flux_last_agent") || "";
                if (ag) {
                    const mainPKey = 'flux_agent_' + ag.toLowerCase();
                    let d = {}; const mainP = localStorage.getItem(mainPKey);
                    if (mainP) { try { d = JSON.parse(mainP); } catch(e) {} }
                    d.mz = gameState.materieZellen; 
                    localStorage.setItem(mainPKey, JSON.stringify(d));
                    if (window.db && window.setDoc) {
                        try { window.setDoc(window.doc(window.db, "agenten", window.agentSlug(ag)), { materiezellen: gameState.materieZellen }, { merge: true }); } catch(e) {}
                    }
                }
            }
            
            inventory[type] = current + 1; // Sicherer Zähler
            window.updateAusbauButtons(); // Globales Update erzwingen
            window.spawnFurniture(type, inventory[type]);
        } else {
            let msg = isKern ? "System: 4500 C + 60 MZ benötigt." : "System: Credits unzureichend.";
            if(typeof showCustomAlert === 'function') showCustomAlert(msg);
        }
    } else if (oldBuyFurnitureParadox) oldBuyFurnitureParadox(type, cost);
};

// 6. Möbel Reload patchen
const oldReloadParadox = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReloadParadox) oldReloadParadox(type);
    if (type === 'PARADOXON-FILTER') {
        const room = document.getElementById('room-area');
        if (room && !document.getElementById('dimension-glitch-layer')) {
            const glitch = document.createElement('div'); 
            glitch.id = 'dimension-glitch-layer';
            glitch.classList.add('active'); // Direkt aktivieren
            room.appendChild(glitch);
        }
        if (inventory.tachyon_netz > 0) window.spawnFurniture('tachyon_netz', 1);
        if (inventory.chrono_kern > 0) window.spawnFurniture('chrono_kern', 1);
        for (let i = 1; i <= inventory.anomalie_daempfer; i++) window.spawnFurniture('anomalie_daempfer', i);
    }
};

// 7. Möbel Spawn patchen
const oldSpawnParadox = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawnParadox) oldSpawnParadox(type, count);
    const room = document.getElementById('room-area');
    if (!room || !itemsParadox.includes(type)) return;
    
    const item = document.createElement('div');
    item.classList.add('fixed-item');

    if (type === 'chrono_kern') {
        item.classList.add('item-chrono-kern');
        item.innerHTML = '<div class="chrono-ring-1"></div><div class="chrono-ring-2"></div><div class="chrono-sphere"></div><div class="chrono-base"></div>';
    } else if (type === 'anomalie_daempfer') {
        item.classList.add('item-anomalie-daempfer');
        item.innerHTML = '<div class="daempfer-pillar"><div class="daempfer-core"></div></div>';
        
        if (count === 1) { item.style.left = '15%'; }
        else if (count === 2) { item.style.right = '15%'; }
        else if (count === 3) { 
            item.style.left = '25%'; 
            item.style.bottom = '85px';
            item.style.transform = 'scale(0.85)'; 
            item.style.zIndex = '1'; 
        }
        item.querySelector('.daempfer-core').style.animationDelay = `${count * 0.5}s`;
        
    } else if (type === 'tachyon_netz') {
        item.classList.add('item-tachyon-netz');
        item.innerHTML = '<div class="netz-emitter"></div>';
    }
    room.appendChild(item);
};


/* ==== next block ==== */


// 1. Menü für Impuls-Kondensator injizieren
const menuImpuls = `
<div id="menu-impuls-kondensator" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card">
        <b>[ OMEGA-PULSGENERATOR ]</b><p style="font-size: 0.7em; color: #aaa;">Baut extreme Ladungen für EMP-Entladungen auf.</p>
        <button id="btn-buy-impuls-kern" onclick="window.buyFurniture('impuls_kern', 3200)" class="btn-upgrade-exec" style="background:#00aaff; color:#000; border:1px solid #00aaff;">KAUFEN (3200 C + 30 MZ)</button>
    </div>
    <div class="upgrade-card">
        <b>[ PLASMA-SUPRALEITER ]</b><p style="font-size: 0.7em; color: #aaa;">Dynamische Kühlsäulen. (Max. 2)</p>
        <button id="btn-buy-supraleiter" onclick="window.buyFurniture('supraleiter', 800)" class="btn-upgrade-exec">KAUFEN (800 C) [0/2]</button>
    </div>
    <div class="upgrade-card">
        <b>[ DECKEN-ENTLADER ]</b><p style="font-size: 0.7em; color: #aaa;">Zieht überschüssige Energie nach oben ab.</p>
        <button id="btn-buy-decken-entlader" onclick="window.buyFurniture('decken_entlader', 500)" class="btn-upgrade-exec">KAUFEN (500 C)</button>
    </div>
</div>`;

if (!document.getElementById('menu-impuls-kondensator')) {
    document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuImpuls);
}

// 2. Inventar Sicherung
const itemsImpuls = ['impuls_kern', 'supraleiter', 'decken_entlader'];
itemsImpuls.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

// 3. MASTER-WÄCHTER ERWEITERN (Alle vorherigen + die neuen Items)
const oldUpdateAusbau_Impuls = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_Impuls === 'function') oldUpdateAusbau_Impuls(); 
    
    if (typeof inventory === 'undefined') return;
    
    const impulsLimits = { impuls_kern: 1, supraleiter: 2, decken_entlader: 1 };
    
    for (let k in impulsLimits) {
        let max = impulsLimits[k];
        let current = parseInt(inventory[k]) || 0;
        let btn = document.getElementById('btn-buy-' + k.replace(/_/g, '-'));

        if (btn) {
            if (current >= max) {
                btn.innerText = "[ INSTALLIERT ]";
                btn.disabled = true;
                btn.style.setProperty('background', '#333', 'important');
                btn.style.setProperty('color', '#555', 'important');
                btn.style.setProperty('border', '1px solid #333', 'important');
                btn.style.setProperty('cursor', 'not-allowed', 'important');
            } else {
                btn.disabled = false;
                btn.style.background = "";
                btn.style.color = "";
                btn.style.border = "";
                btn.style.cursor = "pointer";
                if (max > 1 && btn.innerText.includes('[')) {
                    btn.innerText = btn.innerText.replace(/\[\d+\/\d+\]/, `[${current}/${max}]`);
                }
            }
        }
    }
};

// 4. Raum-Weiche patchen & EMP Glitch aktivieren
const oldOpenRoomImpuls = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoomImpuls) oldOpenRoomImpuls(type);
    const menu = document.getElementById('menu-impuls-kondensator');
    if (menu) menu.style.display = (type === 'IMPULS-KONDENSATOR') ? 'flex' : 'none';
    
    if (type === 'IMPULS-KONDENSATOR') {
        const ph = document.getElementById('menu-platzhalter');
        if (ph) ph.style.setProperty('display', 'none', 'important');
        window.reloadFurniture(type);
        window.updateAusbauButtons(); 
    } else {
        // Raum-Glitch deaktivieren, wenn man den Raum verlässt
        const roomArea = document.getElementById('room-area');
        if (roomArea) roomArea.classList.remove('emp-active');
    }
};

// 5. Shop-Kauf Logik (Credits + MZ für den Kern)
const oldBuyFurnitureImpuls = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsImpuls.includes(type)) {
        let maxAmt = (type === 'supraleiter') ? 2 : 1;
        let current = parseInt(inventory[type]) || 0;
        if (current >= maxAmt) return;
        
        let isKern = (type === 'impuls_kern');
        let costC = isKern ? 3200 : cost;
        let costMZ = isKern ? 30 : 0;
        
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC;
            document.getElementById('display-credits').innerText = gameState.credits;
            
            if (isKern) {
                gameState.materieZellen -= costMZ;
                document.getElementById('display-mz').innerText = gameState.materieZellen;
                // Speichern der MZ
                const ag = localStorage.getItem("flux_last_agent") || "";
                if (ag) {
                    const mainPKey = 'flux_agent_' + ag.toLowerCase();
                    let d = {}; const mainP = localStorage.getItem(mainPKey);
                    if (mainP) { try { d = JSON.parse(mainP); } catch(e) {} }
                    d.mz = gameState.materieZellen; 
                    localStorage.setItem(mainPKey, JSON.stringify(d));
                    if (window.db && window.setDoc) {
                        try { window.setDoc(window.doc(window.db, "agenten", window.agentSlug(ag)), { materiezellen: gameState.materieZellen }, { merge: true }); } catch(e) {}
                    }
                }
            }
            
            inventory[type] = current + 1; 
            window.updateAusbauButtons(); 
            window.spawnFurniture(type, inventory[type]);
        } else {
            let msg = isKern ? "System: 3200 C + 30 MZ benötigt." : "System: Credits unzureichend.";
            if(typeof showCustomAlert === 'function') showCustomAlert(msg);
        }
    } else if (oldBuyFurnitureImpuls) oldBuyFurnitureImpuls(type, cost);
};

// 6. Möbel Reload patchen
const oldReloadImpuls = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReloadImpuls) oldReloadImpuls(type);
    if (type === 'IMPULS-KONDENSATOR') {
        if (inventory.decken_entlader > 0) window.spawnFurniture('decken_entlader', 1);
        if (inventory.impuls_kern > 0) window.spawnFurniture('impuls_kern', 1);
        for (let i = 1; i <= inventory.supraleiter; i++) window.spawnFurniture('supraleiter', i);
    }
};

// 7. Möbel Spawn patchen
const oldSpawnImpuls = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawnImpuls) oldSpawnImpuls(type, count);
    const room = document.getElementById('room-area');
    if (!room || !itemsImpuls.includes(type)) return;
    
    const item = document.createElement('div');
    item.classList.add('fixed-item');

    if (type === 'impuls_kern') {
        item.classList.add('item-impuls-kern');
        item.innerHTML = `
            <div class="kern-ring-accel"></div>
            <div class="kern-gehaeuse"></div>
            <div class="kern-base"></div>`;
        
        // Fügt dem gesamten Raum den Glitch-Effekt hinzu, sobald der Kern gebaut wird
        room.classList.add('emp-active');
        
    } else if (type === 'supraleiter') {
        item.classList.add('item-supraleiter');
        item.innerHTML = '<div class="supra-energy-pillar"></div><div class="supra-base"></div>';
        
        // Symmetrische Verteilung links und rechts (inklusive sync-animation delay falls gewünscht)
        if (count === 1) { item.style.left = '20%'; }
        else if (count === 2) { item.style.right = '20%'; }
        
    } else if (type === 'decken_entlader') {
        item.classList.add('item-decken-entlader');
        item.innerHTML = '<div class="entlader-mount"></div><div class="entlader-spark"></div><div class="entlader-beam"></div>';
    }
    room.appendChild(item);
};


/* ==== next block ==== */


const menuOszillation = `
<div id="menu-oszillations-kammer" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card">
        <b>[ OFFIZIERS-BETT ]</b><p style="font-size: 0.7em; color: #aaa;">Holzbett auf rotem Teppich, links an der Wand positioniert.</p>
        <button id="btn-buy-offiziers-bett" onclick="window.buyFurniture('offiziers_bett', 1500)" class="btn-upgrade-exec">KAUFEN (1500 C)</button>
    </div>
    <div class="upgrade-card">
        <b>[ HOLO-SCHREIBTISCH ]</b><p style="font-size: 0.7em; color: #aaa;">Massiver Holztisch mit Carvings an der Platte.</p>
        <button id="btn-buy-offiziers-desk" onclick="window.buyFurniture('offiziers_desk', 1200)" class="btn-upgrade-exec">KAUFEN (1200 C)</button>
    </div>
    <div class="upgrade-card">
        <b>[ GETRÄNKE-REGAL ]</b><p style="font-size: 0.7em; color: #aaa;">Kompaktes Holzregal mit Carvings im Sockel.</p>
        <button id="btn-buy-offiziers-bar" onclick="window.buyFurniture('offiziers_bar', 900)" class="btn-upgrade-exec">KAUFEN (900 C)</button>
    </div>
    <div class="upgrade-card">
        <b>[ HISTORISCHES GEMÄLDE ]</b><p style="font-size: 0.7em; color: #aaa;">Originalkunst (HOCHKANT - Mona Lisa).</p>
        <button id="btn-buy-offiziers-bild" onclick="window.buyFurniture('offiziers_bild', 2500)" class="btn-upgrade-exec" style="background:#ffaa00; color:#000; border:1px solid #ffaa00;">KAUFEN (2500 C)</button>
    </div>
</div>`;

if (!document.getElementById('menu-oszillations-kammer')) {
    document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuOszillation);
}

const itemsOszillation = ['offiziers_bett', 'offiziers_desk', 'offiziers_bar', 'offiziers_bild'];
itemsOszillation.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_Oszillation = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_Oszillation === 'function') oldUpdateAusbau_Oszillation(); 
    if (typeof inventory === 'undefined') return;
    
    const oszillationLimits = { offiziers_bett: 1, offiziers_desk: 1, offiziers_bar: 1, offiziers_bild: 1 };
    
    for (let k in oszillationLimits) {
        let max = oszillationLimits[k];
        let current = parseInt(inventory[k]) || 0;
        let btn = document.getElementById('btn-buy-' + k.replace(/_/g, '-'));

        if (btn) {
            if (current >= max) {
                btn.innerText = "[ INSTALLIERT ]";
                btn.disabled = true;
                btn.style.setProperty('background', '#333', 'important');
                btn.style.setProperty('color', '#555', 'important');
                btn.style.setProperty('border', '1px solid #333', 'important');
                btn.style.setProperty('cursor', 'not-allowed', 'important');
            } else {
                btn.disabled = false;
                btn.style.background = "";
                btn.style.color = "";
                btn.style.border = "";
                btn.style.cursor = "pointer";
            }
        }
    }
};

const oldOpenRoomOszillation = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoomOszillation) oldOpenRoomOszillation(type);
    const menu = document.getElementById('menu-oszillations-kammer');
    if (menu) menu.style.display = (type === 'OSZILLATIONS-KAMMER') ? 'flex' : 'none';
    
    if (type === 'OSZILLATIONS-KAMMER') {
        const ph = document.getElementById('menu-platzhalter');
        if (ph) ph.style.setProperty('display', 'none', 'important');
        const titleEl = document.getElementById('room-title-detail');
        if (titleEl) titleEl.innerText = "OSZILLATIONS-KAMMER (OFFIZIERS-SUITE)";
        window.reloadFurniture(type);
        window.updateAusbauButtons(); 
    }
};

const oldBuyFurnitureOszillation = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsOszillation.includes(type)) {
        let maxAmt = 1;
        let current = parseInt(inventory[type]) || 0;
        if (current >= maxAmt) return;
        
        if (gameState.credits >= cost) {
            gameState.credits -= cost;
            document.getElementById('display-credits').innerText = gameState.credits;
            inventory[type] = current + 1; 
            window.updateAusbauButtons(); 
            window.spawnFurniture(type, inventory[type]);
        } else {
            if(typeof showCustomAlert === 'function') showCustomAlert("System: Credits unzureichend.");
        }
    } else if (oldBuyFurnitureOszillation) oldBuyFurnitureOszillation(type, cost);
};

const oldReloadOszillation = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReloadOszillation) oldReloadOszillation(type);
    if (type === 'OSZILLATIONS-KAMMER') {
        if (inventory.offiziers_bild > 0) window.spawnFurniture('offiziers_bild', 1);
        if (inventory.offiziers_bett > 0) window.spawnFurniture('offiziers_bett', 1);
        if (inventory.offiziers_bar > 0) window.spawnFurniture('offiziers_bar', 1);
        if (inventory.offiziers_desk > 0) window.spawnFurniture('offiziers_desk', 1);
    }
};

const oldSpawnOszillation = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawnOszillation) oldSpawnOszillation(type, count);
    const room = document.getElementById('room-area');
    if (!room || !itemsOszillation.includes(type)) return;
    
    const item = document.createElement('div');
    item.classList.add('fixed-item');

    if (type === 'offiziers_bild') {
        item.classList.add('item-offiziers-bild');
        item.innerHTML = '<div class="bild-licht"></div>';
    } else if (type === 'offiziers_bett') {
        item.classList.add('item-offiziers-bett');
        item.innerHTML = `
            <div class="bett-teppich"></div>
            <div class="bett-legs-side"><div class="bett-leg"></div><div class="bett-leg"></div><div class="bett-leg"></div></div>
            <div class="bett-frame-side">
                <div class="bett-headboard-side holz-carving"></div>
                <div class="bett-matratze-side"><div class="bett-pillow-side"></div><div class="bett-decke-side"></div></div>
                <div class="bett-footboard-side holz-carving"></div>
            </div>`;
    } else if (type === 'offiziers_bar') {
        item.classList.add('item-offiziers-bar');
        item.innerHTML = `
            <div class="bar-shelf"><div class="bottle bottle-1"><div class="bottle-cap"></div></div><div class="bottle bottle-2"><div class="bottle-cap"></div></div></div>
            <div class="bar-shelf"><div class="bottle bottle-3"><div class="bottle-cap"></div></div><div class="bottle bottle-1"><div class="bottle-cap"></div></div></div>
            <div class="bar-base holz-carving"></div>
        `;
    } else if (type === 'offiziers_desk') {
        item.classList.add('item-offiziers-desk');
        item.innerHTML = `
            <div class="desk-platte-massive holz-carving">
                <div class="desk-holo-stream"></div>
                <div class="desk-holo-projector"></div>
            </div>
            <div class="desk-beine-massive">
                <div class="desk-bein"></div><div class="desk-bein"></div>
            </div>`;
    }
    room.appendChild(item);
};


/* ==== next block ==== */


// === HELPER: Materie-Zellen speichern (für alle neuen Räume) ===
window._saveMZ = function() {
    const ag = localStorage.getItem("flux_last_agent") || "";
    if (!ag) return;
    const mainPKey = 'flux_agent_' + ag.toLowerCase();
    let d = {}; const mainP = localStorage.getItem(mainPKey);
    if (mainP) { try { d = JSON.parse(mainP); } catch(e) {} }
    d.mz = gameState.materieZellen;
    localStorage.setItem(mainPKey, JSON.stringify(d));
    if (window.db && window.setDoc) {
        try { window.setDoc(window.doc(window.db, "agenten", window.agentSlug(ag)), { materiezellen: gameState.materieZellen }, { merge: true }); } catch(e) {}
    }
};


/* ==== next block ==== */


// === TRANSFORMATOREN-STATION ===
const menuTransStation = `
<div id="menu-transformatoren-station" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ TEMPORALER ENERGIE-INVERTER ]</b><p style="font-size:0.7em; color:#aaa;">Fetter Kasten mit schwebenden Magnet-Isolatoren.</p><button id="btn-buy-temp-inverter" onclick="window.buyFurniture('temp_inverter', 2800)" class="btn-upgrade-exec" style="background:#c0f; color:#000; border:1px solid #c0f;">KAUFEN (2800 C + 40 MZ)</button></div>
    <div class="upgrade-card"><b>[ CHRONO-VERTEILERKNOTEN ]</b><p style="font-size:0.7em; color:#aaa;">Schlanker Hologramm-Schrank.</p><button id="btn-buy-chrono-knoten" onclick="window.buyFurniture('chrono_knoten', 950)" class="btn-upgrade-exec">KAUFEN (950 C)</button></div>
    <div class="upgrade-card"><b>[ WARTUNGSDROHNE ]</b><p style="font-size:0.7em; color:#aaa;">Schwebt deaktiviert in einer Ladestation.</p><button id="btn-buy-wartungs-drohne" onclick="window.buyFurniture('wartungs_drohne', 450)" class="btn-upgrade-exec">KAUFEN (450 C)</button></div>
    <div class="upgrade-card"><b>[ PLASMA-RÖHRENLAMPE ]</b><p style="font-size:0.7em; color:#aaa;">Glasröhre mit lila Plasmafaden.</p><button id="btn-buy-lampe-trans" onclick="window.buyFurniture('lampe_trans', 150)" class="btn-upgrade-exec">KAUFEN (150 C)</button></div>
</div>`;
if (!document.getElementById('menu-transformatoren-station')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuTransStation);

const itemsTransStation = ['temp_inverter','chrono_knoten','wartungs_drohne','lampe_trans'];
itemsTransStation.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_TS = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_TS === 'function') oldUpdateAusbau_TS();
    if (typeof inventory === 'undefined') return;
    const limits = { temp_inverter:1, chrono_knoten:1, wartungs_drohne:1, lampe_trans:1 };
    for (let k in limits) {
        let max = limits[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_TS = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_TS) oldOpenRoom_TS(type);
    const m = document.getElementById('menu-transformatoren-station');
    if (m) m.style.display = (type === 'TRANSFORMATOREN-STATION') ? 'flex' : 'none';
    if (type === 'TRANSFORMATOREN-STATION') { const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important'); window.reloadFurniture(type); window.updateAusbauButtons(); }
};

const oldBuyFurniture_TS = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsTransStation.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'temp_inverter'); let costC = cost; let costMZ = isMZ ? 40 : 0;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? "System: 2800 C + 40 MZ benötigt." : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_TS) oldBuyFurniture_TS(type, cost);
};

const oldReload_TS = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_TS) oldReload_TS(type);
    if (type === 'TRANSFORMATOREN-STATION') {
        if (inventory.lampe_trans > 0) window.spawnFurniture('lampe_trans', 1);
        if (inventory.temp_inverter > 0) window.spawnFurniture('temp_inverter', 1);
        if (inventory.chrono_knoten > 0) window.spawnFurniture('chrono_knoten', 1);
        if (inventory.wartungs_drohne > 0) window.spawnFurniture('wartungs_drohne', 1);
    }
};

const oldSpawn_TS = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_TS) oldSpawn_TS(type, count);
    const room = document.getElementById('room-area'); if (!room || !itemsTransStation.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'temp_inverter') {
        item.classList.add('item-temp-inverter');
        item.innerHTML = '<div class="ti-casing"><div class="ti-magnet"><div class="ti-bolt"></div></div><div class="ti-magnet"><div class="ti-bolt" style="animation-delay:0.7s;"></div></div><div class="ti-led l1"></div><div class="ti-led l2"></div></div><div class="ti-base"></div>';
    } else if (type === 'chrono_knoten') {
        item.classList.add('item-chrono-knoten');
        item.innerHTML = '<div class="ck-frame"><div class="ck-warn-bar b1"></div><div class="ck-warn-bar b2"></div><div class="ck-warn-bar b3"></div></div><div class="ck-base"></div>';
    } else if (type === 'wartungs_drohne') {
        item.classList.add('item-wartungs-drohne');
        item.innerHTML = '<div class="wd-body"><div class="wd-eye"></div><div class="wd-arm l"></div><div class="wd-arm r"></div></div><div class="wd-station"></div>';
    } else if (type === 'lampe_trans') {
        item.classList.add('item-lampe-trans');
        item.innerHTML = '<div class="lt-plasma"></div>';
    }
    room.appendChild(item);
};


/* ==== next block ==== */


// === RENAISSANCE-GENERATOR ===
const menuRenaissance = `
<div id="menu-renaissance-generator" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ MATERIE-REKONSTRUKTOR ]</b><p style="font-size:0.7em; color:#aaa;">Schlanker Zylinder, quantenblau glühend.</p><button id="btn-buy-materie-rekon" onclick="window.buyFurniture('materie_rekon', 3200)" class="btn-upgrade-exec" style="background:#0af; color:#000; border:1px solid #0af;">KAUFEN (3200 C + 50 MZ)</button></div>
    <div class="upgrade-card"><b>[ SINGULARITÄTS-KOMPRESSOR ]</b><p style="font-size:0.7em; color:#aaa;">Schwebender Amboss-Block.</p><button id="btn-buy-singularitaet-komp" onclick="window.buyFurniture('singularitaet_komp', 1500)" class="btn-upgrade-exec" style="background:#0f8; color:#000; border:1px solid #0f8;">KAUFEN (1500 C + 20 MZ)</button></div>
    <div class="upgrade-card"><b>[ NULLPUNKT-ZELLEN-CLUSTER ]</b><p style="font-size:0.7em; color:#aaa;">Verbundene Energie-Würfel an der Wand.</p><button id="btn-buy-nullpunkt-cluster" onclick="window.buyFurniture('nullpunkt_cluster', 600)" class="btn-upgrade-exec">KAUFEN (600 C)</button></div>
    <div class="upgrade-card"><b>[ LUMINESZENZ-SPULE ]</b><p style="font-size:0.7em; color:#aaa;">Schwebende gelbe Lichtspule.</p><button id="btn-buy-lampe-ren" onclick="window.buyFurniture('lampe_ren', 120)" class="btn-upgrade-exec">KAUFEN (120 C)</button></div>
</div>`;
if (!document.getElementById('menu-renaissance-generator')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuRenaissance);

const itemsRenaissance = ['materie_rekon','singularitaet_komp','nullpunkt_cluster','lampe_ren'];
itemsRenaissance.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_RG = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_RG === 'function') oldUpdateAusbau_RG();
    if (typeof inventory === 'undefined') return;
    const limits = { materie_rekon:1, singularitaet_komp:1, nullpunkt_cluster:1, lampe_ren:1 };
    for (let k in limits) {
        let max = limits[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_RG = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_RG) oldOpenRoom_RG(type);
    const m = document.getElementById('menu-renaissance-generator');
    if (m) m.style.display = (type === 'RENAISSANCE-GENERATOR') ? 'flex' : 'none';
    if (type === 'RENAISSANCE-GENERATOR') { const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important'); window.reloadFurniture(type); window.updateAusbauButtons(); }
};

const oldBuyFurniture_RG = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsRenaissance.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'materie_rekon' || type === 'singularitaet_komp');
        let costC = cost; let costMZ = 0;
        if (type === 'materie_rekon') costMZ = 50;
        if (type === 'singularitaet_komp') costMZ = 20;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? `System: ${cost} C + ${costMZ} MZ benötigt.` : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_RG) oldBuyFurniture_RG(type, cost);
};

const oldReload_RG = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_RG) oldReload_RG(type);
    if (type === 'RENAISSANCE-GENERATOR') {
        if (inventory.lampe_ren > 0) window.spawnFurniture('lampe_ren', 1);
        if (inventory.materie_rekon > 0) window.spawnFurniture('materie_rekon', 1);
        if (inventory.singularitaet_komp > 0) window.spawnFurniture('singularitaet_komp', 1);
        if (inventory.nullpunkt_cluster > 0) window.spawnFurniture('nullpunkt_cluster', 1);
    }
};

const oldSpawn_RG = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_RG) oldSpawn_RG(type, count);
    const room = document.getElementById('room-area'); if (!room || !itemsRenaissance.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'materie_rekon') {
        item.classList.add('item-materie-rekon');
        item.innerHTML = '<div class="mr-ring"></div><div class="mr-ring r2"></div><div class="mr-cylinder"></div><div class="mr-base"></div>';
    } else if (type === 'singularitaet_komp') {
        item.classList.add('item-singularitaet-komp');
        item.innerHTML = '<div class="sk-anvil"><div class="sk-led"></div></div><div class="sk-base"></div>';
    } else if (type === 'nullpunkt_cluster') {
        item.classList.add('item-nullpunkt-cluster');
        item.innerHTML = '<div class="np-cube"></div><div class="np-cube"></div><div class="np-cube"></div><div class="np-cube"></div>';
    } else if (type === 'lampe_ren') {
        item.classList.add('item-lampe-ren');
        item.innerHTML = '<div class="lr-mount"></div><div class="lr-coil"></div>';
    }
    room.appendChild(item);
};


/* ==== next block ==== */


// === THERMO-KOPPLER ===
const menuThermo = `
<div id="menu-thermo-koppler" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ ERDKERN-RESONATOR ]</b><p style="font-size:0.7em; color:#aaa;">Rotierender Laser-Bohrkopf.</p><button id="btn-buy-erdkern-res" onclick="window.buyFurniture('erdkern_res', 3500)" class="btn-upgrade-exec" style="background:#0f8; color:#000; border:1px solid #0f8;">KAUFEN (3500 C + 60 MZ)</button></div>
    <div class="upgrade-card"><b>[ KRYO-KÜHLSCHLEIFEN ]</b><p style="font-size:0.7em; color:#aaa;">Wandsystem mit blauem Kühlmittel.</p><button id="btn-buy-kryo-kuehl" onclick="window.buyFurniture('kryo_kuehl', 850)" class="btn-upgrade-exec">KAUFEN (850 C)</button></div>
    <div class="upgrade-card"><b>[ HOLO-THERMOKONSOLE ]</b><p style="font-size:0.7em; color:#aaa;">Schwebendes Interface.</p><button id="btn-buy-holo-thermo" onclick="window.buyFurniture('holo_thermo', 650)" class="btn-upgrade-exec">KAUFEN (650 C)</button></div>
    <div class="upgrade-card"><b>[ MAGMA-KRISTALL-LAMPE ]</b><p style="font-size:0.7em; color:#aaa;">Pulsiert langsam rot.</p><button id="btn-buy-lampe-thermo" onclick="window.buyFurniture('lampe_thermo', 200)" class="btn-upgrade-exec">KAUFEN (200 C)</button></div>
</div>`;
if (!document.getElementById('menu-thermo-koppler')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuThermo);

const itemsThermo = ['erdkern_res','kryo_kuehl','holo_thermo','lampe_thermo'];
itemsThermo.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_TK = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_TK === 'function') oldUpdateAusbau_TK();
    if (typeof inventory === 'undefined') return;
    const limits = { erdkern_res:1, kryo_kuehl:1, holo_thermo:1, lampe_thermo:1 };
    for (let k in limits) {
        let max = limits[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_TK = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_TK) oldOpenRoom_TK(type);
    const m = document.getElementById('menu-thermo-koppler');
    if (m) m.style.display = (type === 'THERMO-KOPPLER') ? 'flex' : 'none';
    if (type === 'THERMO-KOPPLER') { const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important'); window.reloadFurniture(type); window.updateAusbauButtons(); }
};

const oldBuyFurniture_TK = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsThermo.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'erdkern_res'); let costC = cost; let costMZ = isMZ ? 60 : 0;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? "System: 3500 C + 60 MZ benötigt." : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_TK) oldBuyFurniture_TK(type, cost);
};

const oldReload_TK = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_TK) oldReload_TK(type);
    if (type === 'THERMO-KOPPLER') {
        if (inventory.lampe_thermo > 0) window.spawnFurniture('lampe_thermo', 1);
        if (inventory.erdkern_res > 0) window.spawnFurniture('erdkern_res', 1);
        if (inventory.kryo_kuehl > 0) window.spawnFurniture('kryo_kuehl', 1);
        if (inventory.holo_thermo > 0) window.spawnFurniture('holo_thermo', 1);
    }
};

const oldSpawn_TK = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_TK) oldSpawn_TK(type, count);
    const room = document.getElementById('room-area'); if (!room || !itemsThermo.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'erdkern_res') {
        item.classList.add('item-erdkern-res');
        item.innerHTML = '<div class="er-control"><div class="er-led-bar"></div><div class="er-led-bar"></div><div class="er-led-bar"></div></div><div class="er-drill"></div><div class="er-bit"></div><div class="er-base"></div>';
    } else if (type === 'kryo_kuehl') {
        item.classList.add('item-kryo-kuehl');
        item.innerHTML = '<div class="kk-tube"><div class="kk-fluid"></div></div><div class="kk-tube"><div class="kk-fluid" style="animation-delay:0.3s;"></div></div><div class="kk-tube"><div class="kk-fluid" style="animation-delay:0.6s;"></div></div><div class="kk-tube"><div class="kk-fluid" style="animation-delay:0.9s;"></div></div>';
    } else if (type === 'holo_thermo') {
        item.classList.add('item-holo-thermo');
        item.innerHTML = '<div class="ht-screen"><div class="ht-led l"></div><div class="ht-led r"></div><div class="ht-needle"></div></div><div class="ht-base"></div>';
    } else if (type === 'lampe_thermo') {
        item.classList.add('item-lampe-thermo');
        item.innerHTML = '<div class="lt-crystal"></div>';
    }
    room.appendChild(item);
};


/* ==== next block ==== */


// === KINETIK-LABOR ===
const menuKinetik = `
<div id="menu-kinetik-labor" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ GRAVITATIONS-ZENTRIFUGE ]</b><p style="font-size:0.7em; color:#aaa;">Offener Zylinder mit schwebendem Kern.</p><button id="btn-buy-grav-zentrifuge" onclick="window.buyFurniture('grav_zentrifuge', 3000)" class="btn-upgrade-exec" style="background:#0af; color:#000; border:1px solid #0af;">KAUFEN (3000 C + 45 MZ)</button></div>
    <div class="upgrade-card"><b>[ KINETIK-ABSORBER-GITTER ]</b><p style="font-size:0.7em; color:#aaa;">Bodenplatten mit Energielinien.</p><button id="btn-buy-kinetik-absorber" onclick="window.buyFurniture('kinetik_absorber', 1200)" class="btn-upgrade-exec">KAUFEN (1200 C)</button></div>
    <div class="upgrade-card"><b>[ HOLO-MATRIX-PROJEKTOR ]</b><p style="font-size:0.7em; color:#aaa;">Zeigt komplexe Gleichungen.</p><button id="btn-buy-holo-matrix" onclick="window.buyFurniture('holo_matrix', 750)" class="btn-upgrade-exec">KAUFEN (750 C)</button></div>
    <div class="upgrade-card"><b>[ PHOTONEN-PENDEL ]</b><p style="font-size:0.7em; color:#aaa;">Schwingt leicht, dynamische Schatten.</p><button id="btn-buy-lampe-kinetik" onclick="window.buyFurniture('lampe_kinetik', 180)" class="btn-upgrade-exec">KAUFEN (180 C)</button></div>
</div>`;
if (!document.getElementById('menu-kinetik-labor')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuKinetik);

const itemsKinetik = ['grav_zentrifuge','kinetik_absorber','holo_matrix','lampe_kinetik'];
itemsKinetik.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_KL = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_KL === 'function') oldUpdateAusbau_KL();
    if (typeof inventory === 'undefined') return;
    const limits = { grav_zentrifuge:1, kinetik_absorber:1, holo_matrix:1, lampe_kinetik:1 };
    for (let k in limits) {
        let max = limits[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_KL = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_KL) oldOpenRoom_KL(type);
    const m = document.getElementById('menu-kinetik-labor');
    if (m) m.style.display = (type === 'KINETIK-LABOR') ? 'flex' : 'none';
    if (type === 'KINETIK-LABOR') { const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important'); window.reloadFurniture(type); window.updateAusbauButtons(); }
};

const oldBuyFurniture_KL = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsKinetik.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'grav_zentrifuge'); let costC = cost; let costMZ = isMZ ? 45 : 0;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? "System: 3000 C + 45 MZ benötigt." : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_KL) oldBuyFurniture_KL(type, cost);
};

const oldReload_KL = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_KL) oldReload_KL(type);
    if (type === 'KINETIK-LABOR') {
        if (inventory.lampe_kinetik > 0) window.spawnFurniture('lampe_kinetik', 1);
        if (inventory.grav_zentrifuge > 0) window.spawnFurniture('grav_zentrifuge', 1);
        if (inventory.kinetik_absorber > 0) window.spawnFurniture('kinetik_absorber', 1);
        if (inventory.holo_matrix > 0) window.spawnFurniture('holo_matrix', 1);
    }
};

const oldSpawn_KL = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_KL) oldSpawn_KL(type, count);
    const room = document.getElementById('room-area'); if (!room || !itemsKinetik.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'grav_zentrifuge') {
        item.classList.add('item-grav-zentrifuge');
        item.innerHTML = '<div class="gz-cylinder"><div class="gz-core"></div><div class="gz-led-strip"></div></div><div class="gz-base"></div>';
    } else if (type === 'kinetik_absorber') {
        item.classList.add('item-kinetik-absorber');
        item.innerHTML = '<div class="ka-plate"></div><div class="ka-plate"></div><div class="ka-plate"></div>';
    } else if (type === 'holo_matrix') {
        item.classList.add('item-holo-matrix');
        item.innerHTML = '<div class="hm-proj">E=mc²<br>∇·F=0<br>ψ→∞</div>';
    } else if (type === 'lampe_kinetik') {
        item.classList.add('item-lampe-kinetik');
        item.innerHTML = '<div class="lk-arm"></div><div class="lk-pendel"></div>';
    }
    room.appendChild(item);
};


/* ==== next block ==== */


// === MATERIE-DEKOMPRESSOR ===
const menuDekomp = `
<div id="menu-materie-dekompressor" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ MOLEKULAR-DISRUPTOR ]</b><p style="font-size:0.7em; color:#aaa;">Zwei schwebende Energiefelder, gegenläufig rotierend.</p><button id="btn-buy-molekular-disruptor" onclick="window.buyFurniture('molekular_disruptor', 3800)" class="btn-upgrade-exec" style="background:#f80; color:#000; border:1px solid #f80;">KAUFEN (3800 C + 55 MZ)</button></div>
    <div class="upgrade-card"><b>[ ANTI-GRAV-TRANSPORTFELD ]</b><p style="font-size:0.7em; color:#aaa;">Ausgangsband aus purem Licht.</p><button id="btn-buy-antigrav-transport" onclick="window.buyFurniture('antigrav_transport', 1600)" class="btn-upgrade-exec" style="background:#0f8; color:#000; border:1px solid #0f8;">KAUFEN (1600 C + 15 MZ)</button></div>
    <div class="upgrade-card"><b>[ QUARANTÄNE-STASISFELD ]</b><p style="font-size:0.7em; color:#aaa;">Transparente Eindämmungsbox.</p><button id="btn-buy-quarantaene-stasis" onclick="window.buyFurniture('quarantaene_stasis', 800)" class="btn-upgrade-exec">KAUFEN (800 C)</button></div>
    <div class="upgrade-card"><b>[ HOLO-WARN-STROBOSKOP ]</b><p style="font-size:0.7em; color:#aaa;">Drehendes gelbes Warnlicht.</p><button id="btn-buy-lampe-dekomp" onclick="window.buyFurniture('lampe_dekomp', 220)" class="btn-upgrade-exec">KAUFEN (220 C)</button></div>
</div>`;
if (!document.getElementById('menu-materie-dekompressor')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuDekomp);

const itemsDekomp = ['molekular_disruptor','antigrav_transport','quarantaene_stasis','lampe_dekomp'];
itemsDekomp.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_MD = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_MD === 'function') oldUpdateAusbau_MD();
    if (typeof inventory === 'undefined') return;
    const limits = { molekular_disruptor:1, antigrav_transport:1, quarantaene_stasis:1, lampe_dekomp:1 };
    for (let k in limits) {
        let max = limits[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_MD = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_MD) oldOpenRoom_MD(type);
    const m = document.getElementById('menu-materie-dekompressor');
    if (m) m.style.display = (type === 'MATERIE-DEKOMPRESSOR') ? 'flex' : 'none';
    if (type === 'MATERIE-DEKOMPRESSOR') { const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important'); window.reloadFurniture(type); window.updateAusbauButtons(); }
};

const oldBuyFurniture_MD = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsDekomp.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'molekular_disruptor' || type === 'antigrav_transport');
        let costC = cost; let costMZ = 0;
        if (type === 'molekular_disruptor') costMZ = 55;
        if (type === 'antigrav_transport') costMZ = 15;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? `System: ${cost} C + ${costMZ} MZ benötigt.` : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_MD) oldBuyFurniture_MD(type, cost);
};

const oldReload_MD = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_MD) oldReload_MD(type);
    if (type === 'MATERIE-DEKOMPRESSOR') {
        if (inventory.lampe_dekomp > 0) window.spawnFurniture('lampe_dekomp', 1);
        if (inventory.molekular_disruptor > 0) window.spawnFurniture('molekular_disruptor', 1);
        if (inventory.antigrav_transport > 0) window.spawnFurniture('antigrav_transport', 1);
        if (inventory.quarantaene_stasis > 0) window.spawnFurniture('quarantaene_stasis', 1);
    }
};

const oldSpawn_MD = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_MD) oldSpawn_MD(type, count);
    const room = document.getElementById('room-area'); if (!room || !itemsDekomp.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'molekular_disruptor') {
        item.classList.add('item-molekular-disruptor');
        item.innerHTML = '<div class="md-field-container"><div class="md-warn"></div><div class="md-field left"></div><div class="md-field right"></div></div><div class="md-base"></div>';
    } else if (type === 'antigrav_transport') {
        item.classList.add('item-antigrav-transport');
        item.innerHTML = '<div class="at-belt"><div class="at-barrier"></div></div>';
    } else if (type === 'quarantaene_stasis') {
        item.classList.add('item-quarantaene-stasis');
        item.innerHTML = '<div class="qs-box"></div>';
    } else if (type === 'lampe_dekomp') {
        item.classList.add('item-lampe-dekomp');
        item.innerHTML = '<div class="ld-strobe"></div>';
    }
    room.appendChild(item);
};


/* ==== next block ==== */


// === VAKUUM-SCHMIEDE ===
const menuVakuum = `
<div id="menu-vakuum-schmiede" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ NULLRAUM-SYNTHESIZER ]</b><p style="font-size:0.7em; color:#aaa;">Tisch hinter Kraftfeld, Roboterarme.</p><button id="btn-buy-nullraum-synth" onclick="window.buyFurniture('nullraum_synth', 3300)" class="btn-upgrade-exec" style="background:#0ff; color:#000; border:1px solid #0ff;">KAUFEN (3300 C + 48 MZ)</button></div>
    <div class="upgrade-card"><b>[ DUNKLE-MATERIE-TANKS ]</b><p style="font-size:0.7em; color:#aaa;">Wandtanks mit leuchtendem Kern.</p><button id="btn-buy-dunkle-materie-tanks" onclick="window.buyFurniture('dunkle_materie_tanks', 1100)" class="btn-upgrade-exec">KAUFEN (1100 C)</button></div>
    <div class="upgrade-card"><b>[ IONEN-SCHOTT ]</b><p style="font-size:0.7em; color:#aaa;">Massive Raumtür.</p><button id="btn-buy-ionen-schott" onclick="window.buyFurniture('ionen_schott', 900)" class="btn-upgrade-exec">KAUFEN (900 C)</button></div>
    <div class="upgrade-card"><b>[ KALTPLASMA-RING ]</b><p style="font-size:0.7em; color:#aaa;">Sehr helles kaltweißes Licht.</p><button id="btn-buy-lampe-vakuum" onclick="window.buyFurniture('lampe_vakuum', 250)" class="btn-upgrade-exec">KAUFEN (250 C)</button></div>
</div>`;
if (!document.getElementById('menu-vakuum-schmiede')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuVakuum);

const itemsVakuum = ['nullraum_synth','dunkle_materie_tanks','ionen_schott','lampe_vakuum'];
itemsVakuum.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_VS = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_VS === 'function') oldUpdateAusbau_VS();
    if (typeof inventory === 'undefined') return;
    const limits = { nullraum_synth:1, dunkle_materie_tanks:1, ionen_schott:1, lampe_vakuum:1 };
    for (let k in limits) {
        let max = limits[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_VS = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_VS) oldOpenRoom_VS(type);
    const m = document.getElementById('menu-vakuum-schmiede');
    if (m) m.style.display = (type === 'VAKUUM-SCHMIEDE') ? 'flex' : 'none';
    if (type === 'VAKUUM-SCHMIEDE') { const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important'); window.reloadFurniture(type); window.updateAusbauButtons(); }
};

const oldBuyFurniture_VS = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsVakuum.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'nullraum_synth'); let costC = cost; let costMZ = isMZ ? 48 : 0;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? "System: 3300 C + 48 MZ benötigt." : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_VS) oldBuyFurniture_VS(type, cost);
};

const oldReload_VS = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_VS) oldReload_VS(type);
    if (type === 'VAKUUM-SCHMIEDE') {
        if (inventory.lampe_vakuum > 0) window.spawnFurniture('lampe_vakuum', 1);
        if (inventory.nullraum_synth > 0) window.spawnFurniture('nullraum_synth', 1);
        if (inventory.dunkle_materie_tanks > 0) window.spawnFurniture('dunkle_materie_tanks', 1);
        if (inventory.ionen_schott > 0) window.spawnFurniture('ionen_schott', 1);
    }
};

const oldSpawn_VS = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_VS) oldSpawn_VS(type, count);
    const room = document.getElementById('room-area'); if (!room || !itemsVakuum.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'nullraum_synth') {
        item.classList.add('item-nullraum-synth');
        item.innerHTML = '<div class="ns-field"><div class="ns-pressure">P:99</div><div class="ns-table"></div><div class="ns-arm l"></div><div class="ns-arm r"></div></div><div class="ns-base"></div>';
    } else if (type === 'dunkle_materie_tanks') {
        item.classList.add('item-dunkle-materie-tanks');
        item.innerHTML = '<div class="dm-tank"><div class="dm-core"></div><div class="dm-valve-led"></div></div><div class="dm-tank"><div class="dm-core"></div><div class="dm-valve-led"></div></div>';
    } else if (type === 'ionen_schott') {
        item.classList.add('item-ionen-schott');
        item.innerHTML = '<div class="is-door"><div class="is-status"></div><div class="is-seal"></div></div>';
    } else if (type === 'lampe_vakuum') {
        item.classList.add('item-lampe-vakuum');
        item.innerHTML = '<div class="lv-ring"></div>';
    }
    room.appendChild(item);
};


/* ==== next block ==== */


// === RESONANZ-KAMMER ===
const menuResonanz = `
<div id="menu-resonanz-kammer" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ CHRONO-OSZILLATOR ]</b><p style="font-size:0.7em; color:#aaa;">Metallsockel mit schwebenden Emitter-Ringen.</p><button id="btn-buy-chrono-oszillator" onclick="window.buyFurniture('chrono_oszillator', 3600)" class="btn-upgrade-exec" style="background:#0ff; color:#000; border:1px solid #0ff;">KAUFEN (3600 C + 52 MZ)</button></div>
    <div class="upgrade-card"><b>[ TACHYONEN-SPEKTROMETER ]</b><p style="font-size:0.7em; color:#aaa;">Rechnerpult mit Frequenz-Linie.</p><button id="btn-buy-tachyon-spektrometer" onclick="window.buyFurniture('tachyon_spektrometer', 1000)" class="btn-upgrade-exec">KAUFEN (1000 C)</button></div>
    <div class="upgrade-card"><b>[ SCHALL-NULLIFIZIERUNGS-PANEELE ]</b><p style="font-size:0.7em; color:#aaa;">Geometrische Wandkacheln.</p><button id="btn-buy-schall-nullifizierung" onclick="window.buyFurniture('schall_nullifizierung', 700)" class="btn-upgrade-exec">KAUFEN (700 C)</button></div>
    <div class="upgrade-card"><b>[ FREQUENZ-RÖHRENLAMPE ]</b><p style="font-size:0.7em; color:#aaa;">Flackert im Takt der Vibrationen.</p><button id="btn-buy-lampe-resonanz" onclick="window.buyFurniture('lampe_resonanz', 210)" class="btn-upgrade-exec">KAUFEN (210 C)</button></div>
</div>`;
if (!document.getElementById('menu-resonanz-kammer')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuResonanz);

const itemsResonanz = ['chrono_oszillator','tachyon_spektrometer','schall_nullifizierung','lampe_resonanz'];
itemsResonanz.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_RK = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_RK === 'function') oldUpdateAusbau_RK();
    if (typeof inventory === 'undefined') return;
    const limits = { chrono_oszillator:1, tachyon_spektrometer:1, schall_nullifizierung:1, lampe_resonanz:1 };
    for (let k in limits) {
        let max = limits[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_RK = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_RK) oldOpenRoom_RK(type);
    const m = document.getElementById('menu-resonanz-kammer');
    if (m) m.style.display = (type === 'RESONANZ-KAMMER') ? 'flex' : 'none';
    if (type === 'RESONANZ-KAMMER') { const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important'); window.reloadFurniture(type); window.updateAusbauButtons(); }
};

const oldBuyFurniture_RK = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsResonanz.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'chrono_oszillator'); let costC = cost; let costMZ = isMZ ? 52 : 0;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? "System: 3600 C + 52 MZ benötigt." : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_RK) oldBuyFurniture_RK(type, cost);
};

const oldReload_RK = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_RK) oldReload_RK(type);
    if (type === 'RESONANZ-KAMMER') {
        if (inventory.lampe_resonanz > 0) window.spawnFurniture('lampe_resonanz', 1);
        if (inventory.chrono_oszillator > 0) window.spawnFurniture('chrono_oszillator', 1);
        if (inventory.tachyon_spektrometer > 0) window.spawnFurniture('tachyon_spektrometer', 1);
        if (inventory.schall_nullifizierung > 0) window.spawnFurniture('schall_nullifizierung', 1);
    }
};

const oldSpawn_RK = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_RK) oldSpawn_RK(type, count);
    const room = document.getElementById('room-area'); if (!room || !itemsResonanz.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'chrono_oszillator') {
        item.classList.add('item-chrono-oszillator');
        item.innerHTML = '<div class="co-ring-container"><div class="co-ring"></div><div class="co-ring"></div><div class="co-ring"></div></div><div class="co-pedestal"></div>';
    } else if (type === 'tachyon_spektrometer') {
        item.classList.add('item-tachyon-spektrometer');
        item.innerHTML = '<div class="ts-console"><div class="ts-holo"><div class="ts-freq-line"></div></div><div class="ts-keypad"><div class="ts-key"></div><div class="ts-key"></div><div class="ts-key"></div></div></div><div class="ts-base"></div>';
    } else if (type === 'schall_nullifizierung') {
        item.classList.add('item-schall-nullifizierung');
        item.innerHTML = '<div class="sn-panel"></div><div class="sn-panel"></div><div class="sn-panel"></div><div class="sn-panel"></div>';
    } else if (type === 'lampe_resonanz') {
        item.classList.add('item-lampe-resonanz');
        item.innerHTML = '<div class="lr-tube"></div>';
    }
    room.appendChild(item);
};


/* ==== next block ==== */


// === KYBERNETIK-STATION ===
const menuKybernetik = `
<div id="menu-kybernetik-station" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ NEURAL-SYNCHRONISATOR ]</b><p style="font-size:0.7em; color:#aaa;">Verkabelter Hightech-Liegesitz.</p><button id="btn-buy-neural-sync" onclick="window.buyFurniture('neural_sync', 2900)" class="btn-upgrade-exec" style="background:#0af; color:#000; border:1px solid #0af;">KAUFEN (2900 C + 35 MZ)</button></div>
    <div class="upgrade-card"><b>[ NANOBOT-PROGRAMMIERDECK ]</b><p style="font-size:0.7em; color:#aaa;">Arbeitstisch mit Holo-Scan-Strahl.</p><button id="btn-buy-nanobot-deck" onclick="window.buyFurniture('nanobot_deck', 1400)" class="btn-upgrade-exec">KAUFEN (1400 C)</button></div>
    <div class="upgrade-card"><b>[ BIO-GEWEBE-KULTIVATOR ]</b><p style="font-size:0.7em; color:#aaa;">Schrank mit leuchtenden Nährlösungen.</p><button id="btn-buy-bio-gewebe-kultivator" onclick="window.buyFurniture('bio_gewebe_kultivator', 850)" class="btn-upgrade-exec">KAUFEN (850 C)</button></div>
    <div class="upgrade-card"><b>[ FOKUS-LASER-SPOT ]</b><p style="font-size:0.7em; color:#aaa;">Blendend hell fokussiert.</p><button id="btn-buy-lampe-kybernetik" onclick="window.buyFurniture('lampe_kybernetik', 280)" class="btn-upgrade-exec">KAUFEN (280 C)</button></div>
</div>`;
if (!document.getElementById('menu-kybernetik-station')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuKybernetik);

const itemsKybernetik = ['neural_sync','nanobot_deck','bio_gewebe_kultivator','lampe_kybernetik'];
itemsKybernetik.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_KS = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_KS === 'function') oldUpdateAusbau_KS();
    if (typeof inventory === 'undefined') return;
    const limits = { neural_sync:1, nanobot_deck:1, bio_gewebe_kultivator:1, lampe_kybernetik:1 };
    for (let k in limits) {
        let max = limits[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_KS = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_KS) oldOpenRoom_KS(type);
    const m = document.getElementById('menu-kybernetik-station');
    if (m) m.style.display = (type === 'KYBERNETIK-STATION') ? 'flex' : 'none';
    if (type === 'KYBERNETIK-STATION') { const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important'); window.reloadFurniture(type); window.updateAusbauButtons(); }
};

const oldBuyFurniture_KS = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsKybernetik.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'neural_sync'); let costC = cost; let costMZ = isMZ ? 35 : 0;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? "System: 2900 C + 35 MZ benötigt." : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_KS) oldBuyFurniture_KS(type, cost);
};

const oldReload_KS = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_KS) oldReload_KS(type);
    if (type === 'KYBERNETIK-STATION') {
        if (inventory.lampe_kybernetik > 0) window.spawnFurniture('lampe_kybernetik', 1);
        if (inventory.neural_sync > 0) window.spawnFurniture('neural_sync', 1);
        if (inventory.nanobot_deck > 0) window.spawnFurniture('nanobot_deck', 1);
        if (inventory.bio_gewebe_kultivator > 0) window.spawnFurniture('bio_gewebe_kultivator', 1);
    }
};

const oldSpawn_KS = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_KS) oldSpawn_KS(type, count);
    const room = document.getElementById('room-area'); if (!room || !itemsKybernetik.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'neural_sync') {
        item.classList.add('item-neural-sync');
        item.innerHTML = '<div class="ns-chair"><div class="ns-backrest"><div class="ns-synapse s1"></div><div class="ns-synapse s2"></div><div class="ns-synapse s3"></div><div class="ns-synapse s4"></div></div><div class="ns-seat"></div></div><div class="ns-base"></div>';
    } else if (type === 'nanobot_deck') {
        item.classList.add('item-nanobot-deck');
        item.innerHTML = '<div class="nd-scan"><div class="nd-scan-line"></div><div class="nd-led"></div></div><div class="nd-table"></div><div class="nd-base"></div>';
    } else if (type === 'bio_gewebe_kultivator') {
        item.classList.add('item-bio-gewebe-kultivator');
        item.innerHTML = '<div class="bg-shelf"><div class="bg-vial v1"></div><div class="bg-vial v2"></div><div class="bg-vial v3"></div></div><div class="bg-shelf"><div class="bg-vial v1"></div><div class="bg-vial v2"></div></div>';
    } else if (type === 'lampe_kybernetik') {
        item.classList.add('item-lampe-kybernetik');
        item.innerHTML = '<div class="lk-spot"></div>';
    }
    room.appendChild(item);
};


/* ==== next block ==== */


// === SCANNER-PHALANX ===
const menuScanner = `
<div id="menu-scanner-phalanx" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ ZEITSTROM-KARTOGRAF ]</b><p style="font-size:0.7em; color:#aaa;">Runder Holotisch mit 3D-Zeitlinien.</p><button id="btn-buy-zeitstrom-kartograf" onclick="window.buyFurniture('zeitstrom_kartograf', 4000)" class="btn-upgrade-exec" style="background:#0f8; color:#000; border:1px solid #0f8;">KAUFEN (4000 C + 60 MZ)</button></div>
    <div class="upgrade-card"><b>[ KI-QUANTENKERNE ]</b><p style="font-size:0.7em; color:#aaa;">Glas-Schränke mit wilden Datenströmen.</p><button id="btn-buy-ki-quantenkerne" onclick="window.buyFurniture('ki_quantenkerne', 2200)" class="btn-upgrade-exec" style="background:#0ff; color:#000; border:1px solid #0ff;">KAUFEN (2200 C + 25 MZ)</button></div>
    <div class="upgrade-card"><b>[ SYNTHETIK-STIMULANZ-REPLIKATOR ]</b><p style="font-size:0.7em; color:#aaa;">Rote Bereit-LED leuchtet dauerhaft.</p><button id="btn-buy-synthetik-replikator" onclick="window.buyFurniture('synthetik_replikator', 300)" class="btn-upgrade-exec">KAUFEN (300 C)</button></div>
    <div class="upgrade-card"><b>[ INFRAROT-SENSOR-ARRAY ]</b><p style="font-size:0.7em; color:#aaa;">Dimmen abwechselnd an und aus.</p><button id="btn-buy-lampe-scanner" onclick="window.buyFurniture('lampe_scanner', 350)" class="btn-upgrade-exec">KAUFEN (350 C)</button></div>
</div>`;
if (!document.getElementById('menu-scanner-phalanx')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuScanner);

const itemsScanner = ['zeitstrom_kartograf','ki_quantenkerne','synthetik_replikator','lampe_scanner'];
itemsScanner.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_SP = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_SP === 'function') oldUpdateAusbau_SP();
    if (typeof inventory === 'undefined') return;
    const limits = { zeitstrom_kartograf:1, ki_quantenkerne:1, synthetik_replikator:1, lampe_scanner:1 };
    for (let k in limits) {
        let max = limits[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_SP = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_SP) oldOpenRoom_SP(type);
    const m = document.getElementById('menu-scanner-phalanx');
    if (m) m.style.display = (type === 'SCANNER-PHALANX') ? 'flex' : 'none';
    if (type === 'SCANNER-PHALANX') { const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important'); window.reloadFurniture(type); window.updateAusbauButtons(); }
};

const oldBuyFurniture_SP = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsScanner.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'zeitstrom_kartograf' || type === 'ki_quantenkerne');
        let costC = cost; let costMZ = 0;
        if (type === 'zeitstrom_kartograf') costMZ = 60;
        if (type === 'ki_quantenkerne') costMZ = 25;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? `System: ${cost} C + ${costMZ} MZ benötigt.` : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_SP) oldBuyFurniture_SP(type, cost);
};

const oldReload_SP = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_SP) oldReload_SP(type);
    if (type === 'SCANNER-PHALANX') {
        if (inventory.lampe_scanner > 0) window.spawnFurniture('lampe_scanner', 1);
        if (inventory.zeitstrom_kartograf > 0) window.spawnFurniture('zeitstrom_kartograf', 1);
        if (inventory.ki_quantenkerne > 0) window.spawnFurniture('ki_quantenkerne', 1);
        if (inventory.synthetik_replikator > 0) window.spawnFurniture('synthetik_replikator', 1);
    }
};

const oldSpawn_SP = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_SP) oldSpawn_SP(type, count);
    const room = document.getElementById('room-area'); if (!room || !itemsScanner.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'zeitstrom_kartograf') {
        item.classList.add('item-zeitstrom-kartograf');
        item.innerHTML = '<div class="zk-holo"></div><div class="zk-table"><div class="zk-scan-line"></div></div><div class="zk-base"></div>';
    } else if (type === 'ki_quantenkerne') {
        item.classList.add('item-ki-quantenkerne');
        item.innerHTML = '<div class="kq-cabinet"><div class="kq-stream"></div><div class="kq-stream"></div><div class="kq-stream"></div></div><div class="kq-cabinet"><div class="kq-stream" style="animation-delay:0.15s;"></div><div class="kq-stream" style="animation-delay:0.25s;"></div><div class="kq-stream" style="animation-delay:0.35s;"></div></div>';
    } else if (type === 'synthetik_replikator') {
        item.classList.add('item-synthetik-replikator');
        item.innerHTML = '<div class="sr-body"><div class="sr-led"></div></div>';
    } else if (type === 'lampe_scanner') {
        item.classList.add('item-lampe-scanner');
        item.innerHTML = '<div class="ls-sensor"></div><div class="ls-sensor"></div><div class="ls-sensor"></div>';
    }
    room.appendChild(item);
};


/* ==== next block ==== */


// === DEKONTAMINATIONS-SCHLEUSE ===
const menuDekont = `
<div id="menu-dekontaminations-schleuse" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ TEMPORAL-PARTIKEL-FILTER ]</b><p style="font-size:0.7em; color:#aaa;">Torbogen mit Ionen-Nebel und Lichtschranken.</p><button id="btn-buy-temp-partikel-filter" onclick="window.buyFurniture('temp_partikel_filter', 2500)" class="btn-upgrade-exec" style="background:#0af; color:#000; border:1px solid #0af;">KAUFEN (2500 C + 30 MZ)</button></div>
    <div class="upgrade-card"><b>[ EXO-PHASEN-ANZÜGE ]</b><p style="font-size:0.7em; color:#aaa;">Halterung für Schutzanzüge.</p><button id="btn-buy-exo-phasen-anzuege" onclick="window.buyFurniture('exo_phasen_anzuege', 950)" class="btn-upgrade-exec">KAUFEN (950 C)</button></div>
    <div class="upgrade-card"><b>[ IONEN-ABLAUFGITTER ]</b><p style="font-size:0.7em; color:#aaa;">Boden mit Energielinien.</p><button id="btn-buy-ionen-ablaufigitter" onclick="window.buyFurniture('ionen_ablaufigitter', 450)" class="btn-upgrade-exec">KAUFEN (450 C)</button></div>
    <div class="upgrade-card"><b>[ UV-C-DESINFEKTIONS-ARRAY ]</b><p style="font-size:0.7em; color:#aaa;">Violettes Reinigungslicht.</p><button id="btn-buy-lampe-dekont" onclick="window.buyFurniture('lampe_dekont', 190)" class="btn-upgrade-exec">KAUFEN (190 C)</button></div>
</div>`;
if (!document.getElementById('menu-dekontaminations-schleuse')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuDekont);

const itemsDekont = ['temp_partikel_filter','exo_phasen_anzuege','ionen_ablaufigitter','lampe_dekont'];
itemsDekont.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_DS = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_DS === 'function') oldUpdateAusbau_DS();
    if (typeof inventory === 'undefined') return;
    const limits = { temp_partikel_filter:1, exo_phasen_anzuege:1, ionen_ablaufigitter:1, lampe_dekont:1 };
    for (let k in limits) {
        let max = limits[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_DS = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_DS) oldOpenRoom_DS(type);
    const m = document.getElementById('menu-dekontaminations-schleuse');
    if (m) m.style.display = (type === 'DEKONTAMINATIONS-SCHLEUSE') ? 'flex' : 'none';
    if (type === 'DEKONTAMINATIONS-SCHLEUSE') { const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important'); window.reloadFurniture(type); window.updateAusbauButtons(); }
};

const oldBuyFurniture_DS = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsDekont.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'temp_partikel_filter'); let costC = cost; let costMZ = isMZ ? 30 : 0;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? "System: 2500 C + 30 MZ benötigt." : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_DS) oldBuyFurniture_DS(type, cost);
};

const oldReload_DS = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_DS) oldReload_DS(type);
    if (type === 'DEKONTAMINATIONS-SCHLEUSE') {
        if (inventory.lampe_dekont > 0) window.spawnFurniture('lampe_dekont', 1);
        if (inventory.temp_partikel_filter > 0) window.spawnFurniture('temp_partikel_filter', 1);
        if (inventory.exo_phasen_anzuege > 0) window.spawnFurniture('exo_phasen_anzuege', 1);
        if (inventory.ionen_ablaufigitter > 0) window.spawnFurniture('ionen_ablaufigitter', 1);
    }
};

const oldSpawn_DS = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_DS) oldSpawn_DS(type, count);
    const room = document.getElementById('room-area'); if (!room || !itemsDekont.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'temp_partikel_filter') {
        item.classList.add('item-temp-partikel-filter');
        item.innerHTML = '<div class="tpf-arch"><div class="tpf-mist"></div><div class="tpf-barrier"></div><div class="tpf-barrier b2"></div><div class="tpf-green-led"></div></div><div class="tpf-base"></div>';
    } else if (type === 'exo_phasen_anzuege') {
        item.classList.add('item-exo-phasen-anzuege');
        item.innerHTML = '<div class="epa-rack"><div class="epa-suit"></div><div class="epa-battery"></div></div><div class="epa-rack"><div class="epa-suit"></div><div class="epa-battery"></div></div>';
    } else if (type === 'ionen_ablaufigitter') {
        item.classList.add('item-ionen-ablaufigitter');
    } else if (type === 'lampe_dekont') {
        item.classList.add('item-lampe-dekont');
        item.innerHTML = '<div class="ld-array"></div>';
    }
    room.appendChild(item);
};
