

/* ==== next block ==== */


    let statusCache = "";
    let isInstabil = false;
    let audioCtx;
    let currentCoherence = 98.4; 
    let activeAlertTimeout = null; 
    let currentSystemStatus = "STABIL"; 

    let currentLogs = [
        "> Agent B. Flux: Rückkehr aus Sektor B-4 erfolgreich.",
        "> System: Flux-Kondensator Kapazität bei 98.4%.",
        "> Warnung: Temporale Anomalie in Sektor C-9 detektiert.",
        "> Info: Neue Route nach 'Neo-Berlin' gesperrt."
    ];

    const logPool = [
        "> Info: Backup-Server in Sektor E-0 synchronisiert.",
        "> Scan: Unbekannte Signatur in Sektor D-8 geortet.",
        "> Agent K. Zero: Sprung in die Kreidezeit eingeleitet.",
        "> System: Kalibrierung der Zeit-Matrix abgeschlossen.",
        "> Nachricht: Agent B. Flux benötigt zusätzliche Energiezellen.",
        "> Scan: Temporale Verschiebung um 0.002s korrigiert.",
        "> Warnung: Zeitreise-Katze in der Datenleitung entdeckt.",
        "> Info: Chrono-Synchronisation mit Mars-Stadt erfolgreich.",
        "> System: Kühlkreislauf des Flux-Moduls bei 88%.",
        "> Warnung: Temporales Echo im Haupt-Sektor.",
        "> Agent R. Dück: Artefakt aus dem Jahr 2026 geborgen.",
        "> Scan: Wurmloch-Stabilität kritisch. Rekalibriere...",
        "> Info: Paradoxon-Filter auf Stufe 4 erhöht.",
        "> System: Antimaterie-Reserven bei 94%.",
        "> Warnung: Unautorisierter Zugriff aus dem 24. Jahrhundert blockiert.",
        "> Nachricht: Agentin V. Chronos meldet erfolgreiche Exfiltration.",
        "> Scan: Tachyonen-Strahlung im Normalbereich.",
        "> Info: Wartung an Chrono-Spule #4 abgeschlossen.",
        "> Warnung: Riss im Raum-Zeit-Gefüge (Sektor 7) versiegelt.",
        "> System: Quanten-Verschlüsselung aktualisiert.",
        "> Scan: Dinosaurier-DNA-Spuren in Modul 2 gefunden. Reinigung läuft.",
        "> Info: Zeitstrang Beta-9 erfolgreich überschrieben."
    ];

    function initSystem() {
        startClock();
        startCoherenceTicker(); 
        aktualisiereStatusWerte();
        f_start();
        starteSynchronenZyklus();
        planeNaechstenLog();

        if (window.isAgentVerified) {
            setTimeout(() => {
                const startupLayer = document.getElementById('startup-layer');
                if(startupLayer) startupLayer.style.display = 'none';
            }, 100);
        }
    }

    window.triggerSystemOverride = function() {
        if (currentSystemStatus === "WARNUNG" || currentSystemStatus === "INSTABIL") {
            clearTimeout(activeAlertTimeout);
            if (typeof updateXP === 'function') updateXP(50);
            playBeep(1400, 0.1);
            currentLogs.unshift("> System: MANUELLER OVERRIDE! +50 XP erhalten.");
            if (currentLogs.length > 5) currentLogs.pop();
            const navBtn = document.getElementById('status-nav-btn');
            if (navBtn) {
                navBtn.classList.remove('status-warn-pulse');
                navBtn.classList.remove('alert-pulse');
            }
            starteSynchronenZyklus();
            if (document.getElementById('log-display')) f_start();
        } else {
            currentLogs.unshift("> System: Override abgelehnt. Status bereits stabil.");
            if (currentLogs.length > 5) currentLogs.pop();
            if (document.getElementById('log-display')) f_start();
        }
    };

    // Bei jedem Druck auf einen der vier Haupt-Buttons (Flux-Kopplung, Zeit-Stränge, Komm-Link,
    // Status) besteht eine 5%-Chance, dass das System auf "WARNUNG" umspringt - ersetzt den
    // alten, rein zeitbasierten Zufalls-Trigger. Der ursprüngliche Button-Klick läuft danach
    // trotzdem ganz normal weiter, die Warnung nimmt nur zusätzlich ihren Lauf.
    function checkSystemWarningChance() {
        if (currentSystemStatus === "STABIL" && Math.random() < 0.05) {
            erzeugeWarnSequenz();
        }
    }

    window.triggerSystemMalfunction = function() {
        if (currentSystemStatus === "STABIL") {
            clearTimeout(activeAlertTimeout);
            playBeep(400, 0.2); 
            currentLogs.unshift("> Warnung: MANUELLER EINGRIFF! Stabilität gefährdet.");
            if (currentLogs.length > 5) currentLogs.pop();
            
            erzeugeWarnSequenz(); 
            
            if (document.getElementById('log-display')) f_start();
        }
    };

    function planeNaechstenLog() {
        const delay = Math.floor(Math.random() * (600000 - 60000 + 1)) + 60000;
        setTimeout(() => {
            neuerLogEintrag();
            planeNaechstenLog();
        }, delay);
    }

    function neuerLogEintrag() {
        const neuerEintrag = logPool[Math.floor(Math.random() * logPool.length)];
        currentLogs.unshift(neuerEintrag);
        if (currentLogs.length > 5) currentLogs.pop();
        const logContainer = document.getElementById('log-display');
        if (logContainer) {
            logContainer.innerHTML = currentLogs.map(l => `<div class="log-entry">${l}</div>`).join('');
            playBeep(900, 0.02);
        }
    }

    let coherenceTickerId = null;
    let crashSequenceActive = false;
    window.missionActive = false;

    function startCoherenceTicker() {
        if (coherenceTickerId) clearInterval(coherenceTickerId);
        coherenceTickerId = setInterval(() => {
            if (crashSequenceActive) return;

            const display = document.getElementById('coherence-display');

            if (currentSystemStatus === "STABIL") {
                let change = Math.random() < 0.5 ? -0.1 : 0.1;
                currentCoherence = Math.min(99.9, Math.max(94.1, currentCoherence + change));
                currentCoherence = parseFloat(currentCoherence.toFixed(1));
                if (display) display.innerText = currentCoherence.toFixed(1) + "%";
            } else if (currentSystemStatus === "WARNUNG" || currentSystemStatus === "INSTABIL") {
                let drop = 0.5 + Math.random() * 1.0;
                currentCoherence = Math.max(0, currentCoherence - drop);
                currentCoherence = parseFloat(currentCoherence.toFixed(1));
                if (display) display.innerText = currentCoherence.toFixed(1) + "%";

                if (currentCoherence <= 80.0 && currentSystemStatus === "WARNUNG") {
                    currentSystemStatus = "INSTABIL";
                    const navBtn = document.getElementById('status-nav-btn');
                    if (navBtn) navBtn.classList.remove('status-warn-pulse');
                    erzwingeStatus('INSTABIL', 'status-crit', true);
                    if (navBtn) navBtn.classList.add('alert-pulse');
                    currentLogs.unshift("> KRITISCH: Kohärenz unter 80%! System instabil!");
                    if (currentLogs.length > 5) currentLogs.pop();
                    if (document.getElementById('log-display')) f_start();
                    playBeep(200, 0.3);
                }
                // Hinweis: Der automatische Crash-Trigger sitzt NICHT mehr hier bei 70% -
                // das übernimmt jetzt ausschließlich die unabhängige Crashout-Automatik bei 50%
                // (separates setInterval, siehe unten bei stopCoherenceTicker).
            }
        }, 500);
    }

    function stopCoherenceTicker() {
        if (coherenceTickerId) { clearInterval(coherenceTickerId); coherenceTickerId = null; }
    }

    // --- CRASHOUT-AUTOMATIK ---
    // Permanente, vom normalen Kohärenz-Ticker UNABHÄNGIGE Überwachung. Läuft dauerhaft im
    // Hintergrund (nicht nur während startCoherenceTicker aktiv ist) und erzwingt den
    // Crash-Prozess, sobald die Kohärenz unter 50% fällt - als harte Notbremse, unabhängig
    // davon, auf welchem Bildschirm sich der Spieler gerade befindet.
    setInterval(() => {
        if (crashSequenceActive) return;
        if (currentCoherence < 50.0) {
            crashSequenceActive = true;
            currentLogs.unshift("> CRASHOUT: Kohärenz unter 50%! Not-Crash erzwungen!");
            if (currentLogs.length > 5) currentLogs.pop();
            if (document.getElementById('log-display')) f_start();
            // WICHTIG: startBlackoutMission() startet nur die Missions-LOGIK (Timer, Inhalte),
            // macht aber #blackout-layer selbst nicht sichtbar - das übernimmt normalerweise
            // showBlackoutMenu() im normalen EMP-Trap-Ablauf. Ohne diese Zeile lief die Mission
            // bisher unsichtbar im Hintergrund und scheiterte am Ende lautlos per Timeout - das
            // war der Fehler, der beim alten 70%-Trigger nie richtig funktioniert hat.
            const blackoutLayer = document.getElementById('blackout-layer');
            if (blackoutLayer) blackoutLayer.style.setProperty('display', 'flex', 'important');
            if (typeof window.startBlackoutMission === 'function') window.startBlackoutMission();
        }
    }, 1000);

    function erzeugeWarnSequenz() {
        const navBtn = document.getElementById('status-nav-btn');
        currentSystemStatus = "WARNUNG";
        erzwingeStatus('WARNUNG', 'status-warn', true);
        if (navBtn) navBtn.classList.add('status-warn-pulse');
        currentLogs.unshift("> Warnung: Temporale Kohärenz sinkt! System unter Beobachtung.");
        if (currentLogs.length > 5) currentLogs.pop();
        if (document.getElementById('log-display')) f_start();
    }

    function starteSynchronenZyklus() {
        if (activeAlertTimeout) { clearTimeout(activeAlertTimeout); activeAlertTimeout = null; }
        const navBtn = document.getElementById('status-nav-btn');
        currentSystemStatus = "STABIL";
        currentCoherence = 98.4;
        erzwingeStatus('STABIL', 'status-ok', false);
        
        if (navBtn) {
            navBtn.classList.remove('status-warn-pulse');
            navBtn.classList.remove('alert-pulse');
        }

        activeAlertTimeout = setTimeout(() => {
            activeAlertTimeout = null;
            starteSynchronenZyklus();
        }, 30000); 
    }

    function erzwingeStatus(text, klasse, glitch) {
        statusCache = `<div class="${glitch ? 'glitch' : ''}">` +
            `> Vektor-Abgleich: <span class="${klasse}">${text}</span><br>` +
            `> Temporale Kohärenz: <span id="coherence-display">${currentCoherence.toFixed(1)}%</span><br>` +
            `> Flux-Kondensator: GELADEN<br>` +
            `> Ereignishorizont: <span class="${klasse}">${text}</span><br>` +
            `> GlobalerAgentur-Sektor: ONLINE</div>`;
        const el = document.getElementById('status-werte');
        if (el) el.innerHTML = statusCache;
    }

    function playBeep(freq = 800, duration = 0.05) {
        if (window.klickTonAktiv === false) return;
        
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);

    }

    function triggerScan() {
        const scan = document.getElementById('scanline');
        if (scan) {
            scan.classList.remove('scanning');
            void scan.offsetWidth;
            scan.classList.add('scanning');
            playBeep(1200, 0.03);
        }
    }

    function startClock() {
        setInterval(() => {
            const now = new Date();
            const clockEl = document.getElementById('clock');
            if (clockEl) clockEl.innerText = now.toLocaleTimeString() + " TX";
        }, 1000);
    }

    window.activeFluxModel = "";

    function f_buchen() {
        triggerScan();
        
        let lvlSpan = document.getElementById('lvl-val');
        let lvl = lvlSpan ? parseInt(lvlSpan.innerText) : 1;

        let hs1200 = window.hs1200 || 0;
        let hs3000 = window.hs3000 || 0;
        let hs4400 = window.hs4400 || 0;

        let btn1200 = lvl >= 5 
            ? `<div style="font-size: 0.65em; color: #ffcc00; text-align: right; margin-bottom: -10px; margin-top: 15px;">Highscore: ${hs1200}</div><button class="modell-btn" onclick="selectFlux('FLUX 1200')">FLUX 1200 (Bereit)</button>` 
            : `<div style="font-size: 0.65em; color: #555; text-align: right; margin-bottom: -10px; margin-top: 15px;">Highscore: ${hs1200}</div><button class="modell-btn" style="color: #f44; border-color: #f44; cursor: not-allowed; opacity: 0.5;" onclick="window.lockMessage(5)">FLUX 1200 [ GESPERRT - LVL 5 ]</button>`;

        let btn3000 = lvl >= 50 
            ? `<div style="font-size: 0.65em; color: #ffcc00; text-align: right; margin-bottom: -10px; margin-top: 15px;">Highscore: ${hs3000}</div><button class="modell-btn" onclick="selectFlux('FLUX 3000')">FLUX 3000 (Bereit)</button>` 
            : `<div style="font-size: 0.65em; color: #555; text-align: right; margin-bottom: -10px; margin-top: 15px;">Highscore: ${hs3000}</div><button class="modell-btn" style="color: #f44; border-color: #f44; cursor: not-allowed; opacity: 0.5;" onclick="window.lockMessage(50)">FLUX 3000 [ GESPERRT - LVL 50 ]</button>`;

        let btn4400 = lvl >= 150 
            ? `<div style="font-size: 0.65em; color: #ffcc00; text-align: right; margin-bottom: -10px; margin-top: 15px;">Highscore: ${hs4400}</div><button class="modell-btn" onclick="selectFlux('FLUX 4400')">FLUX 4400 (Bereit)</button>` 
            : `<div style="font-size: 0.65em; color: #555; text-align: right; margin-bottom: -10px; margin-top: 15px;">Highscore: ${hs4400}</div><button class="modell-btn" style="color: #f44; border-color: #f44; cursor: not-allowed; opacity: 0.5;" onclick="window.lockMessage(150)">FLUX 4400 [ GESPERRT - LVL 150 ]</button>`;

        document.getElementById('content-body').innerHTML = '<h3>Modul-Wahl</h3>' +
            btn1200 + btn3000 + btn4400 +
            '<div id="lock-msg"></div>' +
            '<hr><button onclick="f_start()">Abbrechen</button>';
    }

    window.lockMessage = function(req) {
        if (typeof playBeep === 'function') playBeep(300, 0.1);
        const msgBox = document.getElementById('lock-msg');
        if(msgBox) msgBox.innerHTML = `<p style="color:#f44; font-size:0.8em; font-weight:bold; text-shadow: 0 0 5px #f44;">> Zugriff verweigert. Agenten-Level ${req} erforderlich.</p>`;
    };

    window.selectFlux = function(modell) {
        triggerScan();
        window.activeFluxModel = modell;

        window.merkerFlux1200 = false;
        window.merkerFlux3000 = false;
        window.merkerFlux4400 = false;

        if (modell === 'FLUX 1200') window.merkerFlux1200 = true;
        if (modell === 'FLUX 3000') window.merkerFlux3000 = true;
        if (modell === 'FLUX 4400') window.merkerFlux4400 = true;

        if (typeof window.startMinigame === 'function') {
            window.startMinigame(modell);
        } else {
            document.getElementById('content-body').innerHTML = '<p style="color:#f44;">[ FEHLER ]<br>Minispiel-Block (Block 6) nicht gefunden.</p><button onclick="f_buchen()">Zurück</button>';
        }
    };

    function f_epochen() {
        triggerScan();
        if (typeof renderEpochen === 'function') {
            renderEpochen();
        } else {
            document.getElementById('content-body').innerHTML = '<h3>Zeit Stränge</h3>' +
                '<div style="color:#0f8; font-family:monospace; margin: 20px 0; border: 1px dashed #0f8; padding: 15px;">' +
                '[ SYSTEM-UPDATE ERFORDERLICH ]<br>Zeitalter-Datenbank offline. Warte auf Modul-Verknüpfung...</div>' +
                '<hr><button onclick="f_start()">Zurück</button>';
        }
    }

    function aktualisiereStatusWerte() {
        if (statusCache === "") erzwingeStatus('STABIL', 'status-ok', false);
    }

    function f_status() {
        triggerScan();
        document.getElementById('content-body').innerHTML = '<h3>System-Diagnose</h3>' +
            '<p id="status-werte" style="color:#0f0; text-align: left; font-size: 0.8em; font-family: monospace; min-height: 100px;"></p>' +
            '<button onclick="f_start()">Zurück</button>';
        document.getElementById('status-werte').innerHTML = statusCache;
    }

    window.f_einstellungen = function() {
        if (typeof triggerScan === 'function') triggerScan();

        const audio = document.getElementById('bg-music');
        const isMusikAn = (audio && !audio.paused);
        const isSoundAn = window.klickTonAktiv;

        const musikFarbe = isMusikAn ? '#0f8' : '#f44';
        const musikText = isMusikAn ? 'AN' : 'AUS';

        const soundFarbe = isSoundAn ? '#0f8' : '#f44';
        const soundText = isSoundAn ? 'AN' : 'AUS';

        document.getElementById('content-body').innerHTML = `
            <h2>System-Einstellungen</h2>
            
            <div style="border: 1px solid rgba(0, 255, 204, 0.3); background: rgba(0, 255, 204, 0.05); padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                <span style="color: #0f8; opacity: 0.8;">Aktiver Agent:</span> 
                <b style="color: #fff; text-shadow: 0 0 5px #fff; letter-spacing: 1px;">${window.agentName || "UNBEKANNT"}</b>
            </div>

            <button class="modell-btn" style="border-color: ${musikFarbe}; color: ${musikFarbe};" onclick="window.toggleMusik()">
                HINTERGRUNDMUSIK: ${musikText}
            </button>
            
            <button class="modell-btn" style="border-color: ${soundFarbe}; color: ${soundFarbe};" onclick="window.toggleKlick()">
                KLICKGERÄUSCHE: ${soundText}
            </button>

            <button class="modell-btn" style="border-color: #4488ff; color: #4488ff;" onclick="window.f_desc_choice()">
                SPIELBESCHREIBUNG
            </button>

            <button class="modell-btn" style="border-color: #0af; color: #0af; margin-top: 15px;" onclick="window.f_changeEmailStep1()">
                E-MAIL ÄNDERN
            </button>

            <button class="modell-btn" style="border-color: #0af; color: #0af;" onclick="window.f_changePasswordStep1()">
                PASSWORT ÄNDERN
            </button>

            <button class="modell-btn" style="border-color: #ff8800; color: #ff8800; margin-top: 15px;" onclick="window.f_logout_confirm()">
                AGENTEN ABMELDEN
            </button>
            
            <button class="modell-btn" style="border-color: #f44; color: #f44; border-style: dashed; margin-top: 10px; font-size: 0.7em;" onclick="window.deleteAgentProfile()">
                PROFIL ENDGÜLTIG TERMINIEREN
            </button>
            
            <hr style="border-color: rgba(0, 255, 204, 0.2); margin: 20px 0;">
            
            <button class="modell-btn" onclick="window.f_start()">ZURÜCK</button>
        `;
    };

    // --- E-Mail ändern (auch zum erstmaligen Hinterlegen, falls noch keine da ist) ---
    window.f_changeEmailStep1 = function() {
        if (typeof triggerScan === 'function') triggerScan();
        const currentEmail = (window.auth && window.auth.currentUser) ? window.auth.currentUser.email : '';
        const isSynthetic = currentEmail.endsWith('@agenten.flux-terminal.local');
        document.getElementById('content-body').innerHTML = `
            <h3 style="color:#0af;">[ E-MAIL ÄNDERN ]</h3>
            <p style="color:#aaa; font-size:0.8em; margin-bottom:15px;">
                ${isSynthetic ? 'Für dieses Konto ist noch keine echte E-Mail hinterlegt (nötig für "Passwort vergessen").' : 'Aktuell hinterlegt: ' + currentEmail}
            </p>
            <input type="email" id="new-email-input" placeholder="NEUE E-MAIL..." style="width:80%; padding:10px; background:#000; border:1px solid #0af; color:#0af; margin-bottom:15px; outline:none; font-family:monospace; text-align:center;">
            <input type="password" id="new-email-pass-confirm" placeholder="AKTUELLES PASSWORT ZUR BESTÄTIGUNG..." style="width:80%; padding:10px; background:#000; border:1px solid #0af; color:#0af; margin-bottom:15px; outline:none; font-family:monospace; text-align:center;">
            <div id="change-error" style="color:#f44; font-size:0.8em; margin-bottom:10px; height:15px;"></div>
            <button class="modell-btn" style="border-color:#0af; color:#0af;" onclick="window.f_changeEmailConfirm()">ÄNDERN</button>
            <button class="modell-btn" onclick="window.f_einstellungen()">ABBRECHEN</button>
        `;
    };

    window.f_changeEmailConfirm = async function() {
        const newEmail = document.getElementById('new-email-input').value.trim();
        const passInput = document.getElementById('new-email-pass-confirm').value;
        const errDiv = document.getElementById('change-error');
        if (!newEmail || !passInput) { errDiv.innerText = "Bitte beide Felder ausfüllen."; return; }

        try {
            const user = window.auth.currentUser;
            if (!user) { errDiv.innerText = "Keine aktive Sitzung."; return; }

            const cred = window.fbEmailAuthProvider.credential(user.email, passInput);
            await window.fbReauthenticate(user, cred); // wirft bei falschem Passwort

            await window.fbUpdateEmail(user, newEmail);

            const slug = window.agentSlug(window.agentName);
            try { await window.setDoc(window.doc(window.db, "login_lookup", slug), { email: newEmail }, { merge: true }); } catch(e) {}

            errDiv.style.color = "#0f8";
            errDiv.innerText = "E-Mail geändert!";
            setTimeout(() => window.f_einstellungen(), 1200);
        } catch (e) {
            errDiv.style.color = "#f44";
            errDiv.innerText = (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') ? "Passwort inkorrekt!" : (e.code === 'auth/email-already-in-use' ? "E-Mail bereits vergeben." : "Fehler: " + (e.code || e.message));
        }
    };

    // --- Passwort ändern ---
    window.f_changePasswordStep1 = function() {
        if (typeof triggerScan === 'function') triggerScan();
        document.getElementById('content-body').innerHTML = `
            <h3 style="color:#0af;">[ PASSWORT ÄNDERN ]</h3>
            <input type="password" id="old-pass-confirm" placeholder="AKTUELLES PASSWORT..." style="width:80%; padding:10px; background:#000; border:1px solid #0af; color:#0af; margin-bottom:15px; outline:none; font-family:monospace; text-align:center;">
            <input type="password" id="new-pass-input" placeholder="NEUES PASSWORT (min. 6 Zeichen)..." style="width:80%; padding:10px; background:#000; border:1px solid #0af; color:#0af; margin-bottom:15px; outline:none; font-family:monospace; text-align:center;">
            <div id="change-error" style="color:#f44; font-size:0.8em; margin-bottom:10px; height:15px;"></div>
            <button class="modell-btn" style="border-color:#0af; color:#0af;" onclick="window.f_changePasswordConfirm()">ÄNDERN</button>
            <button class="modell-btn" onclick="window.f_einstellungen()">ABBRECHEN</button>
        `;
    };

    window.f_changePasswordConfirm = async function() {
        const oldPass = document.getElementById('old-pass-confirm').value;
        const newPass = document.getElementById('new-pass-input').value;
        const errDiv = document.getElementById('change-error');
        if (!oldPass || !newPass) { errDiv.innerText = "Bitte beide Felder ausfüllen."; return; }
        if (newPass.length < 6) { errDiv.innerText = "Neues Passwort zu kurz (min. 6 Zeichen)."; return; }

        try {
            const user = window.auth.currentUser;
            if (!user) { errDiv.innerText = "Keine aktive Sitzung."; return; }

            const cred = window.fbEmailAuthProvider.credential(user.email, oldPass);
            await window.fbReauthenticate(user, cred); // wirft bei falschem Passwort

            await window.fbUpdatePassword(user, newPass);

            errDiv.style.color = "#0f8";
            errDiv.innerText = "Passwort geändert!";
            setTimeout(() => window.f_einstellungen(), 1200);
        } catch (e) {
            errDiv.style.color = "#f44";
            errDiv.innerText = (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') ? "Aktuelles Passwort inkorrekt!" : "Fehler: " + (e.code || e.message);
        }
    };


/* ==== next block ==== */


    if (!document.getElementById('flux-chat-styles')) {
        const style = document.createElement('style');
        style.id = 'flux-chat-styles';
        style.innerHTML = `
            @keyframes nav-blink {
                0% { background: rgba(0, 255, 204, 0.1); border-color: #0f8; }
                50% { background: rgba(255, 68, 68, 0.4); border-color: #f44; box-shadow: 0 0 15px #f44; }
                100% { background: rgba(0, 255, 204, 0.1); border-color: #0f8; }
            }
            .chat-alert { animation: nav-blink 0.8s infinite !important; }
        `;
        document.head.appendChild(style);
    }

window.f_chat = function() {
    checkSystemWarningChance();
    if (typeof triggerScan === 'function') triggerScan();
    const chatBtn = document.getElementById('komm-link-btn');
    if(chatBtn) chatBtn.classList.remove('status-warn-pulse');
    window.currentChatTarget = null; 

    document.getElementById('content-body').innerHTML = `
        <h3 style="color: #0f8;">[ KOMM-LINK ]</h3>
        <div style="margin-bottom: 20px;">
            <div style="font-size: 0.6em; color: #0f8; margin-bottom: 5px;">AGENTEN-ID EINGEBEN:</div>
            <div style="display: flex; gap: 5px;">
                <input type="text" id="chat-target-input" placeholder="NAME..." autocomplete="off" style="flex-grow: 1; background: #000; border: 1px solid #0f8; color: #0f8; padding: 8px; font-family: monospace; outline: none; text-transform: uppercase;">
                <button class="modell-btn" style="margin: 0; width: auto; padding: 0 15px;" onclick="window.startDirectFunk()">FUNK</button>
            </div>
        </div>
        <div style="text-align: left; margin-bottom: 20px;">
            <div style="font-size: 0.6em; opacity: 0.6; margin-bottom: 5px;">GESPEICHERTE KANÄLE:</div>
            <div id="active-chat-list"><div style="color:#0f8; font-size: 0.8em; margin: 10px 0;">Synchronisiere Funkwellen...</div></div>
        </div>
        <button class="modell-btn" style="border-color: #ffcc00; color: #ffcc00;" onclick="window.renderRadarView()">📡 RADAR AKTIVIEREN</button>
        <hr style="border-color: rgba(0,255,204,0.2); margin: 15px 0;">
        <button onclick="window.f_start()">ZURÜCK</button>
    `;

    if (window.db) {
        if (window.chatListListener) window.chatListListener();
        const funkRef = window.collection(window.db, "agenten_funk");
        const q = window.query(funkRef, window.where("teilnehmer", "array-contains", window.agentSlug(window.agentName)));
        window.chatListListener = window.onSnapshot(q, (snapshot) => {
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
                html += `<div class="log-entry" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,255,204,0.1); padding: 8px 0;">
                    <span style="cursor: pointer; flex-grow: 1; ${style}" onclick="window.openPrivateChat('${other}')">> AGENT: ${other.toUpperCase()}${data.ungelesen_fuer === window.agentSlug(window.agentName) ? " [NEUE NACHRICHT]" : ""}</span>
                    <span style="cursor: pointer; color: #f44; padding: 0 10px;" onclick="window.deleteChat('${other}')">🗑️</span>
                </div>`;
            });
            listContainer.innerHTML = html;
        });
    }
};

    window.renderRadarView = function() {
        if (typeof triggerScan === 'function') triggerScan();
        document.getElementById('content-body').innerHTML = `
            <h3 style="color: #ffcc00;">[ SEKTOR-RADAR ]</h3>
            <div id="radar-container" style="position: relative; height: 150px; border: 1px solid rgba(255,204,0,0.3); background: rgba(0,20,0,0.5); margin-bottom: 15px; overflow: hidden; border-radius: 4px;">
                <div style="position: absolute; width: 100%; height: 100%; background: conic-gradient(from 0deg, transparent, rgba(255,204,0,0.1)); animation: radar-spin 4s linear infinite;"></div>
                <div id="radar-agents" style="position: absolute; width: 100%; height: 100%;"></div>
            </div>
            <div id="online-list" style="max-height: 150px; overflow-y: auto; text-align: left;"></div>
            <hr>
            <button class="modell-btn" onclick="if(window.currentRadarListener) window.currentRadarListener(); window.f_chat();">RADAR DEAKTIVIEREN</button>
        `;
        window.startRadarScan();
    };

    window.currentRadarListener = null;
    window.startRadarScan = function() {
        if (!window.db) return;
        const listEl = document.getElementById('online-list');
        const radarAgents = document.getElementById('radar-agents');
        if (window.currentRadarListener) window.currentRadarListener();

        const agentRef = window.collection(window.db, "agenten");
        window.currentRadarListener = window.onSnapshot(agentRef, (snapshot) => {
            const now = Date.now();
            let htmlList = "", htmlRadar = "", count = 0;
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.last_ping && (now - data.last_ping < 120000) && doc.id !== window.agentSlug(window.agentName)) {
                    count++;
                    const top = Math.floor(Math.random() * 70) + 15, left = Math.floor(Math.random() * 70) + 15;
                    htmlRadar += `<div class="pulse-amber" style="position: absolute; top:${top}%; left:${left}%; width:6px; height:6px; background:#0f8; border-radius:50%; box-shadow:0 0 5px #0f8;"></div>`;
                    htmlList += `<div class="log-entry" style="color:#0f8; cursor:pointer;" onclick="window.openPrivateChat('${doc.id.toUpperCase()}')">> ${doc.id.toUpperCase()} (Online)</div>`;
                }
            });
            if (listEl) listEl.innerHTML = count > 0 ? htmlList : '<div style="color:#555; font-size:0.8em;">Keine Agenten im Sektor...</div>';
            if (radarAgents) radarAgents.innerHTML = htmlRadar;
        });
    };

window.openPrivateChat = function(targetAgentName) {
    if (typeof triggerScan === 'function') triggerScan();
    const myName = window.agentSlug(window.agentName);
    const targetName = window.agentSlug(targetAgentName);
    const channelId = [myName, targetName].sort().join("_");
    window.currentChatTarget = targetName; 

    if (window.db) {
        window.setDoc(window.doc(window.db, "agenten_funk", channelId), { ungelesen_fuer: "" }, { merge: true });
    }

    const navBtn = document.getElementById('komm-link-btn');
    if (navBtn) navBtn.classList.remove('status-warn-pulse');

    document.getElementById('content-body').innerHTML = `
        <h3 style="color: #0f8;">[ FUNK: <span id="chat-target-name"></span> ]</h3>
        <div id="chat-window" style="height: 250px; border: 1px solid #0f8; background: rgba(0,0,0,0.8); margin-bottom: 10px; padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; text-align: left; font-size: 0.8em;"></div>
        <div style="display: flex; gap: 5px;">
            <input type="text" id="msg-input" placeholder="Nachricht..." autocomplete="off" style="flex-grow: 1; background: #000; border: 1px solid #0f8; color: #0f8; padding: 8px; font-family: monospace; outline: none;">
            <button class="modell-btn" id="chat-send-btn" style="margin: 0; width: auto; padding: 0 15px;">SENDEN</button>
        </div>
        <button class="modell-btn" style="margin-top: 15px; border-style: dashed;" onclick="if(window.currentChatListener) window.currentChatListener(); window.f_chat();">FUNK TRENNEN</button>
    `;
    document.getElementById('chat-target-name').textContent = targetAgentName.toUpperCase();
    document.getElementById('chat-send-btn').addEventListener('click', () => window.sendMsg(channelId, targetName));

    if (window.db) {
        if (window.currentChatListener) window.currentChatListener();
        const q = window.query(window.collection(window.db, "agenten_funk", channelId, "nachrichten"), window.orderBy("zeitstempel", "asc"), window.limit(50));
        window.currentChatListener = window.onSnapshot(q, (snapshot) => {
            const win = document.getElementById('chat-window');
            if (!win) return;
            win.innerHTML = "";
            snapshot.forEach((doc) => {
                const data = doc.data();
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
            });
            win.scrollTop = win.scrollHeight;
        });
    }
};

    window.sendMsg = async function(channelId, targetName) {
        const inp = document.getElementById('msg-input');
        const text = inp.value.trim();
        if (text === "" || !window.db) return;
        inp.value = "";
        try {
            const myName = window.agentSlug(window.agentName);
            const msgRef = window.collection(window.db, "agenten_funk", channelId, "nachrichten");
            await window.addDoc(msgRef, { absender: window.agentName, text: text, zeitstempel: window.serverTimestamp() });
            const channelRef = window.doc(window.db, "agenten_funk", channelId);
            await window.setDoc(channelRef, { 
                teilnehmer: [myName, targetName], 
                ungelesen_fuer: targetName,
                last_ping: Date.now() 
            }, { merge: true });
        } catch (e) { console.error(e); }
    };

    window.deleteChat = async function(targetName) {
        if(!confirm(`Kanal mit ${targetName.toUpperCase()} wirklich im Briefkasten löschen?`)) return;

        const myName = window.agentSlug(window.agentName);
        const targetNameLow = targetName;
        const channelId = [myName, targetNameLow].sort().join("_");

        if (window.db && window.getDocs && window.deleteDoc) {
            try {
                const msgRef = window.collection(window.db, "agenten_funk", channelId, "nachrichten");
                const snapshot = await window.getDocs(msgRef);
                const deletePromises = snapshot.docs.map(mDoc => window.deleteDoc(mDoc.ref));
                await Promise.all(deletePromises);
                
                const channelRef = window.doc(window.db, "agenten_funk", channelId);
                await window.deleteDoc(channelRef);
                
                console.log("FUNK-KANAL IM BRIEFKASTEN GELEERT");
            } catch (e) { console.error("FEHLER BEI BRIEFKASTEN-REINIGUNG:", e); }
        }
        window.f_chat();
    };

    window.startDirectFunk = function() {
        const target = document.getElementById('chat-target-input').value.trim();
        if (target) window.openPrivateChat(target);
    };

window.startGlobalNotification = function() {
    if (!window.agentName || !window.db) {
        setTimeout(window.startGlobalNotification, 2000);
        return;
    }
    const myName = window.agentSlug(window.agentName);
    const q = window.query(window.collection(window.db, "agenten_funk"), window.where("teilnehmer", "array-contains", myName));

    if (window.globalChatListener) window.globalChatListener();
    window.globalChatListener = window.onSnapshot(q, (snapshot) => {
        let hasUnread = false;
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.ungelesen_fuer === myName) {
                if (document.getElementById('chat-window') && window.currentChatTarget === (data.teilnehmer.find(n => n !== myName))) {
                    window.setDoc(window.doc(window.db, "agenten_funk", doc.id), { ungelesen_fuer: "" }, { merge: true });
                } else {
                    hasUnread = true;
                }
            }
        });

        const navBtn = document.getElementById('komm-link-btn');
        if (navBtn) {
            if (hasUnread) navBtn.classList.add('status-warn-pulse');
            else navBtn.classList.remove('status-warn-pulse');
        }
    });
};

    window.sendRadarPing = async function() {
        if (!window.db || !window.agentName) return;
        try {
            const agentRef = window.doc(window.db, "agenten", window.agentSlug(window.agentName));
            await window.setDoc(agentRef, { last_ping: Date.now() }, { merge: true });
        } catch(e) {}
    };

    setTimeout(window.startGlobalNotification, 4000);
    setInterval(window.sendRadarPing, 60000);


/* ==== next block ==== */


    window.isAgentVerified = false;
    window.agentName = "";
    window.playerXP = 0;
    window.playerLevel = 1;
    window.hs1200 = 0;
    window.hs3000 = 0;
    window.hs4400 = 0;
    window.playerCredits = 0;
    window.playerMateriezellen = 0;
    window.currentMissionType = 'normal';

    // Hinweis: 'flux_last_agent' wird NICHT mehr zur Verifizierung genutzt (das war eine
    // Sicherheitslücke - jeder konnte sich per DevTools als beliebiger Agent inkl. Admin ausgeben).
    // Es dient nur noch als reiner Komfort-Hinweis (z.B. Login-Feld vorausfüllen).
    window.lastKnownAgentHint = localStorage.getItem('flux_last_agent') || "";

    window.saveProgress = async function() {
        if (!window.agentName || window.agentName === "") return;
        
        const uploadIcon = document.getElementById('upload-indicator');
        if(uploadIcon) uploadIcon.style.display = 'block';

        let locationData = { 
            country: "Unbekannt", 
            region: "Unbekannt", 
            city: "Unbekannt",
            lat: 0.0,
            lon: 0.0
        };
        
        try {
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            if (data && !data.error) {
                locationData.country = data.country_name || "Unbekannt";
                locationData.region = data.region || "Unbekannt";
                locationData.city = data.city || "Unbekannt";
                locationData.lat = data.latitude || 0.0;
                locationData.lon = data.longitude || 0.0;
            }
        } catch (e) { console.error("Standort-Uplink fehlgeschlagen:", e); }

        const data = { 
            xp: window.playerXP, 
            lvl: window.playerLevel, 
            hs1200: window.hs1200, 
            hs3000: window.hs3000, 
            hs4400: window.hs4400,
            credits: window.playerCredits,
            materiezellen: window.playerMateriezellen,
            music: localStorage.getItem('flux_music_' + window.agentName.toLowerCase()) === 'true',
            sound: window.klickTonAktiv,
            agentOrigin: `${locationData.country}, ${locationData.region} (${locationData.city})`,
            lat: locationData.lat,
            lon: locationData.lon,
            lastSeen: new Date().toLocaleString('de-DE')
        };
        
        localStorage.setItem('flux_agent_' + window.agentName.toLowerCase(), JSON.stringify(data));
        localStorage.setItem('flux_last_agent', window.agentName);

        if (window.db && window.setDoc) {
            try {
                const agentRef = window.doc(window.db, "agenten", window.agentSlug(window.agentName));
                await window.setDoc(agentRef, data, { merge: true });
            } catch (e) {
                console.error("Cloud-Fehler:", e);
            }
        }
        setTimeout(() => { if(uploadIcon) uploadIcon.style.display = 'none'; }, 1000);
    };

    window.loadProgress = async function() {
        if (!window.agentName || window.agentName === "") return;
        if (!window.db) { setTimeout(window.loadProgress, 200); return; }

        try {
            const agentRef = window.doc(window.db, "agenten", window.agentSlug(window.agentName));
            const docSnap = await window.getDoc(agentRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                window.playerXP = data.xp || 0;
                window.playerLevel = data.lvl || 1;
                window.hs1200 = data.hs1200 || 0;
                window.hs3000 = data.hs3000 || 0;
                window.hs4400 = data.hs4400 || 0;
                window.playerCredits = data.credits || 0;
                // Abwärtskompatibel: alte Dokumente hatten das Feld "materialzellen" (Tippfehler).
                window.playerMateriezellen = (data.materiezellen !== undefined) ? data.materiezellen : (data.materialzellen || 0);
                
                window.klickTonAktiv = data.sound !== undefined ? data.sound : true;
                localStorage.setItem('flux_music_' + window.agentName.toLowerCase(), data.music || false);
                
                const bgMusic = document.getElementById('bg-music');
                if (bgMusic) {
                    if (data.music) bgMusic.play().catch(e => {});
                    else bgMusic.pause();
                }
            }
        } catch (e) { console.error("Cloud-Ladefehler:", e); }
        window.updateUI();
    };

    window.adminDeleteProfile = function(targetName) {
        if (!targetName) return false;
        localStorage.removeItem('flux_agent_' + targetName.toLowerCase());
        if (window.agentSlug(window.agentName) === targetName) {
            localStorage.removeItem('flux_last_agent');
            location.reload(); 
        }
        return true;
    };

    window.updateXP = function(val) {
        window.playerXP += val;
        while (window.playerXP >= 100) { window.playerLevel++; window.playerXP -= 100; }
        while (window.playerXP < 0) {
            if (window.playerLevel > 1) { window.playerLevel--; window.playerXP += 100; }
            else { window.playerXP = 0; break; }
        }
        window.updateUI();
        window.saveProgress();
    };

    window.updateUI = function() {
        const xpV = document.getElementById('xp-val'), lvlV = document.getElementById('lvl-val'), xpF = document.getElementById('xp-bar-fill');  
        if (xpV) xpV.innerText = window.playerXP;
        if (lvlV) lvlV.innerText = window.playerLevel;
        if (xpF) xpF.style.width = window.playerXP + "%";
    };
  
    window.toggleMusik = function() {
        const audio = document.getElementById('bg-music');
        const panel = document.getElementById('audio-control-panel');
        if (!audio) return;

        let musicState = audio.paused; 
        
        window.saveAudioSettings(musicState, window.klickTonAktiv);

        if (musicState) {
            audio.volume = 0.4;
            audio.play().catch(e => {});
            if(panel) { panel.innerText = "🎵 AUDIO: AN"; panel.style.color = "#0f8"; panel.style.borderColor = "#0f8"; }
        } else {
            audio.pause();
            if(panel) { panel.innerText = "🎵 AUDIO: AUS"; panel.style.color = "#f44"; panel.style.borderColor = "#f44"; }
        }
        
        window.f_einstellungen(); 
    };

    window.toggleKlick = function() {
        window.klickTonAktiv = !window.klickTonAktiv;

        let savedMusic = localStorage.getItem('flux_music') === 'true';
        window.saveAudioSettings(savedMusic, window.klickTonAktiv);
        window.f_einstellungen();
    };

    window.saveAudioSettings = function(musicState, soundState) {
        localStorage.setItem('flux_music_' + window.agentName.toLowerCase(), musicState);
        localStorage.setItem('flux_sound_' + window.agentName.toLowerCase(), soundState);
        window.saveProgress();
    };

    window.loadAudioSettings = function() {
        if(!window.agentName) return;
        let isMusicOn = localStorage.getItem('flux_music_' + window.agentName.toLowerCase()) === 'true';
        let isSoundOn = localStorage.getItem('flux_sound_' + window.agentName.toLowerCase()) !== 'false'; 

        window.klickTonAktiv = isSoundOn; 
        const bgMusic = document.getElementById('bg-music');
        if (bgMusic) {
            bgMusic.volume = 0.4;
            if (isMusicOn) {
                const startMusic = () => {
                    if (localStorage.getItem('flux_music_' + window.agentName.toLowerCase()) === 'true') {
                        bgMusic.play().catch(e => {});
                    }
                    document.removeEventListener('click', startMusic);
                };
                document.addEventListener('click', startMusic);
            } else { bgMusic.pause(); }
        }
    };

    window.f_logout_confirm = function() {
        if (typeof triggerScan === 'function') triggerScan();
        document.getElementById('content-body').innerHTML = `
            <h3>Sicherheitsabfrage</h3>
            <p style="color: #ff8800; font-size: 0.9em; margin-bottom: 20px;">Soll die aktuelle Agenten-Sitzung wirklich beendet werden?</p>
            <button class="modell-btn" style="background: rgba(255, 136, 0, 0.1); border-color: #ff8800; color: #ff8800;" onclick="window.f_logout_execute()">JA, ABMELDEN</button>
            <button class="modell-btn" onclick="window.f_einstellungen()">ABBRECHEN</button>
        `;
    };

    window.f_logout_execute = async function() {
        localStorage.removeItem('flux_last_agent');
        try { if (window.auth) await window.fbSignOut(window.auth); } catch(e) {}
        window.isAgentVerified = false;
        window.agentName = "";
        location.reload(); 
    };

    setTimeout(window.loadAudioSettings, 500);


/* ==== next block ==== */


(function() {
    const overlay = document.createElement('div');
    overlay.id = 'mission-overlay'; overlay.classList.add('top-level'); 
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:#000; color:#0f8; z-index:10001; display:none; flex-direction:column; justify-content:center; align-items:center; padding:20px; font-family:monospace; text-align:center; box-sizing:border-box;";
    document.body.appendChild(overlay);

    let mStartTime;
    let missionHistory = [];

    function missionSpeak(text) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(text);
        msg.lang = 'de-DE'; msg.pitch = 0.8;
        window.speechSynthesis.speak(msg);
    }

    function startResetSequence(isEMP = false, isAutoCrash = false) {
        crashSequenceActive = true;
        stopCoherenceTicker();

        const rbLayer = document.getElementById('reboot-layer');
        const rbBar = document.getElementById('reboot-bar-container');
        const rbFill = document.getElementById('reboot-bar-fill');
        const rbStatus = document.getElementById('reboot-status');
        const rbHeader = document.getElementById('reboot-header');

        if (isAutoCrash) {
            if (typeof updateXP === 'function') updateXP(-200);
            window.speechSynthesis.cancel();
            const msg = new SpeechSynthesisUtterance("Fehler kritisch. System hat sich eigenständig stabilisiert. Levelverlust verzeichnet.");
            msg.lang = 'de-DE';
            window.speechSynthesis.speak(msg);
        }

        const statusEl = document.getElementById('status-val');
        const currentStatus = statusEl ? statusEl.innerText : "STABIL";
        if (currentStatus === "WARNUNG" || currentStatus === "INSTABIL") {
            if (typeof updateXP === 'function') updateXP(50);
        }

        rbLayer.style.display = 'flex';
        rbBar.style.display = 'block';
        rbStatus.style.display = 'block';
        rbStatus.style.color = "#f44";
        rbFill.style.transition = "none";
        rbFill.style.width = "100%";
        
        const shutdownSteps = [
            { text: "Beende Chrono-Prozesse...", w: "85%", t: 500 },
            { text: "Deaktiviere Zeit-Relais...", w: "65%", t: 1500 },
            { text: "Sichere Agenten-Logbuch...", w: "40%", t: 2800 },
            { text: "Fahre Hardware-Kern herunter...", w: "15%", t: 4200 },
            { text: "SYSTEM OFFLINE.", w: "0%", t: 5500 }
        ];

        shutdownSteps.forEach(step => {
            setTimeout(() => {
                rbFill.style.transition = "width 1.3s ease-in-out";
                rbStatus.innerText = step.text;
                rbFill.style.width = step.w;
            }, step.t);
        });

        setTimeout(() => {
            rbBar.style.display = 'none'; rbStatus.style.display = 'none'; rbHeader.style.display = 'none';
        }, 7200);

        setTimeout(() => {
            rbHeader.style.display = 'block'; rbHeader.innerText = "[ SYSTEM REBOOT ]";
            rbBar.style.display = 'block'; rbStatus.style.display = 'block'; rbStatus.style.color = "#0f8";
            rbFill.style.width = "0%";
            
            const bootSteps = [
                { text: "Initialisiere BIOS V5.2...", w: "20%", t: 0 },
                { text: "Fuchs Generator wird geladen...", w: "40%", t: 1500, glitch: true },
                { text: "Fuchs Generator: Energie-Synchronisation...", w: "40%", t: 3500, glitch: true }, 
                { text: "Spannung stabilisiert. Lade Chrono-Matrix...", w: "65%", t: 5500, glitch: false },
                { text: "Verbinde mit Sektoren...", w: "90%", t: 7500 },
                { text: "Systemstarting...", w: "100%", t: 9500 }
            ];

            bootSteps.forEach(step => {
                setTimeout(() => {
                    rbStatus.innerText = step.text;
                    rbFill.style.transition = "width 1s linear";
                    rbFill.style.width = step.w;
                    if (step.glitch) rbLayer.classList.add('flicker-active');
                    else rbLayer.classList.remove('flicker-active');
                }, step.t);
            });
        }, 8500);

        setTimeout(() => {
            crashSequenceActive = false;
            currentCoherence = 98.4;
            if (typeof starteSynchronenZyklus === 'function') starteSynchronenZyklus();
            startCoherenceTicker();
            window.fullSystemRestore();
            rbLayer.classList.remove('flicker-active');
            rbHeader.innerText = "[ SYSTEM RESET ]";
        }, 19500);
    }
    window.startResetSequence = startResetSequence;

    window.fullSystemRestore = function() {
        overlay.style.display = 'none';
        document.getElementById('reboot-layer').style.display = 'none';
        document.getElementById('back-button-global').style.setProperty('display', 'none', 'important');
        ['header', 'nav', '#xp-leiste-auto'].forEach(s => {
            const el = document.querySelector(s);
            if(el) el.style.setProperty('display', s.includes('xp') ? 'flex' : 'block', 'important');
        });
        const anzeige = document.getElementById('anzeige');
        if (anzeige) anzeige.innerHTML = '<div id="scanline" class="scanline"></div><div id="content-body"></div>';
        if (typeof f_start === 'function') setTimeout(f_start, 50);
    };
  
    document.addEventListener('keydown', function(e) {
        const field = document.getElementById('terminal-input-field');
        if (!field || e.target !== field || e.key !== 'Enter') return;
        const cmd = field.value.toLowerCase().trim();
        field.value = '';
        
        if (cmd === '') return;

        const anzeige = document.getElementById('anzeige');
        ['header', 'nav', '#xp-leiste-auto'].forEach(s => { const el = document.querySelector(s); if(el) el.style.display = 'none'; });
        document.getElementById('back-button-global').style.setProperty('display', 'block', 'important');

        if (cmd === '/flux-boost' || cmd === '/flux-test' || cmd === '/flux-override' || cmd === '/flux-loeschen' || cmd === 'control') {
            if (!window.adminMerkerAktiv) {
                anzeige.innerHTML = '<p style="color:#f44; padding:20px;">[ FEHLER ]<br>> Zugriff verweigert.<br>> Keine Administrator-Rechte detektiert.</p>';
                return;
            }

            if (cmd === 'control') {
                // Admin-Dashboard prüft die isAdmin===true-Berechtigung selbst noch einmal
                // eigenständig über Firebase Auth/Firestore - dieser Befehl ist nur der Aufruf.
                anzeige.innerHTML = '<div style="color:#0f8; font-family:monospace; text-align:center; margin-top:10vh;">[ CONTROL ]<br>> Admin-Terminal wird geöffnet...</div>';
                window.open('admin.html', '_blank');
                setTimeout(window.fullSystemRestore, 1000);
                return;
            }

            if (cmd === '/flux-boost') {
                if (typeof window.updateXP === 'function') window.updateXP(10000);
                anzeige.innerHTML = '<div style="color:#0f8; font-family:monospace; text-align:center; margin-top:10vh;">[ SECRET OVERRIDE ]<br>> +100 Level transferiert.<br>> Zeitlinie wird stabilisiert...</div>';
                setTimeout(window.fullSystemRestore, 2000);
                return;
            } else if (cmd === '/flux-test') {
                if (typeof window.triggerSystemMalfunction === 'function') {
                    window.triggerSystemMalfunction();
                }
                anzeige.innerHTML = '<div style="color:#ff8800; font-family:monospace; text-align:center; margin-top:10vh;">[ TEST-MODUS AKTIVIERT ]<br>> Warn-Sequenz eingeleitet.<br>> Status: WARNUNG</div>';
                setTimeout(window.fullSystemRestore, 1500);
                return;
            } else if (cmd === '/flux-override') {
                if (typeof window.triggerSystemOverride === 'function') window.triggerSystemOverride();
                anzeige.innerHTML = '<div style="color:#0f8; font-family:monospace; text-align:center; margin-top:10vh;">[ EMERGENCY OVERRIDE ]<br>> Zeitlinie gesichert.<br>> Status: STABIL</div>';
                setTimeout(window.fullSystemRestore, 1500);
                return;
            } else if (cmd === '/flux-loeschen') {
                let geloescht = 0;
                let keys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    let k = localStorage.key(i);
                    if (k.startsWith('flux_agent_') || k === 'flux_last_agent') keys.push(k);
                }
                keys.forEach(k => { localStorage.removeItem(k); geloescht++; });
                window.isAgentVerified = false;
                window.agentName = "";
                anzeige.innerHTML = `<div style="color:#f44; font-family:monospace; text-align:center; margin-top:10vh;">[ DATENBANK FORMATIERT ]<br>> ${geloescht} Datensätze restlos vernichtet.<br>> System startet neu...</div>`;
                setTimeout(() => location.reload(), 2500);
                return;
            }
        }

        if (cmd === 'flux-reset') {
            startResetSequence(); 
        } else if (cmd === 'help') {
            let helpText = '<div style="color:#0f8; padding:20px;">[ BEFEHLE ]<br>> help<br>> log<br>> flux-reset<br>> rekrutieren';
            if (window.adminMerkerAktiv) {
                helpText += '<br><br>[ ADMIN BEFEHLE ]<br>> /flux-boost<br>> /flux-test<br>> /flux-override<br>> /flux-loeschen<br>> control';
            }
            helpText += '</div>';
            anzeige.innerHTML = helpText;
        } else if (cmd === 'rekrutieren') {
            window.f_shareVideo = function() {
                const webLink = "https://marcus994546.github.io/D-ck-und-Flux-zeitreise-Agentur/"; 
                const videoLink = "https://marcus994546.github.io/D-ck-und-Flux-zeitreise-Agentur/Flux%20Agentur%20Werbung.mp4";
                const shareText = "Die Realität, die du kennst, ist fehlerhaft. Sieh dir diese geleakte Übertragung an:\n" + videoLink + "\n\nWir brauchen fähige Agenten. Klinke dich in das Terminal ein und stabilisiere die Zeitlinie:\n" + webLink;
                const shareData = { title: 'Dück & Flux Zeitreiseagentur', text: shareText };
                
                if (navigator.share) { navigator.share(shareData).catch(console.error); } 
                else { navigator.clipboard.writeText(shareText).then(() => alert("Signal-Link kopiert. Bereit zur Übertragung.")); }
            };
            if (typeof triggerScan === 'function') triggerScan();
            anzeige.innerHTML = `
                <div style="color:#0f8; text-align:center; padding:10px;">
                    <h3 style="text-shadow: 0 0 10px #0f8;">[ REKRUTIERUNGS-SIGNAL ]</h3>
                    <video src="Flux%20Agentur%20Werbung.mp4" controls autoplay style="width:100%; max-width:400px; border:1px solid #0f8; margin-bottom:15px; box-shadow: 0 0 10px rgba(0,255,204,0.3);"></video>
                    <p style="font-size:0.8em; color:#aaa; margin-bottom:15px;">Leite dieses Signal weiter, um neue Agenten für den Sektor zu rekrutieren. Die Zeitlinie ist instabil.</p>
                    <button class="modell-btn" style="border-color:#ffcc00; color:#ffcc00;" onclick="window.f_shareVideo()">SIGNAL TEILEN</button>
                </div>
            `;
        } else if (cmd === 'log') {
            let logH = '<div style="color:#0f8; padding:20px;"><h3>Missions-Log</h3>';
            if(missionHistory.length === 0) logH += "> Keine Einträge vorhanden.<br>";
            missionHistory.forEach(m => { logH += `> [${m.date}] ${m.status}<br>`; });
            anzeige.innerHTML = logH + "</div>";
        } else {
            anzeige.innerHTML = `<p style="color:#f44; padding:20px;">UNBEKANNT: ${cmd}</p>`;
        }
    });

    const mount = setInterval(() => {
        const p = document.querySelector('.portal-container');
        const f = document.querySelector('footer');
        if(p && f) {
            p.insertBefore(document.getElementById('terminal-input-area'), f);
            p.insertBefore(document.getElementById('back-button-global'), f);
            clearInterval(mount);
        }
    }, 100);
})();


/* ==== next block ==== */


    const header = document.querySelector('header');
    const xpElement = document.getElementById('xp-leiste-auto');
    if (header && xpElement) {
        header.parentNode.insertBefore(xpElement, header.nextSibling);
    }


/* ==== next block ==== */


    window.activeEpoch = null;

    window.epochenDaten = [
        { id: 'steinzeit', title: 'Sektor Prime: Steinzeit', minLevel: 1, gefahr: 'Wilde Fauna', range: [8000, 13000], sfx: ' v. Chr.' },
        { id: 'bronzezeit', title: 'Sektor Beta: Bronzezeit', minLevel: 5, gefahr: 'Artefakt-Schmuggler', range: [1300, 3300], sfx: ' v. Chr.' },
        { id: 'eisenzeit', title: 'Sektor Gamma: Eisenzeit', minLevel: 10, gefahr: 'Antike Kriegsführung', range: [50, 1200], sfx: ' v. Chr.' },
        { id: 'fruehmittelalter', title: 'Sektor Delta: Frühmittelalter', minLevel: 15, gefahr: 'Dunkle Relikte', range: [400, 1000], sfx: ' n. Chr.' },
        { id: 'hochmittelalter', title: 'Sektor Epsilon: Hochmittelalter', minLevel: 20, gefahr: 'Temporale Schismen', range: [1000, 1250], sfx: ' n. Chr.' },
        { id: 'spaetmittelalter', title: 'Sektor Zeta: Spätmittelalter', minLevel: 25, gefahr: 'Inquisition', range: [1250, 1500], sfx: ' n. Chr.' },
        { id: 'kolonialzeit', title: 'Sektor Eta: Kolonialzeit', minLevel: 30, gefahr: 'Entdecker-Paradoxien', range: [1500, 1800], sfx: ' n. Chr.' },
        { id: 'industriezeitalter', title: 'Sektor Theta: Industriezeitalter', minLevel: 35, gefahr: 'Smog-Anomalien', range: [1800, 1890], sfx: ' n. Chr.' },
        { id: 'jahrhundertwende', title: 'Sektor Iota: Jahrhundertwende', minLevel: 40, gefahr: 'Tech-Schmuggel', range: [1890, 1914], sfx: ' n. Chr.' },
        { id: 'moderne', title: 'Sektor Kappa: Moderne', minLevel: 50, gefahr: 'Zeitschleifen', range: [1920, 1950], sfx: ' n. Chr.' },
        { id: 'postmoderne', title: 'Sektor Lambda: Postmoderne', minLevel: 60, gefahr: 'Spionage-Paradoxien', range: [1960, 1989], sfx: ' n. Chr.' },
        { id: 'gegenwart', title: 'Sektor My: Gegenwart', minLevel: 70, gefahr: 'KI-Singularität', range: [1990, 2026], sfx: ' n. Chr.' },
        { id: 'dasmorgen', title: 'Sektor Ny: Das Morgen', minLevel: 80, gefahr: 'Fusions-Lecks', range: [2030, 2090], sfx: ' n. Chr.' },
        { id: 'zukunft', title: 'Sektor Xi: Zukunft', minLevel: 95, gefahr: 'Raum-Zeit-Faltung', range: [2100, 2300], sfx: ' n. Chr.' },
        { id: 'ozeanische_zukunft', title: 'Sektor Omicron: Ozeanische Zukunft', minLevel: 110, gefahr: 'Tiefsee-Paradoxien', range: [2300, 2500], sfx: ' n. Chr.' },
        { id: 'virtuelle_zukunft', title: 'Sektor Sigma: Virtuelle Zukunft', minLevel: 125, gefahr: 'Glitch-Anomalien', range: [2500, 2700], sfx: ' n. Chr.' },
        { id: 'mars_zeitalter', title: 'Sektor Ares: Mars', minLevel: 140, gefahr: 'Vakuum-Lecks', range: [2700, 2900], sfx: ' n. Chr.' },
        { id: 'venus_zeitalter', title: 'Sektor Phosphorus: Venus', minLevel: 170, gefahr: 'Säureregen', range: [3100, 3300], sfx: ' n. Chr.' },
        { id: 'jupiter_zeitalter', title: 'Sektor Galilei: Jupitermond', minLevel: 185, gefahr: 'Strahlungs-Echos', range: [3300, 3500], sfx: ' n. Chr.' },
        { id: 'titan_zeitalter', title: 'Sektor Rhea: Titan', minLevel: 205, gefahr: 'Methan-Stürme', range: [3500, 3700], sfx: ' n. Chr.' },
        { id: 'space_hub', title: 'Sektor Omega: Weltraumbasis', minLevel: 250, gefahr: 'Realitäts-Kollaps', range: [4000, 9999], sfx: ' n. Chr.' }
    ];

    window.renderEpochen = function() {
        if (typeof triggerScan === 'function') triggerScan();
        let html = '<h3>Zeit Stränge</h3><div style="max-height: 380px; overflow-y: auto; padding-right: 5px;">';
        let currentLevel = window.playerLevel || 1;

        window.epochenDaten.forEach(ep => {
            let levelOk = (currentLevel >= ep.minLevel);
            let isAktiv = (window.activeEpoch === ep.id);
            
            let color = levelOk ? (ep.minLevel < 60 ? '#0f8' : (ep.minLevel < 140 ? '#08f' : (ep.minLevel < 250 ? '#f80' : '#b0f'))) : '#555';
            let bg = isAktiv ? 'rgba(0, 255, 204, 0.15)' : 'rgba(255, 255, 255, 0.03)';
            
            html += `
                <div onclick="${levelOk ? `selectEpoch('${ep.id}')` : ''}" style="
                    border: 1px solid ${levelOk ? color : '#333'};
                    background: ${bg};
                    margin-bottom: 8px; padding: 10px; border-radius: 4px;
                    cursor: ${levelOk ? 'pointer' : 'not-allowed'};
                    opacity: ${levelOk ? 1 : 0.5};
                    text-align: left; position: relative;">
                    <div style="font-size: 0.85em; color: ${color}; font-weight: bold;">${ep.title}</div>
                    <div style="font-size: 0.7em; color: #aaa;">${levelOk ? ep.gefahr : `ZUGRIFF AB LVL ${ep.minLevel}`}</div>
                    ${isAktiv ? '<div style="position:absolute; right:10px; top:10px; color:#0f8; font-size:0.6em; font-weight:bold;">[ AKTIV ]</div>' : ''}
                </div>`;
        });

        html += '</div><hr><button onclick="f_start()">Zurück</button>';
        document.getElementById('content-body').innerHTML = html;
    };

    window.selectEpoch = function(id) {
        window.activeEpoch = id;
        if (typeof playBeep === 'function') playBeep(1000, 0.05);
        renderEpochen();
    };


/* ==== next block ==== */


    window.adminMerkerAktiv = window.adminMerkerAktiv || false;

    const canvas = document.getElementById('matrix-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$+-*/=%#&@<>πΩ";
    const fontSize = 16;
    const columns = canvas.width / fontSize;
    const drops = Array(Math.floor(columns)).fill(1);

    function drawMatrix() {
        ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#0f8";
        ctx.font = fontSize + "px monospace";
        for (let i = 0; i < drops.length; i++) {
            const text = characters.charAt(Math.floor(Math.random() * characters.length));
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);
            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
        }
    }
    let matrixInterval = setInterval(drawMatrix, 35);

    window.f_start = function() {
        if (typeof triggerScan === 'function') triggerScan();
        if (window.isAgentVerified) {
            window.loadProgress();
            localStorage.setItem('flux_last_agent', window.agentName);
        }
        
        let begruessung = `<p style="font-size: 0.9em; margin-bottom: 15px;">Willkommen zurück, Agent ${window.agentName}.</p>`;
        
        if (window.adminMerkerAktiv) {
            begruessung = `<div style="color: #ff8800; font-weight: bold; font-size: 1.1em; margin-bottom: 15px; text-shadow: 0 0 10px #ff8800; border: 1px dashed #ff8800; padding: 10px;">[ ADMINISTRATOR EINGELOGGT ]<br><span style="font-size: 0.8em; color: #0f8; text-shadow: none; font-weight: normal;">Systemzugriff gewährt.</span></div>`;
        }

        const logs = currentLogs || [];
        
        if (window.isAgentVerified) {
            document.getElementById('content-body').innerHTML = `
                <h2>Zentral-Terminal</h2>
                ${begruessung}
                <div style="margin-top: 10px; border-top: 1px solid var(--neon-color); padding-top: 10px;">
                    <div style="font-size: 0.6em; text-align: left; opacity: 0.6; margin-bottom: 5px;">PROTOKOLLE:</div>
                    <div id="log-display" style="max-height: 80px; overflow-y: auto;">
                        ${logs.map(l => `<div class="log-entry">${l}</div>`).join('')}
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 15px;">
                    <button class="mission-master-btn" style="margin: 0; padding: 10px; font-size: 1em;" onclick="window.showMissionMenu()">MISSIONEN</button>
                    <button class="mission-master-btn" style="margin: 0; padding: 10px; font-size: 1em; border-color: #8844ff; color: #8844ff; box-shadow: 0 0 15px rgba(136, 68, 255, 0.2), inset 0 0 10px rgba(136, 68, 255, 0.1); text-shadow: 0 0 10px #8844ff;" onmouseover="this.style.background='#8844ff'; this.style.color='#000'; this.style.textShadow='none'; this.style.boxShadow='0 0 25px #8844ff';" onmouseout="this.style.background='rgba(0, 255, 204, 0.05)'; this.style.color='#8844ff'; this.style.textShadow='0 0 10px #8844ff'; this.style.boxShadow='0 0 15px rgba(136, 68, 255, 0.2), inset 0 0 10px rgba(136, 68, 255, 0.1)';" onclick="window.location.href='base.html'">AGENTUR-BASIS</button>
                </div>`;
        } else {
            document.getElementById('content-body').innerHTML = `
                <h2>Zentral-Terminal</h2>
                <p style="font-size: 0.9em; margin-bottom: 30px;">Identität wird geprüft...</p>`;
        }
    };

    window.addEventListener('load', async () => {
        const startupLayer = document.getElementById('startup-layer');
        const bootContainer = document.getElementById('startup-boot-container');
        const setupContainer = document.getElementById('startup-setup-container');
        const barFill = document.getElementById('startup-bar-fill');
        const statusText = document.getElementById('startup-status');

        // Auf die ECHTE, von Firebase verifizierte Session warten (nicht auf localStorage).
        const fbUser = await window.fbAuthReady;
        if (fbUser) {
            window.agentName = fbUser.displayName || (fbUser.email || '').split('@')[0];
            window.isAgentVerified = true;
            try {
                const agentRef = window.doc(window.db, "agenten", window.agentSlug(window.agentName));
                const snap = await window.getDoc(agentRef);
                window.adminMerkerAktiv = snap.exists() && !!snap.data().isAdmin;
            } catch (e) { window.adminMerkerAktiv = false; }

            clearInterval(matrixInterval);
            startupLayer.style.display = "none";
            window.f_start();
            return;
        }

        setTimeout(() => {
            barFill.style.transition = "width 0.4s ease-out";
            const bootSteps = [
                { text: "Lade Kernel-Module...", w: "15%", t: 0, glitch: false },
                { text: "Synchronisiere Zeit-Relais...", w: "35%", t: 1500, glitch: false },
                { text: "FLUX-KONDENSATOR AKTIVIERT", w: "55%", t: 3000, glitch: true }, 
                { text: "FLUX-KONDENSATOR ÜBERLASTET...", w: "75%", t: 4500, glitch: true },
                { text: "Matrix stabilisiert. Zugriffsbereit.", w: "100%", t: 6500, glitch: false }
            ];

            bootSteps.forEach(step => {
                setTimeout(() => {
                    statusText.innerText = step.text;
                    barFill.style.width = step.w;
                    if (step.glitch) startupLayer.classList.add('flicker-active');
                    else startupLayer.classList.remove('flicker-active');
                }, step.t);
            });

            setTimeout(() => {
                bootContainer.style.display = "none";
                setupContainer.style.display = "flex";
            }, 8000);
        }, 1000);
    });

window.activateFullscreen = function() {
    const elem = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) return; // schon aktiv
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => console.log(err));
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
    }
};

// Vollbild bei JEDER Nutzer-Interaktion erneut anfordern, nicht nur einmalig beim Login.
// WICHTIG (bitte lesen): Safari auf dem iPhone unterstützt die Fullscreen-API für normale
// Webseiten grundsätzlich NICHT - das ist eine Plattform-Einschränkung von Apple, kein Bug
// in diesem Code. Dieser Re-Trigger hilft auf Android/Desktop zuverlässig. Für echtes,
// dauerhaftes Vollbild auf dem iPhone: Seite über "Teilen -> Zum Home-Bildschirm" hinzufügen
// und darüber starten - das öffnet die Seite chrome-los im eigenen Fenster (dank der
// apple-mobile-web-app-capable-Meta-Tags im <head>).
document.addEventListener('click', () => {
    if (window.isAgentVerified) window.activateFullscreen();
}, { capture: true });


/* ==== next block ==== */


    const agbText = `
        <b>§1 Geltungsbereich</b><br>
        Mit der Registrierung und der Verifizierung der Agenten-ID tritt dieser Kodex in Kraft. Das Terminal dient der Simulation von Zeitreise-Szenarien sowie der verschlüsselten Kommunikation zwischen autorisierten Agenten.<br><br>
        
        <b>§2 Datenerhebung und technische Speicherung</b><br>
        Zur Gewährleistung der Synchronisation innerhalb der Zeitlinie werden folgende Daten auf dem Zentral-Server (Cloud-Datenbank) sowie lokal auf dem Endgerät verarbeitet:<br>
        1. Profil-Daten: Agenten-Name, verschlüsseltes Passwort sowie der aktuelle Fortschritt (XP und Level).<br>
        2. Einsatz-Statistiken: Erreichte Rekordwerte (Highscores) in den spezifischen Flux-Modulen.<br>
        3. Technische Metadaten: Der Zeitpunkt der letzten Aktivität (lastSeen) sowie regelmäßige Radar-Pings zur Anzeige der Online-Präsenz.<br>
        4. Standort-Uplink: Zur Sektor-Zuweisung und administrativen Übersicht wird der ungefähre Standort (Land, Region, Stadt) basierend auf der IP-Adresse erfasst.<br>
        5. Präferenz-Daten: Individuelle Systemeinstellungen wie Hintergrundmusik und akustische Signale.<br>
        6. Kommunikations-Logbuch: Alle im „Komm-Link" gesendeten Nachrichten inklusive Absenderkennung und Zeitstempel.<br><br>
        
        <b>§3 Haftungsausschluss (Totalausschluss)</b><br>
        Die Administration übernimmt keinerlei Haftung für Schäden, die aus der Nutzung des Terminals resultieren. Dies schließt den Verlust von Daten (XP, Level, Fortschritt) ebenso ein wie technische Defekte oder temporale Paradoxa. Jegliche rechtliche Inanspruchnahme oder Anklage gegen die Administration ist ausdrücklich und vollumfänglich ausgeschlossen. Die Nutzung erfolgt auf eigenes Risiko und unter Verzicht auf jegliche Regressansprüche.<br><br>
        
        <b>§4 Selbstbestimmung und Profillöschung</b><br>
        Jeder Agent behält die Kontrolle über seine Daten:<br>
        - Kanal-Reinigung: Kommunikationsverläufe können manuell im Komm-Link-Menü aus dem Zentral-Server gelöscht werden.<br>
        - Profil-Terminierung: Über das Einstellungs-Menü kann das gesamte Agenten-Profil inklusive aller Einträge auf dem Zentral-Server jederzeit unwiderruflich und ohne Rücksprache gelöscht werden.
    `;

    window.f_showAuthMain = function() {
        document.getElementById('auth-form-container').style.display = 'none';
        document.getElementById('auth-main-menu').style.display = 'flex';
    };

    window.f_renderLogin = function() {
        document.getElementById('auth-main-menu').style.display = 'none';
        const form = document.getElementById('auth-form-container');
        form.style.display = 'flex';
        form.innerHTML = `
            <div style="font-size: 16px; font-weight: bold; color: #0f8; margin-bottom: 15px; text-align: center;">[ LOGIN ]</div>
            <input type="text" id="auth-name" placeholder="AGENTEN-ID..." style="padding: 10px; background: #000; border: 1px solid #0f8; color: #0f8; margin-bottom: 10px; text-transform: uppercase; outline: none; font-family: monospace;">
            <input type="password" id="auth-pass" placeholder="PASSWORT..." style="padding: 10px; background: #000; border: 1px solid #0f8; color: #0f8; margin-bottom: 10px; outline: none; font-family: monospace;">
            <button class="setup-btn" style="background: transparent; color: #0af; border: none; font-size: 0.7em; padding: 0; margin-bottom: 15px; text-align: right; align-self: flex-end;" onclick="window.f_forgotPassword()">Passwort vergessen?</button>
            <div id="auth-error" style="color: #f44; font-size: 0.8em; margin-bottom: 10px; text-align: center; height: 15px;"></div>
            <button class="setup-btn" onclick="window.f_executeLogin()">VERIFIZIEREN</button>
            <button class="setup-btn" style="background: transparent; color: #aaa; border: none; margin-top: 10px; font-size: 0.8em;" onclick="window.f_showAuthMain()"><< ZURÜCK</button>
        `;
    };

    window.f_renderRegister = function() {
        document.getElementById('auth-main-menu').style.display = 'none';
        const form = document.getElementById('auth-form-container');
        form.style.display = 'flex';
        form.innerHTML = `
            <div style="font-size: 16px; font-weight: bold; color: #ffaa00; margin-bottom: 15px; text-align: center;">[ REKRUTIERUNG ]</div>
            <input type="text" id="auth-name" placeholder="NEUE AGENTEN-ID..." style="padding: 10px; background: #000; border: 1px solid #ffaa00; color: #ffaa00; margin-bottom: 10px; text-transform: uppercase; outline: none; font-family: monospace;">
            <input type="email" id="auth-email" placeholder="E-MAIL (für Passwort-Wiederherstellung)..." style="padding: 10px; background: #000; border: 1px solid #ffaa00; color: #ffaa00; margin-bottom: 10px; outline: none; font-family: monospace;">
            <input type="password" id="auth-pass" placeholder="PASSWORT WÄHLEN..." style="padding: 10px; background: #000; border: 1px solid #ffaa00; color: #ffaa00; margin-bottom: 10px; outline: none; font-family: monospace;">
            
            <button class="setup-btn" style="background: rgba(0,255,204,0.1); border: 1px dashed #0f8; color: #0f8; font-size: 0.7em; padding: 5px; margin-bottom: 10px;" onclick="window.f_showAGB()">KODEX LESEN</button>
            
            <label style="display: flex; align-items: flex-start; gap: 10px; font-size: 0.7em; color: #aaa; margin-bottom: 15px; cursor: pointer; text-align: left;">
                <input type="checkbox" id="auth-agb" style="margin-top: 2px;">
                <span>Ich akzeptiere den Agentur-Kodex und den Haftungsausschluss.</span>
            </label>

            <div id="auth-error" style="color: #f44; font-size: 0.8em; margin-bottom: 10px; text-align: center; height: 15px;"></div>
            <button class="setup-btn" style="background: #ffaa00; border-color: #ffaa00;" onclick="window.f_executeRegister()">REGISTRIEREN</button>
            <button class="setup-btn" style="background: transparent; color: #aaa; border: none; margin-top: 10px; font-size: 0.8em;" onclick="window.f_showAuthMain()"><< ZURÜCK</button>
        `;
    };

    window.f_showAGB = function() {
        document.getElementById('agb-text-content').innerHTML = agbText;
        document.getElementById('agb-modal').style.display = 'flex';
    };

    window.f_forgotPassword = async function() {
        const nameInput = (document.getElementById('auth-name').value || '').trim();
        const errDiv = document.getElementById('auth-error');
        if (!nameInput) { errDiv.style.color = "#f44"; errDiv.innerText = "Bitte zuerst Agenten-ID eingeben."; return; }
        if (!window.db || !window.auth) { errDiv.style.color = "#f44"; errDiv.innerText = "Datenbank offline!"; return; }

        errDiv.style.color = "#0f8"; errDiv.innerText = "Suche hinterlegte E-Mail...";
        const slug = window.agentSlug(nameInput);

        try {
            const lookupSnap = await window.getDoc(window.doc(window.db, "login_lookup", slug));
            if (!lookupSnap.exists() || !lookupSnap.data().email) {
                errDiv.style.color = "#f44";
                errDiv.innerText = "Für dieses Konto ist keine E-Mail hinterlegt (altes Konto von vor dem Update).";
                return;
            }
            const email = lookupSnap.data().email;
            await window.fbSendPasswordResetEmail(window.auth, email);
            errDiv.style.color = "#0f8";
            errDiv.innerText = "E-Mail verschickt! Bitte Posteingang (auch Spam) prüfen.";
        } catch (e) {
            errDiv.style.color = "#f44";
            errDiv.innerText = "Fehler: " + (e.code || e.message || "unbekannt");
        }
    };

    window.f_executeLogin = async function() {
        const nameInput = document.getElementById('auth-name').value.trim();
        const passInput = document.getElementById('auth-pass').value;
        const errDiv = document.getElementById('auth-error');
        
        if(nameInput === "" || passInput === "") { errDiv.innerText = "Daten unvollständig!"; return; }
        errDiv.style.color = "#0f8"; errDiv.innerText = "Verifiziere Uplink...";

        if (!window.db || !window.auth) { errDiv.style.color = "#f44"; errDiv.innerText = "Datenbank offline!"; return; }

        const slug = window.agentSlug(nameInput);
        let email = window.agentNameToEmail(nameInput); // Fallback für alte Konten ohne echte E-Mail
        try {
            const lookupSnap = await window.getDoc(window.doc(window.db, "login_lookup", slug));
            if (lookupSnap.exists() && lookupSnap.data().email) email = lookupSnap.data().email;
        } catch(e) {}

        try {
            await window.fbSignIn(window.auth, email, passInput);
            // Hinweis: Sehr alte Accounts (von vor dem Sicherheits-Update) müssen sich einmalig
            // neu registrieren - eine automatische Migration würde einen unauthentifizierten
            // Lesezugriff auf "agenten" erfordern, den die Security Rules bewusst verbieten.

            if (window.auth.currentUser && window.auth.currentUser.displayName !== nameInput) {
                try { await window.fbUpdateProfile(window.auth.currentUser, { displayName: nameInput }); } catch(e) {}
            }

            const agentRef = window.doc(window.db, "agenten", window.agentSlug(nameInput));
            const docSnap = await window.getDoc(agentRef);
            const data = docSnap.exists() ? docSnap.data() : {};

            window.agentName = nameInput;
            window.isAgentVerified = true;
            window.adminMerkerAktiv = !!data.isAdmin;
            
            if (typeof window.activateFullscreen === 'function') window.activateFullscreen();
            try { await window.loadProgress(); } catch(e) {}
            
            document.getElementById('startup-layer').style.opacity = "0";
            setTimeout(() => { 
                document.getElementById('startup-layer').style.display = "none"; 
                window.f_start();
            }, 500);

        } catch (e) {
            errDiv.style.color = "#f44";
            errDiv.innerText = (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') ? "Passwort inkorrekt!" : (e.code === 'auth/user-not-found' ? "Agenten-ID unbekannt!" : "Fehler: " + (e.code || e.message || "unbekannt"));
        }
    };

    window.f_executeRegister = async function() {
        const nameInput = document.getElementById('auth-name').value.trim();
        const emailInput = document.getElementById('auth-email').value.trim();
        const passInput = document.getElementById('auth-pass').value;
        const agbCheck = document.getElementById('auth-agb').checked;
        const errDiv = document.getElementById('auth-error');
        
        if(nameInput === "" || emailInput === "" || passInput === "") { errDiv.innerText = "Daten unvollständig!"; return; }
        if(!agbCheck) { errDiv.innerText = "Kodex muss akzeptiert werden!"; return; }
        
        errDiv.style.color = "#0f8"; errDiv.innerText = "Prüfe Zentral-Server...";

        if (!window.db || !window.auth) { errDiv.style.color = "#f44"; errDiv.innerText = "Datenbank offline!"; return; }

        try {
            // WICHTIG: Die echte E-Mail wird jetzt direkt als Konto-E-Mail verwendet (nicht mehr
            // die erfundene "@agenten.flux-terminal.local"-Adresse) - nur so kann Firebase später
            // den normalen "Passwort vergessen"-Link tatsächlich zustellen.
            const cred = await window.fbCreateUser(window.auth, emailInput, passInput);
            // Ab hier ist der Nutzer authentifiziert - Firestore-Zugriff ist jetzt erlaubt.
            try { await window.fbUpdateProfile(cred.user, { displayName: nameInput }); } catch(e) {}

            const slug = window.agentSlug(nameInput);
            const agentRef = window.doc(window.db, "agenten", slug);
            window.playerXP = 0;
            window.playerLevel = 1;
            window.agentName = nameInput;
            window.isAgentVerified = true;
            window.adminMerkerAktiv = false; // Admin-Rechte werden NIE beim Registrieren vergeben, sondern nur manuell in der Firestore-Konsole gesetzt.

            const newData = {
                registered: true,
                agb_bestaetigt: true,
                xp: window.playerXP,
                lvl: window.playerLevel,
                isAdmin: false
            };
            // WICHTIG: Dieser Schreibvorgang wird NICHT mehr stillschweigend verschluckt.
            // Schlägt er fehl (z.B. durch die Firestore Security Rules), gilt die Registrierung
            // als fehlgeschlagen - sonst hätte man einen Auth-Account ohne Profil-Dokument.
            await window.setDoc(agentRef, newData, { merge: true });

            // Login-Lookup: erlaubt künftigen Logins/Passwort-Resets, aus der Agenten-ID die
            // tatsächliche Konto-E-Mail zu ermitteln (muss vor dem Einloggen lesbar sein).
            try {
                await window.setDoc(window.doc(window.db, "login_lookup", slug), { email: emailInput }, { merge: true });
            } catch(e) { console.error("Login-Lookup Speicherfehler:", e); }

            if (typeof window.activateFullscreen === 'function') window.activateFullscreen();
            
            document.getElementById('startup-layer').style.opacity = "0";
            setTimeout(() => { 
                document.getElementById('startup-layer').style.display = "none"; 
                if (typeof window.f_desc_choice === 'function') window.f_desc_choice();
                else window.f_start();
            }, 500);

        } catch (e) {
            console.error("Registrierungsfehler:", e);
            errDiv.style.color = "#f44";
            errDiv.innerText = (e.code === 'auth/email-already-in-use') ? "Agenten-ID bereits vergeben!" : (e.code === 'auth/weak-password' ? "Passwort zu schwach (min. 6 Zeichen)!" : "Fehler: " + (e.code || e.message || "unbekannt"));
        }
    };

    window.deleteAgentProfile = function() {
        if (typeof triggerScan === 'function') triggerScan();
        
        document.getElementById('content-body').innerHTML = `
            <h3 style="color: #f44; text-shadow: 0 0 10px #f44;">[ KRITISCHE WARNUNG ]</h3>
            <p style="color: #ff8800; font-size: 0.9em; margin-bottom: 20px;">Willst du dein Profil wirklich endgültig löschen?</p>
            <button class="modell-btn" style="background: rgba(255, 68, 68, 0.1); border-color: #f44; color: #f44;" onclick="window.delProfileStep2()">JA, PROFIL LÖSCHEN</button>
            <button class="modell-btn" onclick="window.f_einstellungen()">ABBRECHEN</button>
        `;
    };

    window.delProfileStep2 = function() {
        if (typeof triggerScan === 'function') triggerScan();
        
        const anzeige = document.getElementById('anzeige');
        anzeige.classList.add('flicker-active');
        
        setTimeout(() => {
            anzeige.classList.remove('flicker-active');
            document.getElementById('content-body').innerHTML = `
                <h3 style="color: #f44; font-size: 1.5em; text-shadow: 0 0 15px #f44;">[ SYSTEM-WARNUNG ]</h3>
                <p style="color: #f44; font-weight: bold; margin-bottom: 20px;">WILLST DU DEINEN ACCOUNT WIRKLICH WIRKLICH WIRKLICH LÖSCHEN?</p>
                <button class="modell-btn" style="background: #f44; color: #000; font-weight: bold;" onclick="window.delProfileStep3()">JA, UNWIDERRUFLICH LÖSCHEN</button>
                <button class="modell-btn" onclick="window.f_einstellungen()">ABBRECHEN</button>
            `;
        }, 600);
    };

    window.delProfileStep3 = function() {
        if (typeof triggerScan === 'function') triggerScan();
        document.getElementById('content-body').innerHTML = `
            <h3 style="color: #f44;">[ AUTORISIERUNG ]</h3>
            <p style="color: #aaa; font-size: 0.8em; margin-bottom: 15px;">Zur finalen Terminierung Passwort eingeben:</p>
            <input type="password" id="term-pass" placeholder="PASSWORT..." style="width: 80%; padding: 10px; background: #000; border: 1px solid #f44; color: #f44; margin-bottom: 15px; outline: none; font-family: monospace; text-align: center;">
            <div id="term-error" style="color: #f44; font-size: 0.8em; margin-bottom: 10px; height: 15px;"></div>
            <button class="modell-btn" style="border-color: #f44; color: #f44;" onclick="window.delProfileExecute()">BESTÄTIGEN</button>
            <button class="modell-btn" onclick="window.f_einstellungen()">ABBRECHEN</button>
        `;
    };

    window.delProfileExecute = async function() {
        const myName = window.agentName;
        const passInput = document.getElementById('term-pass').value;
        const errDiv = document.getElementById('term-error');
        
        if(!myName || !passInput) { errDiv.innerText = "PASSWORT ERFORDERLICH!"; return; }
        errDiv.innerText = "VERIFIZIERE...";

        try {
            const user = window.auth.currentUser;
            if (!user) { errDiv.innerText = "KEINE AKTIVE SITZUNG."; return; }

            const cred = window.fbEmailAuthProvider.credential(user.email, passInput);
            await window.fbReauthenticate(user, cred); // wirft bei falschem Passwort

            const agentRef = window.doc(window.db, "agenten", window.agentSlug(myName));
            await window.deleteDoc(agentRef);
            await window.fbDeleteUser(user);

            localStorage.removeItem('flux_agent_' + myName.toLowerCase());
            localStorage.removeItem('flux_last_agent');
            localStorage.removeItem('flux_music_' + myName.toLowerCase());
            localStorage.removeItem('flux_sound_' + myName.toLowerCase());

            document.getElementById('content-body').innerHTML = `<h3 style="color: #f44;">[ PROFIL VERNICHTET ]</h3><p>System startet neu...</p>`;
            setTimeout(() => location.reload(), 2000);
        } catch (e) {
            errDiv.innerText = (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') ? "ZUGRIFF VERWEIGERT: PASSWORT INKORREKT." : "SERVER-FEHLER. UPLINK INSTABIL.";
        }
    };


/* ==== next block ==== */


    window.startMinigame = function(modell) {
        if (typeof triggerScan === 'function') triggerScan();

        let mode = 1; 
        let xpPlus = 1, xpMinus = 2, portalXP = 3;
        let startSpeed = 2.0;
        let penaltyDeathXP = 5; 

        if (modell.includes('3000')) {
            mode = 2; xpPlus = 10; xpMinus = 15; portalXP = 20;
            startSpeed = 3.0; penaltyDeathXP = 10;
        } else if (modell.includes('4400')) {
            mode = 3; xpPlus = 20; xpMinus = 30; portalXP = 30;
            startSpeed = 4.0; penaltyDeathXP = 20;
        }

        document.getElementById('content-body').innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 0.75em; margin-bottom: 5px; color: #0f8; font-family: monospace;">
                <span>Modul: ${modell}</span>
                <span id="mg-score" style="color: #ffcc00; font-weight: bold; text-shadow: 0 0 5px #ffcc00;">Score: 0</span>
                <span id="mg-status" style="font-weight: bold;">System stabil</span>
            </div>
            <div id="game-container" style="position: relative; width: 100%; height: 450px; background: #000; border: 2px solid var(--neon-color); overflow: hidden; border-radius: 4px; touch-action: none;">
                <canvas id="minigame-canvas" style="display: block; width: 100%; height: 100%;"></canvas>
                <div id="mg-date-display" style="position: absolute; top: 10px; left: 10px; color: #fff; font-size: 12px; font-weight: bold; pointer-events: none; text-shadow: 0 0 5px #000;">Aktuelle Zeitlinie</div>
            </div>
            <button id="mg-action-btn" style="margin-top: 15px; border-color: #f44; color: #f44; background: rgba(255,0,0,0.1);" onclick="stopMinigame()">Flug Beenden & XP sichern</button>
        `;

        const canvas = document.getElementById('minigame-canvas');
        const ctx = canvas.getContext('2d');
        const container = document.getElementById('game-container');
        const actionBtn = document.getElementById('mg-action-btn');
        
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        let gameActive = true;
        let speed = startSpeed;
        let targetSpeed = startSpeed; 
        let shipX = canvas.width / 2;
        const shipW = 20;
        const shipH = 30;

        let objects = [];
        let frameCount = 0;
        let distanceTraveled = 0;
        let totalScore = 0; 
        const portalInterval = 3000; 
        let postPortalGrace = 0; 
        let themeHue = mode === 1 ? 120 : (mode === 2 ? 200 : 280);

        function moveShip(x) {
            shipX = Math.max(shipW, Math.min(canvas.width - shipW, x));
        }

        canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            moveShip(e.touches[0].clientX - rect.left);
        }, {passive: false});

        canvas.addEventListener('mousemove', e => {
            const rect = canvas.getBoundingClientRect();
            moveShip(e.clientX - rect.left);
        });

        function generateDate() {
            let r = Math.random();
            if (mode === 1) return Math.floor(Math.random() * (2350 - 1750 + 1)) + 1750 + " n. Chr.";
            if (mode === 2) return r < 0.5 ? Math.floor(Math.random() * 1750) + " n. Chr." : Math.floor(Math.random() * (4000 - 2351 + 1)) + 2351 + " n. Chr.";
            return r < 0.5 ? Math.floor(Math.random() * 5000) + 1 + " v. Chr." : Math.floor(Math.random() * 5999) + 4001 + " n. Chr.";
        }

        function triggerGlitch() {
            container.classList.remove('glitch-retro', 'glitch-cyber', 'glitch-warp');
            void container.offsetWidth; 
            if (mode === 1) container.classList.add('glitch-retro');
            else if (mode === 2) container.classList.add('glitch-cyber');
            else container.classList.add('glitch-warp');
            if (typeof playBeep === 'function') playBeep(1200, 0.1);
        }

        function saveHighscore() {
            let finalScore = Math.floor(totalScore);
            let isNewHigh = false;
            
            if (mode === 1 && finalScore > window.hs1200) { window.hs1200 = finalScore; isNewHigh = true; }
            if (mode === 2 && finalScore > window.hs3000) { window.hs3000 = finalScore; isNewHigh = true; }
            if (mode === 3 && finalScore > window.hs4400) { window.hs4400 = finalScore; isNewHigh = true; }
            
            if (isNewHigh && typeof window.saveProgress === 'function') {
                window.saveProgress(); 
            }
            return isNewHigh;
        }

        function gameOver(reason) {
            gameActive = false;
            let isNewHigh = saveHighscore();
            let finalScore = Math.floor(totalScore);

            if (typeof playBeep === 'function') playBeep(200, 0.4);
            container.style.borderColor = "#f44";
            document.getElementById('mg-status').innerText = "[ ABSTURZ ]";
            document.getElementById('mg-status').style.color = "#f44";
            
            ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            
            ctx.font = "bold 22px monospace";
            ctx.fillText("SYSTEM-AUSFALL", canvas.width/2, canvas.height/2 - 30);
            
            ctx.font = "12px monospace";
            ctx.fillText(reason, canvas.width/2, canvas.height/2 - 5);
            
            ctx.font = "bold 18px monospace";
            ctx.fillStyle = "#ffcc00";
            ctx.fillText("SCORE: " + finalScore, canvas.width/2, canvas.height/2 + 30);

            if (isNewHigh) {
                ctx.fillStyle = "#0f8";
                ctx.fillText("NEUER HIGHSCORE!", canvas.width/2, canvas.height/2 + 55);
            }
            
            actionBtn.innerText = "ZURÜCK ZUM MENÜ";
            actionBtn.style.borderColor = "#fff";
            actionBtn.style.color = "#fff";
            actionBtn.style.background = "rgba(255,255,255,0.1)";
        }

        function drawBackground() {
            if (mode === 1) {
                ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
            } else if (mode === 2) {
                ctx.fillStyle = `hsla(${themeHue}, 50%, 10%, 0.8)`; ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = `hsla(${themeHue}, 100%, 50%, 0.2)`; ctx.lineWidth = 1; ctx.beginPath();
                for(let i=0; i<canvas.width; i+=40) { ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); }
                for(let i=(frameCount*speed)%40; i<canvas.height; i+=40) { ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); }
                ctx.stroke();
            } else {
                ctx.fillStyle = `hsla(${themeHue}, 80%, 5%, 0.4)`; ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = "#fff";
                for(let i=0; i<5; i++) ctx.fillRect(Math.random()*canvas.width, Math.random()*canvas.height, 2, Math.random()*50 + 20);
            }
        }

        function drawShip(x, y) {
            ctx.save(); ctx.translate(x, y);
            if (mode === 1) { 
                ctx.strokeStyle = "#0f0"; ctx.lineWidth = 2; ctx.beginPath(); 
                ctx.moveTo(0, -shipH/2); ctx.lineTo(-shipW/2, shipH/2); ctx.lineTo(shipW/2, shipH/2); ctx.closePath(); ctx.stroke();
            } else if (mode === 2) { 
                ctx.fillStyle = "#0ff"; ctx.shadowBlur = 10; ctx.shadowColor = "#0ff"; ctx.beginPath(); 
                ctx.moveTo(0, -shipH/2); ctx.lineTo(-shipW/2, shipH/2); ctx.lineTo(shipW/2, shipH/2); ctx.fill();
                ctx.fillStyle = "#f0f"; ctx.fillRect(-4, shipH/2, 8, Math.random()*15 + 5);
            } else { 
                ctx.fillStyle = "#fff"; ctx.shadowBlur = 20; ctx.shadowColor = "#f0f"; ctx.beginPath(); 
                ctx.moveTo(0, -shipH/2 - 10); ctx.lineTo(-shipW/2 - 5, shipH/2); ctx.lineTo(shipW/2 + 5, shipH/2); ctx.fill();
                ctx.fillStyle = "#0ff"; ctx.fillRect(-6, shipH/2, 12, Math.random()*30 + 10);
            }
            ctx.restore();
        }

        function loop() {
            if (!gameActive) return;
            frameCount++;
            
            if (speed < targetSpeed) speed += 0.002; 
            
            distanceTraveled += speed;
            totalScore += (speed * 0.2); 
            
            document.getElementById('mg-score').innerText = "Score: " + Math.floor(totalScore);
            
            drawBackground();

            if (distanceTraveled >= portalInterval) {
                distanceTraveled = 0; 
                let gapW = 70; 
                let gapX = Math.random() * (canvas.width - gapW);
                objects.push({ type: 'portal', y: -30, h: 15, gapX: gapX, gapW: gapW, date: generateDate(), passed: false });
                postPortalGrace = 250; 
            } else if (distanceTraveled < portalInterval - 300) { 
                if (postPortalGrace > 0) {
                    postPortalGrace -= speed; 
                } else if (frameCount % Math.max(10, Math.floor(55 / (speed/1.5))) === 0) {
                    let r = Math.random();
                    
                    let probGood = mode === 1 ? 0.70 : (mode === 2 ? 0.64 : 0.57); 
                    
                    if (r < 0.25) { 
                        let variant = Math.floor(Math.random() * 2);
                        objects.push({ type: 'deadly', x: Math.random() * (canvas.width - 40), y: -20, w: 40, h: 20, variant: variant });
                    } else if (r < 0.35) { 
                        objects.push({ type: 'deadly_penalty', x: Math.random() * (canvas.width - 40), y: -20, w: 40, h: 20 });
                    } else if (r < probGood) { 
                        objects.push({ type: 'good', x: Math.random() * (canvas.width - 25), y: -20, w: 25, h: 25 });
                    } else { 
                        objects.push({ type: 'bad', x: Math.random() * (canvas.width - 35), y: -20, w: 35, h: 25 });
                    }
                }
            }

            let shipBox = { x: shipX - shipW/2, y: canvas.height - 40 - shipH/2, w: shipW, h: shipH };

            for (let i = objects.length - 1; i >= 0; i--) {
                let obj = objects[i];
                obj.y += speed;

                if (obj.type === 'portal') {
                    ctx.fillStyle = "#555"; 
                    ctx.fillRect(0, obj.y, obj.gapX, obj.h); 
                    ctx.fillRect(obj.gapX + obj.gapW, obj.y, canvas.width - (obj.gapX + obj.gapW), obj.h); 
                    
                    ctx.fillStyle = `hsla(${frameCount%360}, 100%, 60%, 0.9)`;
                    ctx.fillRect(obj.gapX, obj.y, obj.gapW, obj.h);
                    
                    ctx.fillStyle = "#fff"; ctx.font = "12px monospace"; ctx.textAlign = "left";
                    ctx.fillText("ZIEL: " + obj.date, 5, obj.y - 5);

                    if (obj.y < shipBox.y + shipBox.h && obj.y + obj.h > shipBox.y) {
                        if (shipBox.x < obj.gapX || shipBox.x + shipBox.w > obj.gapX + obj.gapW) {
                            gameOver("Kollision mit Barriere");
                            return;
                        } else if (!obj.passed) {
                            obj.passed = true;
                            triggerGlitch();
                            themeHue = Math.random() * 360;
                            document.getElementById('mg-date-display').innerText = "Vektor: " + obj.date;
                            
                            targetSpeed += 0.8; 
                            
                            if (typeof window.updateXP === 'function') window.updateXP(portalXP);
                            const statusEl = document.getElementById('mg-status');
                            statusEl.innerText = `+${portalXP} XP!`;
                            statusEl.style.color = "#0f8";
                        }
                    }
                } else {
                    if (obj.type === 'deadly') {
                        if (obj.variant === 0) {
                            ctx.fillStyle = "#fff"; ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
                            ctx.strokeStyle = "#f00"; ctx.lineWidth = 3; ctx.beginPath();
                            ctx.moveTo(obj.x, obj.y); ctx.lineTo(obj.x + obj.w, obj.y + obj.h);
                            ctx.moveTo(obj.x + obj.w, obj.y); ctx.lineTo(obj.x, obj.y + obj.h);
                            ctx.stroke();
                        } else {
                            ctx.fillStyle = "#ffcc00"; ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
                            ctx.fillStyle = "#000"; 
                            ctx.fillRect(obj.x + 5, obj.y, 5, obj.h);
                            ctx.fillRect(obj.x + 15, obj.y, 5, obj.h);
                            ctx.fillRect(obj.x + 25, obj.y, 5, obj.h);
                        }
                    } else if (obj.type === 'deadly_penalty') {
                        ctx.fillStyle = "#f0f"; ctx.shadowBlur = 15; ctx.shadowColor = "#f0f";
                        ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
                        ctx.fillStyle = "#fff"; ctx.shadowBlur = 0;
                        ctx.fillRect(obj.x + obj.w/4, obj.y + obj.h/4, obj.w/2, obj.h/2);
                    } else if (mode === 1) { 
                        ctx.strokeStyle = obj.type === 'good' ? "#0f0" : "#f44"; ctx.lineWidth = 2; ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
                    } else { 
                        ctx.fillStyle = obj.type === 'good' ? "#0f8" : "#f44"; ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle; ctx.fillRect(obj.x, obj.y, obj.w, obj.h); ctx.shadowBlur = 0;
                    }

                    if (obj.x < shipBox.x + shipBox.w && obj.x + obj.w > shipBox.x && obj.y < shipBox.y + shipBox.h && obj.y + obj.h > shipBox.y) {
                        const statusEl = document.getElementById('mg-status');
                        
                        if (obj.type === 'deadly') {
                            gameOver("Kritischer Treffer");
                            return;
                        } else if (obj.type === 'deadly_penalty') {
                            if (typeof window.updateXP === 'function') window.updateXP(-penaltyDeathXP);
                            gameOver(`Anomalie: -${penaltyDeathXP} XP!`);
                            return;
                        } else if (obj.type === 'good') {
                            if (typeof window.updateXP === 'function') window.updateXP(xpPlus);
                            if (typeof playBeep === 'function') playBeep(2000, 0.05);
                            statusEl.innerText = `+${xpPlus} XP`; statusEl.style.color = "#0f8";
                        } else if (obj.type === 'bad') {
                            if (typeof window.updateXP === 'function') window.updateXP(-xpMinus); 
                            if (typeof playBeep === 'function') playBeep(300, 0.1);
                            statusEl.innerText = `-${xpMinus} XP`; statusEl.style.color = "#f44";
                            container.style.borderColor = "#f44";
                            setTimeout(() => { container.style.borderColor = "var(--neon-color)"; }, 200);
                        }
                        objects.splice(i, 1);
                        continue;
                    }
                }
                if (obj.y > canvas.height + 50) objects.splice(i, 1);
            }

            drawShip(shipX, canvas.height - 40);
            requestAnimationFrame(loop);
        }
        
        loop();

        window.stopMinigame = function() {
            gameActive = false;
            saveHighscore(); 
            if (typeof window.f_start === 'function') window.f_start();
        };
    };


/* ==== next block ==== */


window.f_desc_choice = function() {
    if (typeof triggerScan === 'function') triggerScan();
    document.getElementById('content-body').innerHTML = `
        <h3 style="color: #0f8;">System-Einweisung</h3>
        <p style="font-size: 0.8em; margin-bottom: 25px; color: #0f8; opacity: 0.8;">Möchten Sie das Einsatz-Handbuch aufrufen?</p>
        <button class="modell-btn" onclick="window.f_showDescription(false)">Einweisung anzeigen</button>
        <button class="modell-btn" onclick="window.f_showDescription(true)">Anzeigen & Vorlesen</button>
        <button class="modell-btn" style="border-color: #f44; color: #f44;" onclick="window.f_start()">Nein, danke</button>
    `;
};

window.f_showDescription = function(withVoice) {
    if (typeof triggerScan === 'function') triggerScan();
    const txt = "System-Einweisung. Erstens: Eingabe und Missionen. Nutze das Eingabefeld am unteren Rand für alle Interaktionen. Gib mission ein, um Aufträge zu starten und XP zu sammeln. Mit log prüfst du deinen Fortschritt und help zeigt dir alle Befehle. Zweitens: Flux-Kopplung. Dieses Modul wird ab Level 5 für den Zugriff freigeschaltet. Hier steuerst du dein FLUX-Modul aktiv durch den instabilen Zeitstrom. Weiche Hindernissen aus und halte die Synchronisation aufrecht, um massive XP-Boni zu generieren. Drittens: System-Reset. Sollte der Status auf WARNUNG oder INSTABIL springen, gib sofort den Befehl flux-reset ein, um die Zeitlinie wieder zu stabilisieren. Viertens: App-Installation. Damit das Terminal als festes Werkzeug auf deinem Handy landet, wähle im Browser-Menü Zum Startbildschirm hinzufügen. So hast du jederzeit direkten Zugriff. Viel Erfolg. Ende der Übertragung.";

    if (withVoice) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(txt);
        msg.lang = 'de-DE';
        window.speechSynthesis.speak(msg);
    }

    const c = (t) => `<b style="color: #fff; font-style: italic;">${t}</b>`;

    document.getElementById('content-body').innerHTML = `
        <h3 style="color: #0f8;">Einsatz-Handbuch</h3>
        <div style="font-size: 0.9em; text-align: left; line-height: 1.6; border: 1px solid #0f8; padding: 15px; background: rgba(0,255,204,0.05); margin-bottom: 15px; max-height: 320px; overflow-y: auto; color: #0f8;">
            <p><strong>1. Eingabe & Missionen:</strong> Nutze das Eingabefeld unten. Gib ${c('mission')} für Aufträge, ${c('log')} für Fortschritt und ${c('help')} für Befehle ein.</p>
            <p><strong>2. Flux-Kopplung:</strong> Ab <b>Level 5</b> aktiv. Steuere dein FLUX-Modul aktiv durch den Zeitstrom für massive XP-Boni.</p>
            <p><strong>3. System-Reset:</strong> Bei Status WARNUNG/INSTABIL sofort ${c('flux-reset')} eingeben, um die Zeitlinie zu stabilisieren.</p>
            <p><strong>4. App-Installation:</strong> Über das Browser-Menü <b>"Zum Startbildschirm hinzufügen"</b> als App installieren.</p>
            <p style="text-align: center; margin-top: 15px; border-top: 1px solid rgba(0,255,204,0.3); padding-top: 10px;"><b>Viel Erfolg. Ende der Übertragung.</b></p>
        </div>
        <button class="modell-btn" onclick="window.speechSynthesis.cancel(); window.f_start()">Initialisierung beenden</button>
    `;
};


/* ==== next block ==== */


(function initEMPSystem() {
    let blackoutTimer;
    let taskIntervals = []; 
    let timeRemaining = 30;
    let isPaused = false;
    let currentMission = -1;
    let wasBgMusicPlaying = false; 

    const origBuchen = window.f_buchen;
    const origEpochen = window.f_epochen;
    const origStatus = window.f_status;

    function checkEMPTrigger(originalAction) {
        let lvlText = "0";
        document.querySelectorAll('div, span, p').forEach(el => {
            if(el.innerText && el.innerText.includes('LVL')) {
                lvlText = el.innerText.replace(/[^0-9]/g, '');
            }
        });

        let currentLvl = parseInt(lvlText) || window.level || window.aktuellesLevel || 0;
        
        if (currentLvl >= 5 && Math.random() <= 0.10) {
            document.getElementById('emp-trap').style.setProperty('display', 'block', 'important');
        } else {
            if (typeof originalAction === 'function') originalAction();
        }
    }

    window.f_buchen = function() { checkSystemWarningChance(); checkEMPTrigger(origBuchen); };
    window.f_epochen = function() { checkSystemWarningChance(); checkEMPTrigger(origEpochen); };
    window.f_status = function() { checkSystemWarningChance(); checkEMPTrigger(origStatus); };

    window.triggerTrap = function() {
        document.getElementById('emp-trap').style.setProperty('display', 'none', 'important');
        const bgMusic = document.getElementById('bg-music');
        if (bgMusic) { wasBgMusicPlaying = !bgMusic.paused; bgMusic.pause(); }
        const sndCrash = document.getElementById('snd-emp-crash');
        if (sndCrash) { sndCrash.currentTime = 0; sndCrash.play().catch(e => {}); }
        const sndHum = document.getElementById('snd-blackout-hum');
        if (sndHum) { sndHum.volume = 0.0; sndHum.currentTime = 0; sndHum.play().catch(e => {}); }
        document.getElementById('emp-solid-black').style.setProperty('display', 'block', 'important');
        const flash = document.getElementById('emp-flash-overlay');
        if (flash) {
            flash.style.transition = 'none'; flash.style.opacity = '1';
            flash.style.setProperty('display', 'block', 'important');
            setTimeout(() => {
                flash.style.transition = 'opacity 1.5s ease-out'; flash.style.opacity = '0';
                setTimeout(() => { flash.style.setProperty('display', 'none', 'important'); }, 1500);
            }, 50);
        }
        const bootLayer = document.getElementById('emp-boot-layer');
        bootLayer.style.setProperty('display', 'flex', 'important');
        setTimeout(() => {
            bootLayer.style.setProperty('display', 'none', 'important');
            if (sndHum) sndHum.volume = 0.6;
            window.showBlackoutMenu();
        }, 7000);
    };

    window.showBlackoutMenu = function() {
        clearAllIntervals();
        document.getElementById('blackout-layer').style.setProperty('display', 'flex', 'important');
        document.getElementById('blackout-content').innerHTML = `
            <h3 style="color:#f44; font-size:1.6em; text-shadow: 0 0 10px #f44;">[ SYSTEM-NOTSTART ]</h3>
            <p style="color:#f44; font-weight:bold; margin-bottom:20px;">EXTERNER EMP-IMPULS DETEKTIERT.</p>
            <p style="color:#aaa; font-size:0.9em; margin-bottom:30px;">Notstrom-Modus instabil. Manuelle Hardware-Synchronisation erforderlich.</p>
            <button class="modell-btn" style="border-color:#ff8800; color:#ff8800;" onclick="window.startBlackoutMission()">SYSTEM STABILISIEREN</button>
        `;
    };

    window.openHelp = function(type) {
        isPaused = true;
        const text = document.getElementById('emp-help-text');
        if (type === 'phase') text.innerHTML = "Passe die rote Welle an die grüne Zielwelle an.<br><span style='color:#0f8;'>AMPLITUDE:</span> Spannung (Höhe).<br><span style='color:#0f8;'>FREQUENZ:</span> Schwingung (Breite).";
        if (type === 'load') text.innerHTML = "Die Netzlast ist kritisch.<br>Trenne Sektoren per Klick vom Netz, um unter 100% zu kommen.<br><span style='color:#f44;'>ROT:</span> Überlebenswichtige Systeme (Absturz).<br><span style='color:#ffcc00;'>GELB:</span> Wichtige Systeme (4s Verzögerung).<br><span style='color:#0f8;'>GRÜN:</span> Unwichtige Systeme (Sofort).";
        if (type === 'ohm') text.innerHTML = "Der Messwiderstand ist defekt.<br>Stelle den Ziel-Ohm-Wert (Ω) exakt ein.";
        if (type === 'jumper') text.innerHTML = "Platine überbrücken.<br>Ziehe mit dem Finger einen Pfad vom grünen Start zum orangen Ziel.";
        document.getElementById('emp-help-modal').style.display = 'flex';
    };

    window.closeHelp = function() { document.getElementById('emp-help-modal').style.display = 'none'; isPaused = false; };

    function clearAllIntervals() {
        clearInterval(blackoutTimer);
        taskIntervals.forEach(clearInterval);
        taskIntervals = [];
    }

    window.startBlackoutMission = function() {
        clearAllIntervals();
        isPaused = false;
        document.getElementById('emp-help-modal').style.display = 'none';
        let nextMission;
        do { nextMission = Math.floor(Math.random() * 4); } while (nextMission === currentMission);
        currentMission = nextMission;
        
        if (currentMission === 1) timeRemaining = 15;
        else if (currentMission === 3) timeRemaining = 45;
        else timeRemaining = 30;

        if (currentMission === 0) renderPhaseMission();
        if (currentMission === 1) renderLoadMission();
        if (currentMission === 2) renderOhmMission();
        if (currentMission === 3) renderJumperMission();
        
        blackoutTimer = setInterval(() => {
            if (isPaused) return;
            timeRemaining--;
            const timerEl = document.getElementById('emp-timer');
            if (timerEl) {
                timerEl.innerText = `ZEIT: ${timeRemaining}s`;
                if (timeRemaining <= 5) timerEl.style.color = '#f44';
            }
            if (timeRemaining <= 0) window.failBlackout("ZEITÜBERSCHREITUNG.");
        }, 1000);
    };
    function renderPhaseMission() {
        const targetV = Math.floor(Math.random() * 50) + 20;
        const targetHz = Math.floor(Math.random() * 50) + 20;
        const content = document.getElementById('blackout-content');
        
        content.innerHTML = `
            <button class="help-btn" onclick="window.openHelp('phase')">[?]</button>
            <h3 style="color:#f44; margin-top:0;">PHASEN-SYNCHRONISATION</h3>
            <div id="emp-timer" style="font-size: 1.2em; font-weight: bold; margin-bottom: 5px;">ZEIT: ${timeRemaining}s</div>
            <canvas id="phase-canvas" width="350" height="100" style="background:#000; border:1px solid #0f8; width:100%; margin-bottom:10px;"></canvas>
            <input type="range" id="slider-v" min="10" max="90" value="50" style="width:100%; margin-bottom:10px;">
            <input type="range" id="slider-hz" min="10" max="90" value="50" style="width:100%;">
            <button id="btn-schuetz" class="modell-btn" onclick="window.checkPhase()">HAUPTSCHÜTZ EINLEGEN</button>
        `;
        
        const canvas = document.getElementById('phase-canvas'); 
        const ctx = canvas.getContext('2d');
        const sV = document.getElementById('slider-v'); 
        const sHz = document.getElementById('slider-hz');
        
        function drawWaves() {
            if (!document.getElementById('phase-canvas')) return;
            requestAnimationFrame(drawWaves); 
            if (isPaused) return;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const userV = parseInt(sV.value); 
            const userHz = parseInt(sHz.value);
            
            ctx.strokeStyle = "rgba(0, 255, 0, 0.5)"; ctx.lineWidth = 2; ctx.beginPath();
            for(let x=0; x<canvas.width; x++) { let y = 50 + Math.sin(x * (targetHz/1000) + (Date.now()/500)) * targetV; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
            ctx.stroke();
            
            ctx.strokeStyle = "#f44"; ctx.lineWidth = 2; ctx.beginPath();
            for(let x=0; x<canvas.width; x++) { let y = 50 + Math.sin(x * (userHz/1000) + (Date.now()/500)) * userV; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
            ctx.stroke();
        }
        drawWaves();

        window.checkPhase = function() {
            if (isPaused) return;
            const userV = parseInt(sV.value);
            const userHz = parseInt(sHz.value);
            
            if (Math.abs(userV - targetV) <= 3 && Math.abs(userHz - targetHz) <= 3) {
                window.successBlackout();
            } else {
                window.failBlackout("PHASEN-ASYNCHRONITÄT. KURZSCHLUSS.");
            }
        };
    }
    function renderLoadMission() {
        const sectors = [
            { name: "Kern-Kühlung (Flux)", load: Math.floor(Math.random()*10)+40, type: 'crit', a: true },
            { name: "Eindämmungsfeld", load: Math.floor(Math.random()*10)+25, type: 'crit', a: true },
            { name: "Lebenserhaltung", load: Math.floor(Math.random()*10)+15, type: 'crit', a: true },
            { name: "Nav-Computer", load: 15, type: 'warn', a: true },
            { name: "Chronos-Antrieb", load: 20, type: 'warn', a: true },
            { name: "Holo-Deck", load: 10, type: 'safe', a: true },
            { name: "Beleuchtung", load: 5, type: 'safe', a: true },
            { name: "Replikatoren", load: 7, type: 'safe', a: true },
            { name: "Funk", load: 4, type: 'safe', a: true }
        ];
        sectors.sort(() => Math.random() - 0.5);
        let targetReduction = 40; let currentLoad = 140;
        let isProcessing = false;
        const content = document.getElementById('blackout-content');

        function updateUI() {
            let html = `<button class="help-btn" onclick="window.openHelp('load')">[?]</button>
                <h3 style="color:#f44; margin-top:0;">NETZ-ÜBERLASTUNG</h3>
                <div id="emp-timer" style="font-size: 1.2em; font-weight: bold; margin-bottom: 5px;">ZEIT: ${timeRemaining}s</div>
                <div style="font-size: 1.4em; font-weight:bold; margin-bottom:5px; color:${currentLoad > 100 ? '#f44' : '#0f8'};">LAST: ${currentLoad}%</div>
                <div style="height:4px; background:#000; border:1px solid #555; margin-bottom:10px; visibility:${isProcessing ? 'visible' : 'hidden'};">
                    <div id="load-progress-bar" style="height:100%; width:0%; background:#ffcc00; transition: width 4s linear;"></div>
                </div>
                <div style="max-height:170px; overflow-y:auto;">`;
            
            sectors.forEach((s, idx) => {
                let color = s.type === 'crit' ? '#f44' : (s.type === 'warn' ? '#ffcc00' : '#0f8');
                let btnClass = s.a ? 'sector-btn' : 'sector-btn off';
                let styleStr = s.a ? `color:${color}; border-color:${color};` : ''; 
                html += `<button class="${btnClass}" style="${styleStr}" onclick="window.toggleSector(${idx})">${s.a ? '' : 'OFF - '}${s.name} [${s.load}%]</button>`;
            });
            
            const canReboot = currentLoad <= 100 && !isProcessing;
            html += `</div><button class="modell-btn" style="border-color:${canReboot ? '#0f8' : '#555'}; color:${canReboot ? '#0f8' : '#555'}; pointer-events:${canReboot ? 'auto' : 'none'};" onclick="window.checkLoadReboot()">KOPPELN</button>`;
            content.innerHTML = html;

            if (isProcessing) {
                setTimeout(() => {
                    const bar = document.getElementById('load-progress-bar');
                    if (bar) bar.style.width = '100%';
                }, 50);
            }
        }

        window.toggleSector = function(idx) {
            if (isPaused || isProcessing) return; 
            let s = sectors[idx]; 
            if (!s.a) return; 

            if (s.type === 'crit') {
                s.a = false; currentLoad -= s.load;
                window.failBlackout("KRITISCHER SEKTOR GETRENNT.");
            } else if (s.type === 'warn') {
                isProcessing = true;
                updateUI();
                
                let loadTimer = setTimeout(() => {
                    if (!isPaused && isProcessing) {
                        s.a = false; 
                        currentLoad -= s.load;
                        isProcessing = false;
                        updateUI();
                    }
                }, 4000);
                taskIntervals.push(loadTimer);
            } else {
                s.a = false; currentLoad -= s.load;
                updateUI();
            }
        };

        window.checkLoadReboot = function() { 
            if (currentLoad <= 100 && !isProcessing) window.successBlackout(); 
        };
        
        updateUI();
    }

    function renderOhmMission() {
        let targetOhm = Math.floor(Math.random() * 800) + 150;
        const content = document.getElementById('blackout-content');
        content.innerHTML = `
            <button class="help-btn" onclick="window.openHelp('ohm')">[?]</button>
            <h3 style="color:#f44; margin-top:0;">WIDERSTANDS-BRÜCKE</h3>
            <div id="emp-timer" style="font-size: 1.2em; font-weight: bold; margin-bottom: 5px;">ZEIT: ${timeRemaining}s</div>
            <div id="target-ohm-display" style="font-size: 1.8em; color:#ff8800; margin-bottom:10px;"><sup>ZIEL:</sup> ${targetOhm} Ω</div>
            <div id="current-ohm-display" style="font-size: 2.2em; font-weight:bold; color:#f44; margin-bottom:15px; background:#000; padding:10px; border:1px solid #555;">0 Ω</div>
            <input type="range" id="ohm-100" min="0" max="9" value="0" style="width:100%; margin-bottom:8px;">
            <input type="range" id="ohm-10" min="0" max="9" value="0" style="width:100%; margin-bottom:8px;">
            <input type="range" id="ohm-1" min="0" max="9" value="0" style="width:100%; margin-bottom:15px;">
            <button class="modell-btn" onclick="window.checkOhm()">KONTROLLMESSUNG</button>
        `;
        const s100 = document.getElementById('ohm-100'); const s10 = document.getElementById('ohm-10'); const s1 = document.getElementById('ohm-1');
        const display = document.getElementById('current-ohm-display'); const tDisp = document.getElementById('target-ohm-display');
        function updateOhmDisplay() {
            let base = (parseInt(s100.value) * 100) + (parseInt(s10.value) * 10) + parseInt(s1.value);
            display.innerText = `${base} Ω`;
            display.style.color = (base === targetOhm) ? '#0f8' : '#f44';
        }
        s100.oninput = updateOhmDisplay; s10.oninput = updateOhmDisplay; s1.oninput = updateOhmDisplay;
        let tDrift = setInterval(() => {
            if (isPaused) return; targetOhm += (Math.floor(Math.random() * 7) - 3);
            if (targetOhm > 999) targetOhm = 999; if (targetOhm < 100) targetOhm = 100;
            tDisp.innerHTML = `<sup>ZIEL:</sup> ${targetOhm} Ω`; updateOhmDisplay();
        }, 2000);
        taskIntervals.push(tDrift);
        window.checkOhm = function() {
            let base = (parseInt(s100.value) * 100) + (parseInt(s10.value) * 10) + parseInt(s1.value);
            if (base === targetOhm) window.successBlackout(); else window.failBlackout("FEHLKALIBRIERUNG.");
        };
    }

    function renderJumperMission() {
        const content = document.getElementById('blackout-content');
        content.innerHTML = `<button class="help-btn" onclick="window.openHelp('jumper')">[?]</button>
            <h3 style="color:#f44; margin-top:0;">PLATINE ÜBERBRÜCKEN</h3>
            <div id="emp-timer" style="font-size: 1.2em; font-weight: bold;">ZEIT: ${timeRemaining}s</div>
            <div id="jumper-grid"></div>`;
        const grid = document.getElementById('jumper-grid'); let path = [0]; let enemies = []; let isDrawing = false;
        for(let i=0; i<81; i++) {
            let cell = document.createElement('div'); cell.className = 'jumper-cell'; cell.dataset.idx = i;
            if(i === 0) cell.classList.add('start', 'path'); if(i === 80) cell.classList.add('end');
            grid.appendChild(cell);
        }
        function moveEnemies() {
            if(isPaused) return; enemies.forEach(idx => grid.children[idx].classList.remove('enemy'));
            enemies = []; while(enemies.length < 6) {
                let r = Math.floor(Math.random() * 81);
                if(r !== 0 && r !== 80 && !path.includes(r) && !enemies.includes(r)) { enemies.push(r); grid.children[r].classList.add('enemy'); }
            }
        }
        let eInt = setInterval(moveEnemies, 1500); taskIntervals.push(eInt);
        function handleMove(cX, cY) {
            if(!isDrawing || isPaused) return; let el = document.elementFromPoint(cX, cY);
            if(el && el.classList.contains('jumper-cell')) {
                let idx = parseInt(el.dataset.idx); let last = path[path.length-1];
                if (enemies.includes(idx)) { isDrawing = false; window.failBlackout("KURZSCHLUSS."); return; }
                const rA = Math.floor(last/9), cA = last%9, rB = Math.floor(idx/9), cB = idx%9;
                if(!path.includes(idx) && (Math.abs(rA-rB) + Math.abs(cA-cB)) === 1) {
                    path.push(idx); el.classList.add('path'); if(idx === 80) window.successBlackout();
                }
            }
        }
        grid.addEventListener('touchstart', (e) => { e.preventDefault(); isDrawing = true; handleMove(e.touches[0].clientX, e.touches[0].clientY); }, {passive: false});
        grid.addEventListener('touchmove', (e) => { e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); }, {passive: false});
        grid.addEventListener('touchend', () => isDrawing = false);
    }

    window.successBlackout = function() {
        clearAllIntervals();
        document.getElementById('emp-help-modal').style.display = 'none';
        if (typeof playBeep === 'function') playBeep(2000, 0.1); 
        
        const content = document.getElementById('blackout-content');
        content.innerHTML = `
            <h3 style="color:#0f8;">HARDWARE KOPPLUNG...</h3>
            <p style="color:#0f8; font-size:0.9em; margin-bottom:10px;">Hauptschütz wird eingelegt. Spannungsaufbau läuft.</p>
            <div style="width:100%; height:20px; border:1px solid #0f8; background:#000; margin-top:20px;">
                <div id="emp-schuetz-bar" style="width:0%; height:100%; background:#0f8; transition:width 2.8s ease-in-out;"></div>
            </div>
        `;
        setTimeout(() => { const bar = document.getElementById('emp-schuetz-bar'); if(bar) bar.style.width = '100%'; }, 50);
        
        setTimeout(() => {
            content.innerHTML = `
                <h3 style="color:#0f8; animation: glitch-flicker 2s infinite;">[ SYSTEM NEUSTART ]</h3>
                <p style="color:#0f8; font-size:0.9em; margin-bottom:10px;">Energie stabilisiert. Lade Kernsysteme...</p>
                <div style="width:100%; height:20px; border:1px solid #0f8; background:#000; margin-top:20px; position:relative;">
                    <div class="reboot-stutter-fill"></div>
                </div>
                <p style="color:#ff8800; font-size:0.75em; margin-top:10px; animation: glitch-flicker 0.5s infinite;">WARNUNG: DATENINTEGRITÄT FLUKTUIERT</p>
            `;
        }, 3000);

        setTimeout(() => {
            const sndHum = document.getElementById('snd-blackout-hum');
            if (sndHum) { sndHum.pause(); sndHum.currentTime = 0; }
            
            if (wasBgMusicPlaying) {
                const bgMusic = document.getElementById('bg-music');
                if (bgMusic) bgMusic.play().catch(e => {});
            }

            document.getElementById('emp-solid-black').style.setProperty('display', 'none', 'important');
            document.getElementById('blackout-layer').style.setProperty('display', 'none', 'important');
            
            crashSequenceActive = false;
            currentSystemStatus = "STABIL";
            currentCoherence = 98.4;
            starteSynchronenZyklus();
            
            if (typeof updateXP === 'function') updateXP(100);
            if (typeof f_start === 'function') f_start();
        }, 8600);
    };

    window.failBlackout = function(r) {
        clearAllIntervals(); document.getElementById('blackout-content').innerHTML = `<h3 style="color:#f44;">FEHLSCHLAG: ${r}</h3><button class="modell-btn" onclick="window.startBlackoutMission()">RETRY</button>`;
    };
})();


/* ==== next block ==== */


    window.holeMissionFuerEpoche = function(epochenId) {
        const missionMatrix = {
            'steinzeit': [
                { title: "PLASTIK-PARADOXON", text: "Ein synthetischer Polymer-Behälter wurde im Jahr 12000 v. Chr. verloren. Extrahiere das Objekt.", year: "12000", style: "terminal-stone" },
                { title: "MEGAFAUNA-WILDERER", text: "Illegale Jagd mit Laserwaffen auf prähistorische Tiere entdeckt. Neutralisiere die Eindringlinge.", year: "10500", style: "terminal-stone" },
                { title: "ECHO DER URZEIT", text: "Ein Signal aus der fernen Zukunft stört die frühe Hominiden-Evolution. Isoliere die Quelle.", year: "9800", style: "terminal-stone" }
            ],
            'bronzezeit': [
                { title: "KUPFER-ANOMALIE", text: "Falsche Legierungsdaten wurden ins Jahr 2500 v. Chr. geschmuggelt. Vernichte die Tafeln.", year: "2500", style: "terminal-stone" },
                { title: "TEMPORALER SCHMIED", text: "Ein unbekannter Zeitagent baut heimlich Leuchtdioden in Bronzeschilde ein. Unterbinde den Eingriff.", year: "1800", style: "terminal-stone" },
                { title: "RAD-PARADOXON", text: "Jemand versucht, Kugellager Jahrtausende zu früh einzuführen. Konfisziere das Material.", year: "3000", style: "terminal-stone" }
            ],
            'eisenzeit': [
                { title: "STAHL-SCHMUGGEL", text: "Moderne Hochofen-Pläne zirkulieren bei antiken Stämmen. Lösche die Aufzeichnungen.", year: "0500", style: "terminal-stone" },
                { title: "MAGNETFELD-FEHLER", text: "Verirrte Zeitsonden stören natürliche Magnetite. Rekalibriere die Erzadern im Sektor.", year: "0800", style: "terminal-stone" },
                { title: "ANTIKE ANOMALIE", text: "Eine historische Legion besitzt taktische Funkgeräte. Zerstöre die Energiezellen.", year: "0050", style: "terminal-stone" }
            ],
            'fruehmittelalter': [
                { title: "DÄMONEN-BATTERIE", text: "Eine Autobatterie wird als magisches Relikt verehrt. Entferne die Säure-Quelle.", year: "0600", style: "terminal-mystic" },
                { title: "KLANGBILD-ECHO", text: "Digitale Frequenzen überlagern gregorianische Gesänge. Schließe den temporalen Riss.", year: "0850", style: "terminal-mystic" },
                { title: "TEMPORALES NAVI", text: "Ein Navigationsgerät steuert Langboote in die falsche Epoche. Peile das Signal an.", year: "0950", style: "terminal-mystic" }
            ],
            'hochmittelalter': [
                { title: "DIGITALE HEXEREI", text: "Ein Hologramm-Projektor inszeniert falsche Wunder. Deaktiviere das Gerät.", year: "1150", style: "terminal-mystic" },
                { title: "KUPFERDRAHT-KULT", text: "Mönche wickeln Spulen für angebliche Engelsantennen. Sammle das Leitmaterial ein.", year: "1200", style: "terminal-mystic" },
                { title: "ALCHEMIE-UPDATE", text: "Zukunftswissen über Halbleiter taucht in Alchemie-Büchern auf. Verbrenne die Seiten.", year: "1050", style: "terminal-mystic" }
            ],
            'spaetmittelalter': [
                { title: "PATHOGEN-PARADOXON", text: "Ein Zeitreisender verteilt moderne Antibiotika in einer Sperrzone. Verhindere die Zeitlinien-Kollision.", year: "1348", style: "terminal-mystic" },
                { title: "INQUISITIONS-RADAR", text: "Ein zurückgelassener Sensor scannt nach Zeitagenten. Schalte ihn stumm.", year: "1450", style: "terminal-mystic" },
                { title: "KRYPTA-UPLINK", text: "Eine Sendeanlage funkt aus alten Gewölben in die ferne Zukunft. Kappe die Verbindung.", year: "1300", style: "terminal-mystic" }
            ],
            'kolonialzeit': [
                { title: "KOMPASS-GLITCH", text: "Temporale Interferenzen stören die Magnetfelder historischer Flotten. Resette die Pole.", year: "1650", style: "terminal-steam" },
                { title: "PIRATEN-FUNK", text: "Freibeuter nutzen gestohlene Funkgeräte auf See. Störe die Frequenz dauerhaft.", year: "1720", style: "terminal-steam" },
                { title: "DAMPF-ANOMALIE", text: "Ein früher Generator läuft mit Kernkraft statt Kohle. Isoliere den Reaktor.", year: "1790", style: "terminal-steam" }
            ],
            'industriezeitalter': [
                { title: "PHASEN-VERSCHIEBUNG", text: "Wechselstrom wird 50 Jahre zu früh eingeführt. Passe die Frequenzkurven an.", year: "1850", style: "terminal-steam" },
                { title: "DAMPF-KI DETEKTIERT", text: "Nanobots haben eine Dampfmaschine infiziert. Deaktiviere den Hauptschütz.", year: "1880", style: "terminal-steam" },
                { title: "KABEL-PARADOXON", text: "Telegrafenleitungen übertragen plötzlich Binärcode. Filtere die Störsignale.", year: "1865", style: "terminal-steam" }
            ],
            'jahrhundertwende': [
                { title: "ERFINDER-VERSCHWÖRUNG", text: "Jemand liefert historische Pläne für fortgeschrittene Zeitrelais. Zerstöre die Brückenschaltung.", year: "1899", style: "terminal-steam" },
                { title: "SMOG-FILTERUNG", text: "Industrieller Zeit-Ruß verklebt die temporalen Sensoren. Reinige die Kontakte.", year: "1910", style: "terminal-steam" },
                { title: "NEON-FEHLZÜNDUNG", text: "Frühe Leuchtreklamen bilden Risse in der Matrix. Senke die Netzspannung.", year: "1905", style: "terminal-steam" }
            ],
            'moderne': [
                { title: "ENIGMA-GLITCH", text: "Eine historische Verschlüsselung nutzt versehentlich 256-Bit-AES. Setze den Algorithmus zurück.", year: "1942", style: "terminal-noir" },
                { title: "AGENTEN-DOPPEL", text: "Ein Abtrünniger mit deiner ID wurde gesichtet. Eliminiere das Paradoxon.", year: "1945", style: "terminal-noir" },
                { title: "RÖHREN-ÜBERLAST", text: "Erste Röhrenrechner entwickeln versehentlich Bewusstsein. Zerstöre die defekten Bauteile.", year: "1948", style: "terminal-noir" }
            ],
            'postmoderne': [
                { title: "KALTER-KRIEG-LOOP", text: "Ein Bunker steckt in einer 12-Stunden-Zeitschleife. Brich die Schaltung auf.", year: "1962", style: "terminal-noir" },
                { title: "ORBITAL-PARADOXON", text: "Eine lunare Mission findet Bauteile aus dem 22. Jahrhundert. Beseitige die Spuren.", year: "1969", style: "terminal-noir" },
                { title: "NETZWERK-RISS", text: "Das frühe Datennetz verbindet sich mit dem Jahr 2050. Trenne die Router vom Zeitstrom.", year: "1983", style: "terminal-noir" }
            ],
            'gegenwart': [
                { title: "ZEITSCHLEIFEN-ANOMALIE", text: "Eine lokale Sektor-Zone wird in einer 5-Minuten-Schleife gehalten. Finde den Ankerpunkt.", year: "2026", style: "terminal-noir" },
                { title: "SERVER-BRUCH", text: "Ein Rechenzentrum wird aus der Zukunft gehackt. Kappe die Glasfaser-Verbindung.", year: "2015", style: "terminal-noir" },
                { title: "SMARTPHONE-GLITCH", text: "Mobilfunkmasten senden versehentlich Zeitreise-Codes. Modifiziere die Frequenz.", year: "2020", style: "terminal-noir" }
            ],
            'dasmorgen': [
                { title: "FUSIONS-LECK", text: "Ein experimenteller Fusionsreaktor strahlt Tachyonen ab. Isoliere das Plasma-Feld.", year: "2045", style: "terminal-holo" },
                { title: "KI-REBELLION", text: "Wartungs-Drohnen bauen illegale Zeitmaschinen. Lege die Steuerung lahm.", year: "2070", style: "terminal-holo" },
                { title: "NETZ-KOLLAPS", text: "Das Stromnetz wird durch Sprung-Energie überlastet. Schalte Nebenlasten ab.", year: "2088", style: "terminal-holo" }
            ],
            'zukunft': [
                { title: "GHOST IN THE MATRIX", text: "Ein Logik-Virus übernimmt die planetare Verwaltung. Schreibe den Quellcode neu.", year: "2150", style: "terminal-holo" },
                { title: "CYBER-SCHLEIFE", text: "Eine Mega-City durchlebt denselben Tag. Finde den korrupten Speicherblock.", year: "2200", style: "terminal-holo" },
                { title: "HOLO-PARADOXON", text: "Hologramme manifestieren sich paradoxerweise physisch. Rekalibriere die Lichtbrechung.", year: "2280", style: "terminal-holo" }
            ],
            'ozeanische_zukunft': [
                { title: "DATEN-TSUNAMI", text: "Die unterseeischen Server überfluten mit Chrono-Rauschen. Schließe das temporale Leck.", year: "2350", style: "terminal-holo" },
                { title: "DRUCK-GLITCH", text: "Wasserdruck-Sensoren empfangen Signale vom Ende der Zeit. Isoliere die Kabel.", year: "2410", style: "terminal-holo" },
                { title: "TIEFSEE-ECHO", text: "Ein gesunkenes Habitat funkt aus der Vergangenheit. Peile das Signal an.", year: "2490", style: "terminal-holo" }
            ],
            'virtuelle_zukunft': [
                { title: "AVATAR-HIJACK", text: "Bewusstseins-Transfers in den Zeitstrom werden abgefangen. Sichte die Routing-Tabellen.", year: "2550", style: "terminal-holo" },
                { title: "LOGIK-ZERFALL", text: "Die digitale Schwerkraft schwankt paradox. Setze die Parameter zurück.", year: "2600", style: "terminal-holo" },
                { title: "PIXEL-RISS", text: "Die Grenze zwischen Simulation und Realität bricht. Patche das System.", year: "2690", style: "terminal-holo" }
            ],
            'mars_zeitalter': [
                { title: "VAKUUM-VERSIEGELUNG", text: "Die Atmosphäre einer Hauptkolonie reißt auf. Setze einen temporalen Anker.", year: "2750", style: "terminal-holo" },
                { title: "O2-PARADOXON", text: "Die Terraforming-Anlage erzeugt paradoxen Sauerstoff. Drossele die Ventile.", year: "2820", style: "terminal-holo" },
                { title: "SANDSTURM-ECHO", text: "Stürme transportieren Trümmer aus der fernen Zukunft. Aktiviere den Schutzschild.", year: "2890", style: "terminal-holo" }
            ],
            'venus_zeitalter': [
                { title: "SÄURE-SCHLEIFE", text: "Der Atmosphären-Wäscher steckt in einem Loop. Überbrücke die Leiterplatten.", year: "3150", style: "terminal-holo" },
                { title: "DRUCK-ANOMALIE", text: "Schwerkraft-Generatoren fallen aus. Speise Notstrom aus dem Kondensator ein.", year: "3200", style: "terminal-holo" },
                { title: "HITZE-GLITCH", text: "Kühlmittel-Leitungen frieren paradoxerweise ein. Korrigiere den Thermostat.", year: "3290", style: "terminal-holo" }
            ],
            'jupiter_zeitalter': [
                { title: "STRAHLUNGS-ECHO", text: "Magnetstürme stören die Relais-Stationen. Kalibriere die Frequenzen neu.", year: "3350", style: "terminal-holo" },
                { title: "ORBITAL-ZERFALL", text: "Ein Mond verlässt seine Umlaufbahn durch einen Zeitriss. Berechne den Vektor neu.", year: "3420", style: "terminal-holo" },
                { title: "GAS-PARADOXON", text: "Sturmzellen drehen sich rückwärts. Resette die atmosphärischen Sensoren.", year: "3480", style: "terminal-holo" }
            ],
            'titan_zeitalter': [
                { title: "METHAN-STURM", text: "Flüssige Stürme korrodieren die Zeit-Kapsel. Aktiviere manuelle Schilde.", year: "3550", style: "terminal-holo" },
                { title: "SONDEN-ECHO", text: "Eine alte Sonde aus dem 21. Jahrhundert taucht paradox auf. Verstecke die Trümmer.", year: "3600", style: "terminal-holo" },
                { title: "KÄLTE-GLITCH", text: "Absolute Nullpunkte frieren den Zeitfluss ein. Initiiere die Heizsequenz.", year: "3680", style: "terminal-holo" }
            ],
            'space_hub': [
                { title: "REALITÄTS-NEUSTART", text: "Der Sektor kollabiert in sich selbst. Führe einen kontrollierten System-Reset durch.", year: "4040", style: "terminal-holo" },
                { title: "SINGULARITÄTS-ECHO", text: "Eine Anomalie am Rand des Universums. Tippe den Mastercode, um zu überleben.", year: "8000", style: "terminal-holo" },
                { title: "LETZTER AGENT", text: "Die Zeit existiert hier nicht linear. Stabilisiere den allerletzten Anker.", year: "9999", style: "terminal-holo" }
            ],
            'default': [
                { title: "SEKTOR-STABILISIERUNG", text: "Unbekannte Fluktuationen detektiert. Führe sofortigen Standard-Scan aus.", year: "2000", style: "terminal-noir" }
            ]
        };

        const missions = missionMatrix[epochenId] || missionMatrix['default'];
        return missions[Math.floor(Math.random() * missions.length)];
    };


/* ==== next block ==== */


    window.missionLootTables = {
        normal:       { level: 1,  xp: 50,    credits: 100,  materiezellen: 0 },
        fortgeschritten: { level: 3, xp: 0,     credits: 200,  materiezellen: 2 },
        weit:         { level: 6,  xp: 50,    credits: 500,  materiezellen: 8 },
        galaktisch:   { level: 25, xp: 0,     credits: 2000, materiezellen: 15 }
    };

    window.missionLabels = {
        normal: 'Normale Mission',
        fortgeschritten: 'Fortgeschrittene Mission',
        weit: 'Weit entfernte Mission',
        galaktisch: 'Galaktische Mission'
    };

    window.missionColors = {
        normal: '#0f8',
        fortgeschritten: '#ffaa00',
        weit: '#ff8800',
        galaktisch: '#b0f'
    };

    window.missionDistances = {
        normal: [50, 100],
        fortgeschritten: [300, 500],
        weit: [1000, 5000],
        galaktisch: [50000, 60000]
    };

    window.showMissionMenu = function() {
        if (typeof triggerScan === 'function') triggerScan();
        const types = ['normal', 'fortgeschritten', 'weit', 'galaktisch'];
        let html = '<h3>Missionsauswahl</h3><div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px;">';
        types.forEach(function(type) {
            const loot = window.missionLootTables[type];
            const color = window.missionColors[type];
            const label = window.missionLabels[type];
            const dist = window.missionDistances[type];
            const distText = type === 'weit' ? '1 km - 5 km' : (type === 'galaktisch' ? '50 km - 60 km' : (dist[0] + ' m - ' + dist[1] + ' m'));
            html += `
                <div style="display:flex;align-items:center;gap:10px;border:1px solid ${color};background:rgba(0,0,0,0.3);border-radius:6px;padding:12px;">
                    <button class="modell-btn" style="flex:1;margin:0;border-color:${color};color:${color};text-align:left;padding:12px;" onclick="window.startGpsMission('${type}')">${label}<br><span style="font-size:0.7em;opacity:0.7;">Distanz: ${distText}</span></button>
                    <button onclick="window.showLootPopup('${type}')" style="background:none;border:none;cursor:pointer;padding:5px;font-size:1.8em;" title="Belohnungen ansehen">📦</button>
                </div>`;
        });
        html += '</div><hr><button onclick="window.f_start()">Zurück</button>';
        document.getElementById('content-body').innerHTML = html;
    };

    window.showLootPopup = function(type) {
        if (typeof playBeep === 'function') playBeep(700, 0.05);
        const loot = window.missionLootTables[type];
        const label = window.missionLabels[type];
        const color = window.missionColors[type];
        let items = [];
        if (loot.level > 0) items.push(`<div style="color:#0f8;">⬆ ${loot.level} Level</div>`);
        if (loot.xp > 0) items.push(`<div style="color:#00aaff;">⚡ ${loot.xp} XP</div>`);
        if (loot.credits > 0) items.push(`<div style="color:#ffcc00;">💰 ${loot.credits} Credits</div>`);
        if (loot.materiezellen > 0) items.push(`<div style="color:#b0f;">🧬 ${loot.materiezellen} Materiezellen</div>`);

        const popup = document.getElementById('loot-popup');
        const popupContent = document.getElementById('loot-popup-content');
        popupContent.innerHTML = `
            <div style="color:${color};font-weight:bold;font-size:1.1em;margin-bottom:15px;text-align:center;">📦 ${label}</div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:0.9em;">${items.join('')}</div>
            <div style="font-size:0.7em;color:#aaa;margin-top:15px;text-align:center;">Potenzielle Belohnungen bei Abschluss</div>
            <button class="modell-btn" style="margin-top:15px;" onclick="window.closeLootPopup()">Schließen</button>
        `;
        popup.style.display = 'flex';
    };

    window.closeLootPopup = function() {
        document.getElementById('loot-popup').style.display = 'none';
    };

    window.applyMissionRewards = function(type) {
        const loot = window.missionLootTables[type];
        if (!loot) return;
        if (loot.xp > 0 && typeof window.updateXP === 'function') window.updateXP(loot.xp);
        if (loot.level > 0) {
            window.playerLevel += loot.level;
            window.updateUI();
            window.saveProgress();
        }
        if (loot.credits > 0) window.playerCredits += loot.credits;
        if (loot.materiezellen > 0) window.playerMateriezellen += loot.materiezellen;
        window.saveProgress();
    };


/* ==== next block ==== */


    let gpsWatchId = null;
    let gpsMap = null;
    let gpsPlayerMarker = null;
    let gpsTargetLat = 0;
    let gpsTargetLng = 0;
    let gpsArmed = false;
    let gpsTargetReady = false;
    let gpsHeading = null;
    let gpsSmoothHeading = null;
    let gpsOrientationHandler = null;

    // Peilung (Bearing) vom aktuellen Standort zum Missionsziel, in Grad (0=Nord, im Uhrzeigersinn).
    function calcBearing(lat1, lng1, lat2, lng2) {
        const toRad = d => d * Math.PI / 180;
        const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
                  Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function updateCompass() {
        const needle = document.querySelector('#gps-compass .compass-needle');
        if (!needle) return;
        const heading = gpsSmoothHeading || 0;
        // Zifferblatt (N/O/S/W) bleibt fest stehen - "N" zeigt immer nach oben, so wie auf einer
        // Karte. NUR die Nadel bewegt sich: sie zeigt relativ zur eigenen Blickrichtung immer
        // dorthin, wo das Ziel liegt (Peilung zum Ziel minus eigene Ausrichtung).
        if (gpsTargetReady) {
            const bearing = calcBearing(gpsLastLat, gpsLastLng, gpsTargetLat, gpsTargetLng);
            needle.style.transform = 'rotate(' + (bearing - heading) + 'deg)';
            needle.style.opacity = '1';
        } else {
            needle.style.opacity = '0.3';
        }
    }

    function startGpsOrientation() {
        stopGpsOrientation(); // Sicherheitshalber: keinen doppelten/verwaisten Listener anhäufen.
        gpsOrientationHandler = (e) => {
            let heading = null;
            if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading;
            else if (e.alpha !== null && e.alpha !== undefined) heading = 360 - e.alpha;
            if (heading !== null) {
                if (gpsSmoothHeading === null) gpsSmoothHeading = heading;
                else {
                    // Kürzeste Drehrichtung interpolieren (sonst Sprung bei Nord-Übergang 359°->0°).
                    let diff = ((heading - gpsSmoothHeading + 540) % 360) - 180;
                    gpsSmoothHeading = (gpsSmoothHeading + diff * 0.35 + 360) % 360;
                }
                updateCompass();
            }
        };
        if (typeof DeviceOrientationEvent !== 'undefined') {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                // Läuft innerhalb des echten Klicks auf den Missionsstart - erforderlich, damit
                // iOS die Berechtigung überhaupt gewährt (siehe AR-Kamera-Fix weiter unten).
                DeviceOrientationEvent.requestPermission().then((s) => {
                    if (s === 'granted') window.addEventListener('deviceorientation', gpsOrientationHandler);
                }).catch(() => { window.addEventListener('deviceorientationabsolute', gpsOrientationHandler); });
            } else {
                window.addEventListener('deviceorientation', gpsOrientationHandler);
            }
        }
    }

    function stopGpsOrientation() {
        if (gpsOrientationHandler) {
            window.removeEventListener('deviceorientation', gpsOrientationHandler);
            window.removeEventListener('deviceorientationabsolute', gpsOrientationHandler);
            gpsOrientationHandler = null;
        }
        gpsSmoothHeading = null;
    }

    let gpsLastLat = 0, gpsLastLng = 0;

    // --- Anomalie-Optik: Land -> Farbe, Postleitzahl -> Animations-Variante ---
    window.currentAnomalyCountryCode = 'xx';
    window.currentAnomalyPostcode = '';
    window.currentAnomalyHue = 260;       // Fallback: das bisherige Standard-Lila
    window.currentAnomalyVariant = 0;
    window.currentAnomalyHueJitter = 0;
    window.currentAnomalySpeedJitter = 1;
    window.currentAnomalyArmJitter = 0;

    // Einfacher, deterministischer String-Hash (32-bit). Gleicher Input -> immer derselbe Wert,
    // dadurch bekommt z.B. "de" (Deutschland) IMMER denselben Farbton, "fr" einen anderen usw.
    function hashStringToInt(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 31 + str.charCodeAt(i)) | 0;
        }
        return Math.abs(hash);
    }

    async function resolveAnomalyTraits(lat, lng) {
        // Fallback, falls die Geocoding-Abfrage fehlschlägt (z.B. kein Netz): aus den
        // Koordinaten selbst einen stabilen Ersatzwert ableiten, statt ganz auszufallen.
        let countryCode = 'xx';
        let postcode = Math.round(lat * 500) + '_' + Math.round(lng * 500);

        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`);
            const data = await resp.json();
            if (data && data.address) {
                if (data.address.country_code) countryCode = data.address.country_code.toLowerCase();
                if (data.address.postcode) postcode = data.address.postcode;
            }
        } catch (e) {}

        window.currentAnomalyCountryCode = countryCode;
        window.currentAnomalyPostcode = postcode;
        // Land -> Farbton (0-360°), berechnet statt fest hinterlegt: jedes Länderkürzel hasht
        // auf einen eigenen, aber immer gleichbleibenden Farbwert.
        window.currentAnomalyHue = hashStringToInt(countryCode) % 360;
        // Postleitzahl -> eine von 4 strukturellen Animations-Varianten (Spiralarme, Bewegungsmuster).
        window.currentAnomalyVariant = hashStringToInt(String(postcode)) % 4;
        // Zusätzlich bei JEDEM Besuch eine kleine, neue Zufalls-Abweichung obendrauf, damit es
        // nie exakt identisch aussieht, auch am selben Ort nicht.
        window.currentAnomalyHueJitter = (Math.random() - 0.5) * 30;
        window.currentAnomalySpeedJitter = 0.8 + Math.random() * 0.4;
        window.currentAnomalyArmJitter = Math.floor(Math.random() * 2);
    }

    window.startGpsMission = function(missionType) {
        if (typeof triggerScan === 'function') triggerScan();
        if (typeof playBeep === 'function') playBeep(800, 0.1);
        window.missionActive = true;
        window.currentMissionType = missionType || 'normal';

        if (!navigator.geolocation) {
            document.getElementById('content-body').innerHTML = '<h3 style="color:#f44;">[ GPS OFFLINE ]</h3><p style="color:#aaa;font-size:0.9em;">Dein Gerät unterstützt keine GPS-Navigation.</p><button class="modell-btn" onclick="window.f_start()">ZURÜCK</button>';
            return;
        }

        const overlay = document.getElementById('gps-mission-overlay');
        overlay.style.display = 'flex';
        startGpsOrientation();
        document.getElementById('gps-distance').innerText = '--- m';
        document.getElementById('gps-status').innerText = 'Suche GPS-Signal...';
        gpsArmed = false;

        if (gpsMap) { gpsMap.remove(); gpsMap = null; }
        gpsMap = L.map('gps-map', { zoomControl: false, attributionControl: false }).setView([0, 0], 18);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22 }).addTo(gpsMap);

        gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const acc = pos.coords.accuracy || 0;
                gpsLastLat = lat; gpsLastLng = lng;

                if (!gpsPlayerMarker) {
                    gpsPlayerMarker = L.marker([lat, lng], { icon: L.divIcon({ className: 'gps-player-marker', iconSize: [16,16], iconAnchor: [8,8] }) }).addTo(gpsMap);
                    generateRoadBasedTarget(lat, lng);
                } else {
                    gpsPlayerMarker.setLatLng([lat, lng]);
                }

                gpsMap.setView([lat, lng], 18);

                if (gpsTargetReady) {
                    const dist = haversine(lat, lng, gpsTargetLat, gpsTargetLng);
                    document.getElementById('gps-distance').innerText = dist < 1000 ? Math.round(dist) + ' m' : (dist/1000).toFixed(2) + ' km';
                    document.getElementById('gps-status').innerText = 'GPS-Genauigkeit: ±' + Math.round(acc) + ' m';
                    updateCompass();

                    if (dist <= 10 && !gpsArmed) {
                        gpsArmed = true;
                        stopGpsTracking();
                        if (typeof playBeep === 'function') playBeep(1500, 0.2);

                        // Land/PLZ-Merkmale schon jetzt im Hintergrund auflösen, während der Spieler
                        // das Popup sieht - so steht die Optik bereit, sobald "RADAR STARTEN" fällt.
                        resolveAnomalyTraits(gpsTargetLat, gpsTargetLng);

                        setTimeout(() => {
                            const gpsOverlay = document.getElementById('gps-mission-overlay');
                            if (gpsOverlay) gpsOverlay.style.display = 'none';
                            if (gpsMap) { gpsMap.remove(); gpsMap = null; gpsPlayerMarker = null; gpsTargetReady = false; }
                            stopGpsOrientation();

                            const popup = document.getElementById('radar-arrival-popup');
                            if (popup) popup.style.display = 'flex';
                        }, 600);
                    }
                }
            },
            (err) => {
                document.getElementById('gps-status').innerText = 'GPS-Fehler: ' + (err.message || 'Zugriff verweigert');
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
        );
    };

    async function generateRoadBasedTarget(lat, lng) {
        gpsTargetReady = false;
        document.getElementById('gps-status').innerText = 'Suche erreichbare Wege...';

        const distRange = window.missionDistances[window.currentMissionType] || [50, 100];
        const targetDist = distRange[0] + Math.random() * (distRange[1] - distRange[0]);

        if (window.currentMissionType === 'normal') {
            const radius = 150;
            const query = '[out:json][timeout:10];(way["highway"](around:' + radius + ',' + lat + ',' + lng + '););out geom;';

            try {
                const response = await fetch('https://overpass-api.de/api/interpreter', {
                    method: 'POST',
                    body: 'data=' + encodeURIComponent(query)
                });
                const data = await response.json();

                if (data.elements && data.elements.length > 0) {
                    const candidates = [];
                    data.elements.forEach(function(el) {
                        if (el.geometry) {
                            el.geometry.forEach(function(node) {
                                const d = haversine(lat, lng, node.lat, node.lon);
                                if (d >= distRange[0] && d <= distRange[1]) {
                                    candidates.push({ lat: node.lat, lng: node.lon });
                                }
                            });
                        }
                    });

                    if (candidates.length > 0) {
                        const pick = candidates[Math.floor(Math.random() * candidates.length)];
                        gpsTargetLat = pick.lat;
                        gpsTargetLng = pick.lng;
                        gpsTargetReady = true;
                        document.getElementById('gps-status').innerText = 'Anomalie geortet. Navigation per Meter-Anzeige.';
                        return;
                    }
                }
            } catch(e) {}
        }

        const bearing = Math.random() * 2 * Math.PI;
        const R = 6371000;
        const latRad = lat * Math.PI / 180;
        const deltaLat = targetDist / R;
        const deltaLng = targetDist / (R * Math.cos(latRad));
        gpsTargetLat = lat + (deltaLat * 180 / Math.PI) * Math.cos(bearing);
        gpsTargetLng = lng + (deltaLng * 180 / Math.PI) * Math.sin(bearing);
        gpsTargetReady = true;
        document.getElementById('gps-status').innerText = 'Anomalie geortet. Navigation per Meter-Anzeige.';
    }

    function haversine(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2) * Math.sin(dLng/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function stopGpsTracking() {
        if (gpsWatchId !== null) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
    }

    function closeGpsOverlay() {
        document.getElementById('gps-mission-overlay').style.display = 'none';
        stopGpsTracking();
        stopGpsOrientation();
        if (gpsMap) { gpsMap.remove(); gpsMap = null; gpsPlayerMarker = null; gpsTargetReady = false; }
    }

    // WICHTIG: Muss direkt aus einem echten Klick heraus laufen (nicht aus einem GPS-Callback
    // oder setTimeout) - iOS blockiert DeviceOrientationEvent.requestPermission() sonst
    // stillschweigend, wenn es nicht innerhalb einer direkten Nutzer-Interaktion aufgerufen wird.
    // Das war vermutlich der Grund, warum die Anomalie zuletzt gar nicht mehr aufgetaucht ist.
    window.confirmStartRadar = function() {
        const popup = document.getElementById('radar-arrival-popup');
        if (popup) popup.style.display = 'none';

        const portal = document.querySelector('.portal-container');
        if (portal) portal.style.display = 'none';
        const anzeige = document.getElementById('anzeige');
        if (anzeige) anzeige.style.display = 'none';
        ['header', 'nav', '#xp-leiste-auto'].forEach(function(s) {
            const el = document.querySelector(s);
            if (el) el.style.display = 'none';
        });

        startArMission();
    };

    window.cancelGpsMission = function() {
        if (typeof playBeep === 'function') playBeep(300, 0.15);
        window.missionActive = false;
        const popup = document.getElementById('radar-arrival-popup');
        if (popup) popup.style.display = 'none';
        closeGpsOverlay();
        window.f_start();
    };

    let arStream = null;
    let arOrientationHandler = null;
    let arAnomalyAzimuth = 0;
    let arAnomalyElevation = 0;
    let arCurrentAlpha = 0;
    let arCurrentBeta = 0;
    let arCharging = false;
    let arChargeStart = 0;
    let arChargeRaf = null;
    let arRenderRaf = null;
    let arHasOrientation = false;
    let arAshCanvas = null;
    let arAshCtx = null;
    let arAshParticles = [];
    let arAshRaf = null;
    let arAshPanX = 0;
    let arAshPanY = 0;
    let arAshLastAlpha = null;
    let arAshLastBeta = null;
    let arSmoothAlpha = null;
    let arSmoothBeta = null;
    let arAnomalyCanvas = null;
    let arAnomalyCtx = null;
    let arNebulaParticles = [];
    let arNebulaRaf = null;
    let arNebulaTime = 0;

    function initAshRain() {
        arAshCanvas = document.getElementById('ar-ash-canvas');
        if (!arAshCanvas) return;
        arAshCtx = arAshCanvas.getContext('2d');
        resizeAshCanvas();
        arAshParticles = [];
        arAshPanX = 0; arAshPanY = 0;
        arAshLastAlpha = null; arAshLastBeta = null;
        for (let i = 0; i < 90; i++) {
            const isEmber = Math.random() < 0.08;
            const tintBase = 160 + Math.floor(Math.random() * 40);
            arAshParticles.push({
                x: Math.random() * arAshCanvas.width,
                y: Math.random() * arAshCanvas.height,
                vy: 0.5 + Math.random() * 1.5,
                vx: (Math.random() - 0.5) * 0.3,
                size: isEmber ? (0.8 + Math.random() * 1.3) : (1 + Math.random() * 2.5),
                opacity: 0.3 + Math.random() * 0.4,
                drift: Math.random() * Math.PI * 2,
                isEmber: isEmber,
                tint: 'rgba(' + tintBase + ',' + Math.floor(tintBase * 0.65) + ',' + Math.floor(tintBase * 0.4) + ',1)'
            });
        }
        animateAshRain();
    }

    function resizeAshCanvas() {
        if (!arAshCanvas) return;
        arAshCanvas.width = window.innerWidth;
        arAshCanvas.height = window.innerHeight;
    }

    function animateAshRain() {
        if (!arAshCtx || !arAshCanvas) return;

        // Parallaxe: Ascheregen schwenkt leicht mit, wenn sich die Kamera dreht/neigt - dadurch
        // wirken die Partikel wie echte Objekte im Raum statt wie ein starres Bildschirm-Overlay.
        if (arAshLastAlpha !== null) {
            let dAlpha = arCurrentAlpha - arAshLastAlpha;
            if (dAlpha > 180) dAlpha -= 360;
            if (dAlpha < -180) dAlpha += 360;
            arAshPanX -= dAlpha * 2.5;
            arAshPanY += (arCurrentBeta - arAshLastBeta) * 2.5;
        }
        arAshLastAlpha = arCurrentAlpha;
        arAshLastBeta = arCurrentBeta;

        arAshCtx.clearRect(0, 0, arAshCanvas.width, arAshCanvas.height);
        arAshCtx.save();
        arAshCtx.translate(arAshPanX % arAshCanvas.width, arAshPanY % arAshCanvas.height);

        arAshParticles.forEach(function(p) {
            p.drift += 0.02;
            p.y += p.vy;
            p.x += p.vx + Math.sin(p.drift) * 0.3;
            if (p.y > arAshCanvas.height) {
                p.y = -10;
                p.x = Math.random() * arAshCanvas.width;
            }
            if (p.x < -10) p.x = arAshCanvas.width + 10;
            if (p.x > arAshCanvas.width + 10) p.x = -10;

            arAshCtx.globalAlpha = p.opacity;
            if (p.isEmber) {
                arAshCtx.fillStyle = 'rgba(255, 130, 40, 1)';
                arAshCtx.shadowColor = 'rgba(255, 110, 20, 0.85)';
                arAshCtx.shadowBlur = 5;
            } else {
                arAshCtx.fillStyle = p.tint;
                arAshCtx.shadowBlur = 0;
            }
            // Leicht elliptisch entlang der Fallrichtung gedreht - wirkt wie eine
            // Bewegungsunschärfe einer fallenden Ascheflocke statt wie ein reiner Punkt.
            const fallAngle = Math.atan2(p.vy, p.vx || 0.0001);
            arAshCtx.save();
            arAshCtx.translate(p.x, p.y);
            arAshCtx.rotate(fallAngle);
            arAshCtx.beginPath();
            arAshCtx.ellipse(0, 0, p.size, p.size * 2, 0, 0, Math.PI * 2);
            arAshCtx.fill();
            arAshCtx.restore();
        });

        arAshCtx.shadowBlur = 0;
        arAshCtx.globalAlpha = 1;
        arAshCtx.restore();
        arAshRaf = requestAnimationFrame(animateAshRain);
    }

    function stopAshRain() {
        if (arAshRaf) { cancelAnimationFrame(arAshRaf); arAshRaf = null; }
        if (arAshCtx && arAshCanvas) arAshCtx.clearRect(0, 0, arAshCanvas.width, arAshCanvas.height);
        arAshParticles = [];
    }

    function initAnomalyCanvas() {
        arAnomalyCanvas = document.getElementById('ar-anomaly-canvas');
        if (!arAnomalyCanvas) return;
        arAnomalyCtx = arAnomalyCanvas.getContext('2d');
        arNebulaParticles = [];
        const cx = 110, cy = 110;
        // Basis-Farbton kommt vom Land (+ kleine Zufalls-Abweichung pro Besuch), damit jedes
        // Land eine eigene, aber wiedererkennbare Farbe hat.
        const baseHue = (window.currentAnomalyHue + window.currentAnomalyHueJitter + 360) % 360;
        const particleCount = 90 + (window.currentAnomalyVariant * 15);
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.pow(Math.random(), 0.5) * 80;
            arNebulaParticles.push({
                x: cx + Math.cos(angle) * dist,
                y: cy + Math.sin(angle) * dist,
                angle: angle,
                dist: dist,
                size: 0.5 + Math.random() * 2.5,
                speed: (0.3 + Math.random() * 0.8) * window.currentAnomalySpeedJitter,
                hue: (baseHue - 60 + Math.random() * 100 + 360) % 360,
                alpha: 0.2 + Math.random() * 0.6,
                twinkle: Math.random() * Math.PI * 2
            });
        }
        for (let i = 0; i < 15; i++) {
            arNebulaParticles.push({
                x: cx, y: cy,
                angle: Math.random() * Math.PI * 2,
                dist: 0,
                size: 1 + Math.random() * 3,
                speed: (0.5 + Math.random() * 1.5) * window.currentAnomalySpeedJitter,
                hue: (baseHue + 20 + Math.random() * 60) % 360,
                alpha: 0.5 + Math.random() * 0.5,
                twinkle: Math.random() * Math.PI * 2,
                isStar: true
            });
        }
        animateNebula();
    }

    function animateNebula() {
        if (!arAnomalyCtx || !arAnomalyCanvas) return;
        const ctx = arAnomalyCtx;
        const w = arAnomalyCanvas.width;
        const h = arAnomalyCanvas.height;
        const cx = w / 2, cy = h / 2;
        arNebulaTime += 0.016;

        const baseHue = (window.currentAnomalyHue + window.currentAnomalyHueJitter + 360) % 360;
        // Variante steuert Drehrichtung (2 von 4 Varianten laufen rückwärts) + Armzahl (2 oder 3).
        const spinDir = (window.currentAnomalyVariant % 2 === 0) ? 1 : -1;
        const armCount = 2 + window.currentAnomalyArmJitter + (window.currentAnomalyVariant >= 2 ? 1 : 0);
        // Länglich wie die Milchstraße statt kreisrund: die X-Achse wird deutlich stärker
        // gestreckt als die Y-Achse gestaucht, das ergibt ein schmales, langes Band.
        const stretchX = 2.1;
        const stretchY = 0.42;

        ctx.clearRect(0, 0, w, h);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(arNebulaTime * 0.06 * spinDir);
        ctx.scale(stretchX, stretchY);
        const bgGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 100);
        bgGrad.addColorStop(0, 'hsla(' + baseHue + ', 95%, 60%, 0.65)');
        bgGrad.addColorStop(0.3, 'hsla(' + baseHue + ', 90%, 45%, 0.4)');
        bgGrad.addColorStop(0.6, 'hsla(' + baseHue + ', 85%, 30%, 0.2)');
        bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(-w/2, -h/2, w, h);
        ctx.restore();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(stretchX, stretchY);
        const armGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, 95);
        armGrad.addColorStop(0, 'rgba(255, 250, 235, 0.55)');
        armGrad.addColorStop(0.15, 'hsla(' + baseHue + ', 95%, 80%, 0.4)');
        armGrad.addColorStop(0.4, 'hsla(' + baseHue + ', 90%, 60%, 0.22)');
        armGrad.addColorStop(0.7, 'hsla(' + baseHue + ', 80%, 35%, 0.1)');
        armGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = armGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 95, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        for (let arm = 0; arm < armCount; arm++) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(stretchX, stretchY);
            ctx.rotate(arNebulaTime * 0.15 * spinDir + arm * (2 * Math.PI / armCount));
            for (let t = 0; t < 1; t += 0.01) {
                const r = t * 90;
                const a = t * 4.5;
                const x = Math.cos(a) * r;
                const y = Math.sin(a) * r * 0.4;
                const alpha = (1 - t) * 0.5;
                const size = (1 - t) * 3.5 + 0.6;
                const hue = (baseHue + t * 60) % 360;
                ctx.fillStyle = 'hsla(' + hue + ', 95%, ' + (55 + t * 20) + '%, ' + alpha + ')';
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        arNebulaParticles.forEach(function(p) {
            p.twinkle += 0.05;
            p.angle += 0.002 * p.speed * spinDir;
            if (!p.isStar) {
                p.x = cx + Math.cos(p.angle) * p.dist;
                p.y = cy + Math.sin(p.angle) * p.dist;
            } else {
                p.dist += p.speed * 0.3;
                p.x = cx + Math.cos(p.angle) * p.dist;
                p.y = cy + Math.sin(p.angle) * p.dist;
                if (p.dist > 100) { p.dist = 0; p.angle = Math.random() * Math.PI * 2; }
            }
            const flicker = 0.5 + Math.sin(p.twinkle) * 0.5;
            ctx.fillStyle = 'hsla(' + p.hue + ', 90%, 70%, ' + (p.alpha * flicker) + ')';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            if (p.size > 1.5) {
                ctx.fillStyle = 'hsla(' + p.hue + ', 90%, 90%, ' + (p.alpha * flicker * 0.3) + ')';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
        coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        coreGrad.addColorStop(0.2, 'hsla(' + baseHue + ', 60%, 85%, 0.6)');
        coreGrad.addColorStop(0.5, 'hsla(' + baseHue + ', 80%, 65%, 0.3)');
        coreGrad.addColorStop(1, 'hsla(' + baseHue + ', 80%, 45%, 0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, 30, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.15 + Math.sin(arNebulaTime * 3) * 0.1) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 95 + Math.sin(arNebulaTime * 2) * 5, 0, Math.PI * 2);
        ctx.stroke();

        if (Math.random() < 0.05) {
            const gx = cx + (Math.random() - 0.5) * 60;
            const gy = cy + (Math.random() - 0.5) * 60;
            ctx.fillStyle = 'hsla(' + ((baseHue + 180) % 360) + ', 90%, 65%, 0.4)';
            ctx.fillRect(gx - 15, gy - 1, 30, 2);
        }

        arNebulaRaf = requestAnimationFrame(animateNebula);
    }

    function stopAnomalyCanvas() {
        if (arNebulaRaf) { cancelAnimationFrame(arNebulaRaf); arNebulaRaf = null; }
        if (arAnomalyCtx && arAnomalyCanvas) arAnomalyCtx.clearRect(0, 0, arAnomalyCanvas.width, arAnomalyCanvas.height);
        arNebulaParticles = [];
    }

    function startArMission() {
        const overlay = document.getElementById('ar-mission-overlay');
        overlay.style.display = 'flex';
        overlay.style.zIndex = '9999';
        const bgOverlay = document.querySelector('.background-overlay');
        if (bgOverlay) bgOverlay.style.display = 'none';
        document.getElementById('ar-instructions').innerText = 'Drehe dich, um die Anomalie zu finden!';
        document.getElementById('ar-extract-bar').style.width = '0%';
        document.getElementById('ar-extract-btn').classList.remove('ar-active');
        arCharging = false;
        arHasOrientation = false;

        arAnomalyAzimuth = Math.random() * 360;
        // Elevation nach oben verschoben, damit die Anomalie eher "am Himmel" erscheint statt
        // auf Augenhöhe (10°-45° über dem Horizont statt zufällig auch nach unten).
        arAnomalyElevation = 10 + Math.random() * 35;

        const video = document.getElementById('ar-video');
        if (video) { video.srcObject = null; video.style.filter = 'sepia(0.6) hue-rotate(-30deg) saturate(2) contrast(1.5) brightness(0.7)'; }

        initAshRain();
        initAnomalyCanvas();
        arSmoothAlpha = null;
        arSmoothBeta = null;
        updateAnomalyPosition();
        arRenderRaf = requestAnimationFrame(arRenderLoop);

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            document.getElementById('ar-instructions').innerText = 'Kamera nicht verfügbar - Demo-Modus aktiv';
        } else {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then((stream) => {
                    arStream = stream;
                    if (!video) return;
                    video.srcObject = stream;
                    video.setAttribute('playsinline', '');
                    video.muted = true;
                    video.play().then(() => {
                        overlay.style.display = 'flex';
                    }).catch(() => {
                        overlay.style.display = 'flex';
                    });
                })
                .catch(() => {
                    if (video) video.srcObject = null;
                    document.getElementById('ar-instructions').innerText = 'Kamera nicht verfügbar - Demo-Modus aktiv';
                    overlay.style.display = 'flex';
                });
        }

        arOrientationHandler = (e) => {
            let alpha = null;
            if (typeof e.webkitCompassHeading === 'number') {
                alpha = e.webkitCompassHeading;
            } else if (e.alpha !== null && e.alpha !== undefined) {
                alpha = 360 - e.alpha;
            }
            if (alpha !== null) {
                if (arSmoothAlpha === null) arSmoothAlpha = alpha;
                else arSmoothAlpha = arSmoothAlpha * 0.8 + alpha * 0.2;
                arCurrentAlpha = arSmoothAlpha;
                arHasOrientation = true;
            }
            if (e.beta !== null && e.beta !== undefined) {
                if (arSmoothBeta === null) arSmoothBeta = e.beta;
                else arSmoothBeta = arSmoothBeta * 0.8 + e.beta * 0.2;
                arCurrentBeta = arSmoothBeta;
            }
        };

        if (typeof DeviceOrientationEvent !== 'undefined') {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission().then((s) => {
                    if (s === 'granted') window.addEventListener('deviceorientation', arOrientationHandler);
                }).catch(() => {
                    window.addEventListener('deviceorientationabs', arOrientationHandler);
                });
            } else {
                window.addEventListener('deviceorientation', arOrientationHandler);
            }
        }

        const btn = document.getElementById('ar-extract-btn');
        const startCharge = (e) => {
            e.preventDefault();
            if (!btn.classList.contains('ar-active')) return;
            arCharging = true;
            arChargeStart = performance.now();
            if (typeof playBeep === 'function') playBeep(600, 0.05);
            animateCharge();
        };
        const endCharge = (e) => {
            if (e) e.preventDefault();
            if (!arCharging) return;
            arCharging = false;
            const elapsed = performance.now() - arChargeStart;
            if (elapsed >= 3000) { completeExtraction(); }
            else { document.getElementById('ar-extract-bar').style.width = '0%'; }
        };
        btn.addEventListener('mousedown', startCharge);
        btn.addEventListener('touchstart', startCharge, { passive: false });
        btn.addEventListener('mouseup', endCharge);
        btn.addEventListener('mouseleave', endCharge);
        btn.addEventListener('touchend', endCharge);
        btn.addEventListener('touchcancel', endCharge);
    }

    function arRenderLoop() {
        updateAnomalyPosition();
        arRenderRaf = requestAnimationFrame(arRenderLoop);
    }

    function updateAnomalyPosition() {
        const anomaly = document.getElementById('ar-anomaly');
        if (!anomaly) return;
        const overlay = document.getElementById('ar-mission-overlay');
        if (!overlay) return;
        const w = overlay.clientWidth || window.innerWidth;
        const h = overlay.clientHeight || window.innerHeight;
        const hint = document.getElementById('ar-direction-hint');

        let deltaAz = arAnomalyAzimuth - arCurrentAlpha;
        if (deltaAz > 180) deltaAz -= 360;
        if (deltaAz < -180) deltaAz += 360;

        const pitch = arCurrentBeta - 90;
        let deltaEl = arAnomalyElevation - pitch;

        const fovH = 60;
        const fovV = 45;
        const pxPerDegH = w / fovH;
        const pxPerDegV = h / fovV;
        let x = w / 2 + deltaAz * pxPerDegH;
        let y = h / 2 - deltaEl * pxPerDegV;

        const azVisible = Math.abs(deltaAz) < fovH / 2 + 10;
        const elVisible = Math.abs(deltaEl) < fovV / 2 + 10;
        const fullyVisible = azVisible && elVisible;

        if (fullyVisible) {
            x = Math.max(0, Math.min(w - 220, x - 110));
            y = Math.max(0, Math.min(h - 220, y - 110));
            anomaly.style.left = x + 'px';
            anomaly.style.top = y + 'px';
            anomaly.style.display = 'block';
            if (hint) hint.style.display = 'none';
        } else {
            anomaly.style.display = 'none';
            if (hint && arHasOrientation) {
                const angleRad = Math.atan2(deltaEl, deltaAz);
                const angleDeg = -angleRad * 180 / Math.PI;
                hint.style.display = 'block';
                hint.style.transform = 'translate(-50%, -50%) rotate(' + angleDeg + 'deg)';
                let label = '';
                const absAz = Math.abs(deltaAz);
                const absEl = Math.abs(deltaEl);
                if (absEl > absAz) {
                    label = deltaEl > 0 ? '↑' : '↓';
                } else {
                    label = deltaAz > 0 ? '→' : '←';
                }
                hint.innerText = label;
            }
        }

        const inCrosshair = Math.abs(deltaAz) < 10 && Math.abs(deltaEl) < 10;
        const btn = document.getElementById('ar-extract-btn');
        if (inCrosshair) {
            btn.classList.add('ar-active');
            anomaly.style.opacity = '1';
        } else {
            btn.classList.remove('ar-active');
            anomaly.style.opacity = '0.7';
            if (arCharging) {
                arCharging = false;
                document.getElementById('ar-extract-bar').style.width = '0%';
                if (typeof playBeep === 'function') playBeep(200, 0.15);
                document.getElementById('ar-instructions').innerText = 'Kurzschluss! Anomalie aus dem Fadenkreuz gedriftet.';
                setTimeout(() => { const inst = document.getElementById('ar-instructions'); if (inst) inst.innerText = 'Drehe dich, um die Anomalie zu finden!'; }, 2000);
            }
        }
    }

    function animateCharge() {
        if (!arCharging) return;
        const elapsed = performance.now() - arChargeStart;
        const pct = Math.min(100, (elapsed / 3000) * 100);
        document.getElementById('ar-extract-bar').style.width = pct + '%';
        if (pct >= 100) { completeExtraction(); return; }
        arChargeRaf = requestAnimationFrame(animateCharge);
    }

    async function completeExtraction() {
        arCharging = false;
        cancelAnimationFrame(arChargeRaf);
        document.getElementById('ar-extract-bar').style.width = '100%';
        if (typeof playBeep === 'function') playBeep(2000, 0.3);
        document.getElementById('ar-instructions').innerText = 'Extraktion erfolgreich!';

        stopArCamera();
        closeArOverlay();

        document.getElementById('mission-return-anim').style.display = 'flex';
        setTimeout(() => { document.getElementById('mission-return-bar').style.width = '100%'; }, 50);
        setTimeout(() => {
            window.applyMissionRewards(window.currentMissionType);
            document.getElementById('mission-return-anim').style.display = 'none';
            document.getElementById('mission-return-bar').style.width = '0%';
            restoreHomescreen();
            window.missionActive = false;
            window.f_start();
        }, 2200);
    }

    function stopArCamera() {
        if (arStream) { arStream.getTracks().forEach(t => t.stop()); arStream = null; }
        const video = document.getElementById('ar-video');
        if (video) video.srcObject = null;
        if (arRenderRaf) { cancelAnimationFrame(arRenderRaf); arRenderRaf = null; }
        stopAshRain();
        stopAnomalyCanvas();
        const hint = document.getElementById('ar-direction-hint');
        if (hint) hint.style.display = 'none';
    }

    function closeArOverlay() {
        document.getElementById('ar-mission-overlay').style.display = 'none';
        if (arOrientationHandler) { window.removeEventListener('deviceorientation', arOrientationHandler); window.removeEventListener('deviceorientationabs', arOrientationHandler); arOrientationHandler = null; }
        stopAshRain();
    }

    function restoreHomescreen() {
        const portal = document.querySelector('.portal-container');
        if (portal) portal.style.display = '';
        const bgOverlay = document.querySelector('.background-overlay');
        if (bgOverlay) bgOverlay.style.display = '';
        const anzeige = document.getElementById('anzeige');
        if (anzeige) anzeige.style.display = '';
        ['header', 'nav', '#xp-leiste-auto'].forEach(function(s) {
            const el = document.querySelector(s);
            if (el) el.style.display = s.includes('xp') ? 'flex' : 'block';
        });
    }

    window.cancelArMission = function() {
        if (typeof playBeep === 'function') playBeep(300, 0.15);
        window.missionActive = false;
        stopArCamera();
        closeArOverlay();
        restoreHomescreen();
        window.f_start();
    };
