
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
    let gameState = { baseData: [{x:2, y:2, type:'ZENTRALE', lvl:1}], credits: 0, materieZellen: 0, chronosZellen: 0, collectedArtifacts: [], horizonMissions: [], overdriveStartTs: null, overdriveEndTs: null, overdrivePct: 100, deadAgents: [], pendingDrop: null, userLevel: 1, agents: [], agentSystemUnlocked: false, pendingRewards: { credits: 0, materiezellen: 0, chronoszellen: 0 } };

    // ============================================================
    // AGENTEN-LOGIK: State-Machine für Bewegung, Aufgaben-Timer und Belohnungen.
    // Random-Spawning ist komplett entfernt - jeder Agent hat jetzt einen klaren,
    // nachvollziehbaren Zustand (idle / wartet in den Quartieren / arbeitet).
    // ============================================================
    const AGENT_QUARTIERE_HOURS = 1;
    const AGENT_MAX_LEVEL = 10;
    const ROOM_MAX_LEVEL = 10;
    const ROOM_LEVEL_UP_COST_MZ = 8;
    const ROOM_LEVEL_UP_COST_CREDITS = 1000;
    // Zentrale wird separat behandelt (keine Buttons), Subraum-Nexus darf nicht gelevelt werden.
    const NOT_LEVELABLE_ROOMS = ['SUBRAUM-NEXUS'];

    // Raum-Level-Skalierung (unabhängig von Agenten-Leveln!): jeder Raum in gameState.baseData
    // hat sein eigenes "lvl"-Feld, das sich per Level-Up-Popup gegen Ressourcen steigern lässt.
    function roomLevelOf(roomType) {
        const room = gameState.baseData.find(r => r.type === roomType || (roomType === 'TEMPORAL TIME FORGE' && r.type === 'VAKUUM-SCHMIEDE'));
        return room ? (room.lvl || 1) : 1;
    }
    // Credits-Räume: Menge wächst linear mit dem Raum-Level (Basis 5 -> Lvl1:5, Lvl2:10, Lvl3:15).
    function scaledCreditsAmount(baseAmount, roomLevel) { return baseAmount * roomLevel; }
    // Materiezelle-Räume: +1 alle ZWEI Level (Lvl1:1, Lvl2:1, Lvl3:2, Lvl4:2, Lvl5:3, ...).
    function scaledMaterieAmount(roomLevel) { return Math.ceil(roomLevel / 2); }
    // Reine Wartezeit-Räume (kein direkter Rohstoff-Output, z.B. Agenten-Quartiere): Dauer sinkt
    // pro Level um 3 Minuten (Lvl1: 60min, Lvl2: 57min, Lvl3: 54min, ...), mit Untergrenze.
    function scaledQuartiereHours(roomLevel) {
        const minutes = Math.max(15, 60 - (roomLevel - 1) * 3);
        return minutes / 60;
    }

    // --- Weitere raumspezifische Level-Formeln (alle mit Untergrenze gegen 0/negativ) ---
    function scaledQuantenLaborBonusPct(lvl) { return 2 + (lvl - 1) * 1; } // 2%, +1%/Lvl
    function scaledOverdrivePct(lvl) { return 50 + (lvl - 1) * (40 / 9); } // 50% -> 90% bei Lvl10
    function scaledQuantumWarpChancePct(lvl) { return 30 + (lvl - 1) * 5; } // 30% -> 75% bei Lvl10
    function scaledArchivJourneyMinutes(lvl) { return Math.max(5, 30 - (lvl - 1) * 2); }
    function scaledTechnikDeckDiscountPct(lvl) { return 5 + (lvl - 1) * 2; }
    function scaledServerHubPct(lvl) { return 10 + (lvl - 1) * 2; }
    function scaledImpulsCredits(lvl) { return 1000 + (lvl - 1) * 100; }
    function scaledImpulsMaterie(lvl) { return 2 + Math.floor((lvl - 1) / 2); }
    function scaledImpulsAgentLevelBonus(lvl) { return lvl >= 10 ? 3 : (lvl >= 5 ? 2 : 1); }
    function scaledTransformatorCostCredits(lvl) { return Math.max(500, 5000 - (lvl - 1) * 200); }
    function scaledRenaissanceSellCredits(lvl) { return 10000 + (lvl - 1) * 500; }
    function scaledThermoCredits(lvl) { return 1 + (lvl - 1) * 4; }
    function scaledKinetikXP(lvl) { return 5 * lvl; }
    function scaledMaterieDekompressor(lvl) { return lvl >= 10 ? 3 : (lvl >= 5 ? 2 : 1); }
    function scaledForgeMissionMinutesReduction(lvl) { return (lvl - 1) * 10; } // von 480min abgezogen
    function scaledResonanzPct(lvl) { return 5 + (lvl - 1) * 1; }
    function scaledKybernetikMeters(lvl) { return 2 + Math.floor((lvl - 1) / 2); }
    function scaledScannerMinutes(lvl) { return Math.max(60, 1440 - (lvl - 1) * 30); }
    function scaledDekontamMinutes(lvl) { return Math.max(5, 60 - (lvl - 1) * 2); }
    function scaledAnomaliePct(lvl) { return 5 + (lvl - 1) * 1.5; }
    function scaledKryoDepotBonus(lvl) { return 3 + Math.floor((lvl - 1) / 2); }
    function scaledHorizonMinutes(lvl) { return Math.max(5, 30 - (lvl - 1) * 1); }
    function scaledKiKernmatrixMinutes(lvl) { return Math.max(30, 480 - (lvl - 1) * 6); }
    function scaledKiKernmatrixAgentLevelBonus(lvl) { return lvl >= 10 ? 2 : 1; }

    const AGENT_TASK_ROOMS = {
        'SCANNER-PHALANX':      { hours: 24, effect: 'spawn_agent' },
        'KI-KERNMATRIX':        { hours: 8, effect: 'level_up' },
        'FLUX-REAKTOR':         { hours: 1, effect: 'credits', amount: 5 },
        'MATERIE-DEKOMPRESSOR':{ hours: 8, effect: 'materiezelle', amount: 1 },
        'KINETIK-LABOR':        { hours: 1, effect: 'player_xp', amount: 5 },
        // Höchstes Risiko: 20min Zyklus, 50% Chance den Agenten dauerhaft zu verlieren -
        // Sonderbehandlung direkt in tickAgents(), da applyAgentReward() kein Löschen kennt.
        'IMPULS-KONDENSATOR':   { hours: 20 / 60, effect: 'life_risk' },
        // Nur der Starter-Agent darf hier arbeiten (siehe moveAgentTo).
        'OSZILLATIONS-KAMMER':  { hours: 15, effect: 'materiezelle', amount: 1 },
        // Erzeugt kein direktes Ressourcen-Reward, sondern den aktuellen Zeitreise-Auftrag
        // (Ziel-Jahr + Briefing) - Sonderbehandlung in applyAgentReward().
        'FUNK-RELAIS "HORIZONT"': { hours: 0.5, effect: 'horizon_mission' },
        // Globaler Speed-Boost für 1h (siehe overdriveBonusMs) - eigene Sonderbehandlung, da
        // der Effekt sich NICHT auf den eigenen Zyklus, sondern auf alle ANDEREN Timer bezieht.
        'HOCHSPANNUNGS-VERTEILER': { hours: 1, effect: 'overdrive' },
        // Nur nutzbar bei aktivem Horizont-Auftrag - Sonderbehandlung in moveAgentTo() und
        // applyAgentReward().
        'PARADOXON-FILTER':       { hours: 5 / 60, effect: 'quantum_warp' },
        // Läuft ZUSÄTZLICH zur eigenen (immer aktiven) passiven Credit-Produktion - siehe
        // tickPassiveRooms(). Ein Raum kann beides gleichzeitig sein.
        'SUBRAUM-NEXUS':          { hours: 3, effect: 'materiezelle', amount: 1 }
    };

    // Globales Agenten-Limit: Basis 8 (Agent #1 + 7 reguläre), +Kryo-Depot-Bonus (skaliert mit
    // dessen Raum-Level - siehe scaledKryoDepotBonus).
    const AGENT_BASE_LIMIT = 8;
    function getAgentLimit() {
        const kryoRoom = gameState.baseData.find(r => r.type === 'KRYO-DEPOT');
        return AGENT_BASE_LIMIT + (kryoRoom ? scaledKryoDepotBonus(kryoRoom.lvl || 1) : 0);
    }

    // System-Overdrive (Hochspannungs-Verteiler): während des Fensters [overdriveStartTs,
    // overdriveEndTs] läuft für ALLE ANDEREN Agenten-Timer die Zeit doppelt so schnell - siehe
    // overdriveBonusMs(), das die reale Overlap-Dauer als Bonus-Zeit addiert.
    function overdriveBonusMs(taskStartTs, now) {
        if (!gameState.overdriveStartTs || !gameState.overdriveEndTs) return 0;
        const overlapStart = Math.max(taskStartTs, gameState.overdriveStartTs);
        const overlapEnd = Math.min(now, gameState.overdriveEndTs);
        const pct = (gameState.overdrivePct !== undefined && gameState.overdrivePct !== null) ? gameState.overdrivePct : 100;
        return Math.max(0, overlapEnd - overlapStart) * (pct / 100);
    }
    function effectiveElapsed(taskStartTs, now) {
        return (now - taskStartTs) + overdriveBonusMs(taskStartTs, now);
    }

    // Kreative Sci-Fi-Aufträge für das Funk-Relais "Horizont" - kombiniert mit einem Zieljahr,
    // das immer mindestens 30 Jahre in der Zukunft oder Vergangenheit liegt.
    const HORIZON_BRIEFINGS = [
        'Behebe eine temporale Anomalie', 'Sichere ein zeitverlorenes Artefakt',
        'Stabilisiere einen kollabierenden Zeitstrom', 'Verhindere eine Paradox-Kaskade',
        'Untersuche ein anomales Chronosignal', 'Berge Daten aus einem havarierten Zeitschiff',
        'Neutralisiere einen Temporal-Parasiten', 'Kartiere eine unbekannte Zeitlinie',
        'Rette eine gestrandete Expedition', 'Extrahiere eine Quantenspur',
        'Kalibriere einen Zeit-Leuchtturm', 'Verfolge eine Signatur aus einer Alternativ-Zeitlinie'
    ];
    function generateHorizonMission() {
        const briefing = HORIZON_BRIEFINGS[Math.floor(Math.random() * HORIZON_BRIEFINGS.length)];
        const currentYear = new Date().getFullYear();
        const direction = Math.random() < 0.5 ? -1 : 1;
        const offset = 30 + Math.floor(Math.random() * 200); // mind. 30, bis zu 230 Jahre
        const year = currentYear + direction * offset;
        return { id: 'horizon_' + Date.now() + '_' + Math.floor(Math.random() * 1000), briefing: briefing, year: String(year) };
    }


    // Passive Räume: laufen automatisch im Hintergrund, sobald gebaut - kein Agent nötig.
    // "text" ist die Kurzbeschreibung in der Raum-Sidebar (siehe agentRoomInfoText).
    // 40 sammelbare Artefakte für den Zeitreise-Kreislauf (Forge -> Dekontaminationsschleuse ->
    // Artefakt-Archiv). Jedes wird höchstens einmal vergeben; ist die Liste komplett, entfällt
    // die Artefakt-Chance und es gibt nur noch Chronos-Zellen (siehe resolveArchivReward()).
    // "name" bleibt der stabile Schlüssel für gameState.collectedArtifacts (Rückwärtskompatibel
    // zu bereits gesammelten Artefakten aus der Zeit vor Jahr/Story).
    const ARTEFAKTE = [
        { icon: '⏱', name: '⏱ Verrostete Taschenuhr, 19. Jhd.', year: '1887', story: 'Geborgen aus einem eingestürzten Bergwerksschacht. Gehörte einem Eisenbahningenieur, der spurlos verschwand, nachdem er von einer "Zeitverwerfung im Tunnel IV" berichtet hatte.' },
        { icon: '🧭', name: '🧭 Quantenverschränkter Kompass', year: '2214', story: 'Navigationsprototyp einer frühen interstellaren Expedition. Die Nadel zeigt nicht nach Norden, sondern immer auf ihr verschränktes Zwillingsgerät - egal, in welcher Zeit sich dieses gerade befindet.' },
        { icon: '🗺', name: '🗺 Holo-Sternenkarten-Fragment', year: '3042', story: 'Bruchstück einer holografischen Sternenkarte aus dem Archiv eines Kolonieschiffs. Die abgebildeten Sternbilder entsprechen keinem bekannten Nachthimmel.' },
        { icon: '📜', name: '📜 Pergament mit unlesbarer Zukunftsschrift', year: '2670', story: 'Gefunden in einem versiegelten Tresor. Linguisten konnten eine Schrift nicht übersetzen, die laut Materialdatierung noch gar nicht erfunden wurde.' },
        { icon: '🪙', name: '🪙 Antigravitations-Münze', year: '2450', story: 'Souvenir-Währung eines schwebenden Stadtstaates. Schwebt bis heute wenige Millimeter über jeder Oberfläche, auf die man sie legt.' },
        { icon: '💾', name: '💾 Fossilierter Datenkristall', year: '2510', story: 'Ein Speicherkristall, über Jahrhunderte in einem bernsteinartigen Harz fossiliert. Lesbare Fragmente deuten auf die letzte Übertragung einer untergegangenen Zivilisation hin.' },
        { icon: '🎖', name: '🎖 Römische Legionärs-Plakette', year: '79 n. Chr.', story: 'Geborgen nahe Pompeji, Minuten bevor der Vesuv ausbrach. Der Agent kam mit knapper Not und der Plakette zurück.' },
        { icon: '🧬', name: '🧬 Nano-Schwarm-Kokon (inaktiv)', year: '2390', story: 'Ruhender Nanoschwarm aus einem gescheiterten Terraforming-Projekt. Laut Missionsprotokoll besser deaktiviert zu lassen.' },
        { icon: '📿', name: '📿 Flüssigmetall-Amulett', year: '2530', story: 'Zeremonieller Schmuck, der beim Tragen leicht die Form verändert. Herkunftskultur unbekannt, vermutlich post-menschlich.' },
        { icon: '⚱', name: '⚱ Ägyptisches Kanopen-Fragment', year: '1300 v. Chr.', story: 'Bruchstück eines Kanopenkrugs aus dem Neuen Reich. Die Hieroglyphen erwähnen einen "Wächter der Zeit", von dem sonst keine Aufzeichnung existiert.' },
        { icon: '🎴', name: '🎴 Photonen-Fächer', year: '2610', story: 'Zeremonieller Fächer, der Lichtmuster projiziert. Wurde bei einem Fest zu Ehren einer Sonne verwendet, die noch gar nicht zur Nova geworden ist.' },
        { icon: '📓', name: '📓 Verkohltes Logbuch eines Zeitschiffs', year: '2199', story: 'Der letzte Eintrag bricht mitten im Satz ab: "Koordinaten instabil, wir sind-"' },
        { icon: '💎', name: '💎 Kristallisierte Sternennebel-Probe', year: '2800', story: 'Soll ein komprimiertes Fragment eines echten Nebels enthalten. Leuchtet schwach, sobald der Raum dunkel wird.' },
        { icon: '⚙', name: '⚙ Viktorianische Zahnradbrosche', year: '1889', story: 'Stammt aus einer Uhrmacher-Gilde. Die winzigen Zahnräder drehen sich bis heute von selbst - nach einer Zeit, die nicht mit unserer übereinstimmt.' },
        { icon: '🖋', name: '🖋 Selbstschreibende Feder', year: '1921', story: 'Geborgen aus dem Séance-Salon eines Mediums. Schreibt gelegentlich noch immer Bruchstücke von Ereignissen, die noch nicht geschehen sind.' },
        { icon: '🕳', name: '🕳 Miniatur-Wurmloch-Generator (deaktiviert)', year: '2777', story: 'Tischgroßer Prototyp, deaktiviert nachdem ein Laborunfall einen ganzen Korridor in sich selbst gefaltet hat.' },
        { icon: '⚔', name: '⚔ Samurai-Klingenscherbe', year: '1600', story: 'Splitter einer Klinge, die angeblich während einer Sonnenfinsternis geschmiedet wurde. Die Schneide wird bis heute nicht stumpf.' },
        { icon: '🐛', name: '🐛 Bio-lumineszentes Insekt in Bernstein', year: 'vor 40 Mio. Jahren', story: 'Ein leuchtendes Insekt, perfekt im Bernstein konserviert - von einer Art, die in keinem bekannten Fossilbericht auftaucht.' },
        { icon: '📡', name: '📡 Verzerrtes Echo-Modul', year: '2455', story: 'Kommunikationsrelais, das immer noch dasselbe verzerrte Notsignal wiederholt - Jahrzehnte, nachdem das Ursprungsschiff verschwand.' },
        { icon: '🪨', name: '🪨 Steinzeitliches Feuerstein-Werkzeug', year: '12.000 v. Chr.', story: 'Gefunden in einer Höhle neben Felsmalereien, die verblüffend genau die Expedition zeigen, die es später entdecken würde.' },
        { icon: '🔭', name: '🔭 Gravitations-Linsen-Splitter', year: '2690', story: 'Fragment der Gravitationslinse eines Observatoriums. Verbiegt bis heute minimal das Licht in seiner Umgebung.' },
        { icon: '💿', name: '💿 Schallplatte einer unbekannten Zivilisation', year: '2340', story: 'Trieb in einem Trümmerfeld. Die Aufnahme spielt ein Lied in keiner bekannten Sprache - und klingt trotzdem seltsam vertraut.' },
        { icon: '💍', name: '💍 Chronometrischer Ring', year: '2280', story: 'Ein Verlobungsring, der leise einen Countdown zu einem Ereignis mitzählt, über das keiner der beiden Träger je gesprochen hat.' },
        { icon: '⏲', name: '⏲ Dampfbetriebene Taschenmechanik', year: '1863', story: 'Ein tragbarer Dampfautomat, für den nie ein Patent eingereicht wurde - obwohl die Bauweise ihrer Zeit weit voraus war.' },
        { icon: '🚀', name: '🚀 Astronauten-Anstecknadel (Mission unbekannt)', year: '2071', story: 'Missionsabzeichen ohne passenden Flug in irgendeinem Archiv - als wäre die Mission selbst gelöscht worden.' },
        { icon: '💳', name: '💳 Interdimensionale Visitenkarte', year: '2500er', story: 'Nennt einen Namen, einen Titel und Koordinaten, die in diesem Universum auf keinen Ort verweisen.' },
        { icon: '⚡', name: '⚡ Versteinerter Blitzschlag', year: '1740', story: 'Ein Blitzeinschlag so gewaltig, dass Augenzeugen schworen, kurz eine zweite Sonne am Himmel gesehen zu haben.' },
        { icon: '🌱', name: '🌱 Terraforming-Samenkapsel', year: '2610', story: 'Ruhende Samenkapsel, ausgelegt für ein ganzes Ökosystem. Laut Scan noch immer keimfähig.' },
        { icon: '🏴‍☠️', name: '🏴‍☠️ Piraten-Dublone mit Zeitstempel', year: '1715', story: 'Eine Golddublone mit eingraviertem Datum - das zum Zeitpunkt der Prägung noch gar nicht existierte.' },
        { icon: '🧠', name: '🧠 Neuronales Erinnerungsfragment', year: '2495', story: 'Ein konserviertes Erinnerungsfragment. Beim Abspielen zeigte es dem Agenten kurz den letzten Gedanken einer fremden Person.' },
        { icon: '🕯', name: '🕯 Mittelalterliches Wachssiegel', year: '1350', story: 'Siegel eines Klosters, das laut allen Aufzeichnungen ein Jahrhundert vor der Herstellung dieses Wachses bereits abgebrannt war.' },
        { icon: '🔮', name: '🔮 Plasma-Kompressions-Kugel', year: '2620', story: 'Energiespeicher-Kugel aus einem gescheiterten Fusionsexperiment. Noch immer schwach warm.' },
        { icon: '⏳', name: '⏳ Sanduhr mit rückwärts fließendem Sand', year: '1790', story: 'Der Sand läuft rückwärts. Niemand, der sie benutzt hat, konnte sich einigen, welche Zeit sie eigentlich misst.' },
        { icon: '📃', name: '📃 Unübersetzte Alien-Schriftrolle', year: '2900', story: 'Geborgen von einem verlassenen Raumschiff. Jeder Übersetzungsversuch liefert eine andere Nachricht.' },
        { icon: '🤖', name: '🤖 Retro-Roboter-Spielzeugkopf', year: '1958', story: 'Ein Blechroboter-Kopf, der beim Aufziehen gelegentlich statisch verrauschte Koordinaten flüstert.' },
        { icon: '🎵', name: '🎵 Temporale Stimmgabel', year: '2410', story: 'Einmal angeschlagen, erklingt ein Ton, der schon kurz VOR dem Anschlagen zu hören scheint.' },
        { icon: '🛰', name: '🛰 Fragment eines gefallenen Satelliten', year: '2085', story: 'Trümmerteil eines Satelliten, der laut Orbitalprotokoll offiziell immer noch im Orbit kreist.' },
        { icon: '🎼', name: '🎼 Partitur aus einer Zukunft ohne Musik', year: '2760', story: 'Notenblatt aus einer Ära, die Musik abgeschafft hatte. Niemand konnte erklären, warum ausgerechnet dieses eine Blatt überdauerte.' },
        { icon: '🌀', name: '🌀 Kristallisierte Zeitschleife', year: 'unbekannt', story: 'Ein eingefrorener Splitter einer Kausalitätsschleife, mitten in der Wiederholung erstarrt. Laut Etikett nur mit Handschuhen anfassen.' },
        { icon: '🪙', name: '🪙 Uraltes Münzstück mit unbekanntem Symbol', year: 'unbekannt', story: 'Trägt ein Symbol, das älter ist als jedes bekannte Schriftsystem - dabei ist das Metall kaum zehn Jahre alt.' }
    ];
    const FORGE_MISSION_HOURS = 8;
    const FORGE_RETURN_MS = 60000;        // genau 1 Minute
    const DEKONTAM_JOURNEY_MS = 3600000;  // genau 1 Stunde
    const ARCHIV_JOURNEY_MS = 1800000;    // genau 30 Minuten

    const PASSIVE_ROOMS = {
        'THERMO-KOPPLER':          { text: 'Erzeugt automatisch 1 Credit alle 2 Stunden' },
        'TRANSFORMATOREN-STATION': { text: 'Tauschfunktion: Credits gegen Materiezelle' },
        'ANOMALIE-DETEKTOR':       { text: 'Verlangsamt den Kohärenz-Abfall bei Warnung/Instabil um 5%' },
        'QUANTEN-LABOR':           { text: '+2% Bonus auf alle XP-Belohnungen' },
        'KYBERNETIK-STATION':      { text: '+2 m GPS-Ankunftsradius, dauerhaft' },
        'RESONANZ-KAMMER':         { text: '5% Chance auf doppelten Missions-Loot' },
        'TECHNIK-DECK':            { text: '5% Rabatt auf alle Raum-Ausbaukosten' },
        'SERVER-HUB':              { text: '10% Chance, eine Warnung sofort abzufangen' },
        'KRYO-DEPOT':              { text: '+3 maximale Agenten-Plätze, dauerhaft (insgesamt 11)' },
        'RENAISSANCE-GENERATOR':   { text: 'Verkauft Chronos-Zellen gegen Credits' }
    };
    const THERMO_KOPPLER_INTERVAL_MS = 2 * 3600000; // alle 2 Stunden 1 Credit
    const SUBRAUM_NEXUS_INTERVAL_MS = 3600000; // stündlich 100 Credits, unabhängig von einem Agenten
    const ROOM_BUILD_COST_MZ = 10;

    // Formel lt. Vorgabe: Neue Dauer = Basis-Dauer * (1 - (Level - 1) * 0.05)
    // Für Admin-Accounts gilt zusätzlich ein permanenter 95%-Speed-Bonus (nur 5% der Zeit) -
    // rein zum schnelleren Testen des kompletten Agenten-/Zeitreise-Systems.
    function adminTimeFactor() { return isAdminSession ? 0.05 : 1; }
    // Der Starter-Agent bekommt permanent einen flachen 5%-Bonus ZUSÄTZLICH zur normalen
    // Level-Formel (nicht anstelle davon) - auf Level 1 also schon 5%, auf Level 2 bereits 10%.
    function agentScaledDurationMs(baseHours, level, isStarter) {
        const starterBonus = isStarter ? 0.05 : 0;
        const factor = Math.max(0.1, 1 - (level - 1) * 0.05 - starterBonus); // Untergrenze, falls Level je höher als 19 würde
        return Math.round(baseHours * 3600000 * factor * adminTimeFactor());
    }

    const AGENT_UNLOCK_COST_CREDITS = 13000;
    const AGENT_UNLOCK_COST_MZ = 50;
    const AGENT_UNLOCK_REQUIRED_LEVEL = 50;
    const AGENT_UNLOCK_REQUIRED_ROOMS = ['AGENTEN-QUARTIERE', 'SCANNER-PHALANX', 'KI-KERNMATRIX', 'FLUX-REAKTOR', 'MATERIE-DEKOMPRESSOR'];

    function ensureAgentsInitialized() {
        if (!gameState.pendingRewards || typeof gameState.pendingRewards !== 'object') {
            gameState.pendingRewards = { credits: 0, materiezellen: 0, chronoszellen: 0 };
        }
        ['credits', 'materiezellen', 'chronoszellen'].forEach(k => {
            if (typeof gameState.pendingRewards[k] !== 'number' || isNaN(gameState.pendingRewards[k])) gameState.pendingRewards[k] = 0;
        });
        if (!Array.isArray(gameState.agents)) gameState.agents = [];
        // Ohne Freischaltung existiert das gesamte Agenten-System nicht - kein automatisches Spawnen.
        if (!gameState.agentSystemUnlocked) return;
        if (gameState.agents.length === 0) {
            gameState.agents.push({
                id: 'agent_' + Date.now(),
                level: 1,
                location: 'ZENTRALE',
                state: 'idle',        // 'idle' | 'waiting_in_quartiere' | 'working'
                targetRoom: null,
                taskStartTs: null,
                taskDurationMs: null,
                // Der allererste Agent überhaupt - farblich hervorgehoben, permanenter
                // Extra-Speedbonus, und darf nie in den Impuls-Kondensator (siehe moveAgentTo)
                // damit dem Spieler nie versehentlich ALLE Agenten ausgehen können.
                isStarter: true
            });
        } else if (!gameState.agents.some(a => a.isStarter)) {
            // Migration für Speicherstände von VOR diesem Feature: keiner der bereits
            // existierenden Agenten trägt das Flag - der älteste (per id-Zeitstempel sortiert,
            // sonst schlicht der erste im Array) wird nachträglich zum Starter erklärt.
            const sorted = gameState.agents.slice().sort((a, b) => {
                const ta = parseInt((a.id || '').replace('agent_', '')) || 0;
                const tb = parseInt((b.id || '').replace('agent_', '')) || 0;
                return ta - tb;
            });
            const oldest = gameState.agents.find(a => a.id === sorted[0].id);
            if (oldest) oldest.isStarter = true;
        }
    }

    function applyAgentReward(agent, task) {
        const roomLevel = roomLevelOf(agent.location);
        if (task.effect === 'credits') {
            gameState.pendingRewards.credits += scaledCreditsAmount(task.amount, roomLevel);
        } else if (task.effect === 'materiezelle') {
            // Materie-Dekompressor hat eine eigene, gestufte Formel (Lvl1-4:1, Lvl5-9:2, Lvl10:3),
            // alle anderen Materiezelle-Räume (Oszillations-Kammer, Subraum-Nexus) nutzen weiter
            // die generische "alle zwei Level +1"-Formel.
            gameState.pendingRewards.materiezellen += (agent.location === 'MATERIE-DEKOMPRESSOR')
                ? scaledMaterieDekompressor(roomLevel)
                : scaledMaterieAmount(roomLevel);
        } else if (task.effect === 'level_up') {
            const bonus = scaledKiKernmatrixAgentLevelBonus(roomLevel);
            agent.level = Math.min(AGENT_MAX_LEVEL, agent.level + bonus);
        } else if (task.effect === 'player_xp') {
            grantPlayerXP(scaledKinetikXP(roomLevel)).catch(e => console.error('XP-Gutschrift Fehler:', e));
        } else if (task.effect === 'spawn_agent') {
            gameState.agents.push({
                id: 'agent_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                level: 1,
                location: 'SCANNER-PHALANX',
                state: 'idle',
                targetRoom: null,
                taskStartTs: null,
                taskDurationMs: null
            });
            if (typeof window.logEreignis === 'function') window.logEreignis('Neuer Agent produziert.');
        } else if (task.effect === 'horizon_mission') {
            if (!Array.isArray(gameState.horizonMissions)) gameState.horizonMissions = [];
            const mission = generateHorizonMission();
            gameState.horizonMissions.push(mission);
            if (typeof showInfoToast === 'function') showInfoToast('Funk-Relais "Horizont": Neuer Zeitreise-Auftrag empfangen - Ziel: Jahr ' + mission.year + '.');
        }
    }

    // Schreibt ganz normale Spieler-XP direkt ins selbe Firestore-Profil ("agenten"), das auch
    // das Haupt-Terminal (app.js/window.updateXP) verwendet - inklusive derselben
    // Level-Aufstiegs-Logik (100 XP = 1 Level), damit beide Systeme konsistent bleiben.
    async function grantPlayerXP(amount) {
        if (!window.db || !window.getDoc || !window.setDoc) return;
        const ref = window.doc(window.db, "agenten", window.agentSlug(currentAgentName));
        const snap = await window.getDoc(ref);
        let xp = 0, lvl = 1;
        if (snap.exists()) {
            const d = snap.data();
            xp = d.xp || 0;
            lvl = d.lvl || 1;
        }
        xp += amount;
        while (xp >= 100) { xp -= 100; lvl++; }
        await window.setDoc(ref, { xp, lvl }, { merge: true });
        gameState.userLevel = Math.max(gameState.userLevel, lvl);
        updateUI();
    }

    // Abschluss-Belohnung des Zeitreise-Kreislaufs im Artefakt-Archiv: 1-5 Chronos-Zellen
    // garantiert, plus 60% Chance auf ein neues Artefakt aus dem noch nicht gesammelten Pool.
    // Sind alle 40 Artefakte bereits gesammelt, entfällt dieser Teil komplett.
    function resolveArchivReward(agent) {
        if (!Array.isArray(gameState.collectedArtifacts)) gameState.collectedArtifacts = [];
        const chronos = 1 + Math.floor(Math.random() * 5); // 1-5
        gameState.pendingRewards.chronoszellen += chronos;

        let artifactMsg = '';
        const uncollected = ARTEFAKTE.filter(a => !gameState.collectedArtifacts.includes(a.name));
        // Kein Zufall mehr: nur wenn beim Missionsstart in der Forge exakt das aktuelle
        // Horizont-Zieljahr eingegeben wurde (agent.artifactEligible, siehe startForgeJourney),
        // gibt es überhaupt eine Chance auf ein Artefakt aus dem noch nicht gesammelten Pool.
        if (agent.artifactEligible) {
            if (uncollected.length > 0) {
                const picked = uncollected[Math.floor(Math.random() * uncollected.length)];
                gameState.collectedArtifacts.push(picked.name);
                artifactMsg = ' + Artefakt geborgen: ' + picked.name;
            } else {
                // Berechtigt, aber die Sammlung ist bereits vollständig (alle 40) - das war
                // vorher unsichtbar, jetzt wird es explizit gemeldet statt stillschweigend
                // nichts zu vergeben.
                artifactMsg = ' (Artefakt-Sammlung bereits vollständig - keins mehr übrig)';
            }
        }
        agent.artifactEligible = false;

        if (typeof showInfoToast === 'function') {
            showInfoToast('Zeitreise-Kreislauf abgeschlossen: +' + chronos + ' Chronos-Zellen' + artifactMsg);
        }
        if (typeof renderArtifactCollection === 'function') renderArtifactCollection();
    }

    // Zeigt die bisher gesammelten Artefakte als kompakte "Regalfächer" im Archiv-Panel an.
    function findArtefaktByName(name) {
        return ARTEFAKTE.find(a => a.name === name);
    }

    function renderArtifactCollection() {
        const box = document.getElementById('artifact-collection-display');
        if (!box) return;
        const collected = Array.isArray(gameState.collectedArtifacts) ? gameState.collectedArtifacts : [];
        let html = '<div style="font-size:0.7em; color:#aaa; margin-bottom:8px;">' + collected.length + ' / ' + ARTEFAKTE.length + ' gesammelt' +
            (collected.length >= ARTEFAKTE.length ? ' · Sammlung vollständig!' : '') + '</div>';
        if (collected.length === 0) {
            html += '<div style="font-size:0.7em; color:#666; font-style:italic;">Noch keine Artefakte geborgen.</div>';
        } else {
            html += '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(90px, 1fr)); gap:6px;">';
            collected.forEach(function(name) {
                html += '<div class="artifact-shelf-slot" title="' + name.replace(/"/g, '&quot;') + '" onclick="window.showArtifactDetail(\'' + name.replace(/'/g, "\\'") + '\')">' + name + '</div>';
            });
            html += '</div>';
        }
        box.innerHTML = html;
        if (typeof placeArtifactsInShelves === 'function') placeArtifactsInShelves();
    }

    // Zeigt Name, Jahr und Story eines gesammelten Artefakts in einem Popup.
    window.showArtifactDetail = function(name) {
        const a = findArtefaktByName(name);
        if (!a) return;
        const overlay = document.getElementById('artifact-detail-overlay');
        const nameEl = document.getElementById('artifact-detail-name');
        const yearEl = document.getElementById('artifact-detail-year');
        const storyEl = document.getElementById('artifact-detail-story');
        if (nameEl) nameEl.innerText = a.name;
        if (yearEl) yearEl.innerText = a.year;
        if (storyEl) storyEl.innerText = a.story;
        const listenBtn = document.getElementById('btn-schallplatte-anhoeren');
        if (listenBtn) listenBtn.style.display = a.name.includes('Schallplatte') ? 'block' : 'none';
        const audio = document.getElementById('schallplatte-audio');
        if (audio) { audio.pause(); audio.currentTime = 0; }
        if (overlay) overlay.style.display = 'flex';
    };
    window.schallplatteAnhoeren = function() {
        const audio = document.getElementById('schallplatte-audio');
        const status = document.getElementById('schallplatte-status');
        if (!audio) return;
        if (status) status.innerText = 'Lade...';
        audio.play().then(() => {
            if (status) status.innerText = '';
        }).catch(e => {
            console.error('Wiedergabe fehlgeschlagen:', e);
            if (status) status.innerText = '⚠ Wiedergabe fehlgeschlagen - Audiodatei nicht gefunden oder Format nicht unterstützt.';
        });
    };
    window.closeArtifactDetail = function() {
        const overlay = document.getElementById('artifact-detail-overlay');
        if (overlay) overlay.style.display = 'none';
        const audio = document.getElementById('schallplatte-audio');
        if (audio) audio.pause();
    };

    // Platziert die gesammelten Artefakt-Icons grafisch in den Regalfächern (.regal-fach) der
    // gebauten Archiv-Regale - verteilt auf alle vorhandenen Fächer, mehrere Icons pro Fach
    // möglich, falls mehr Artefakte als physische Fächer vorhanden sind. Jedes Icon ist
    // anklickbar und öffnet dasselbe Detail-Popup wie die Liste im Panel.
    function placeArtifactsInShelves() {
        // Nur im aktuell aktiven Container suchen (nie gemischt über kleine Vorschau UND große
        // Detailansicht hinweg - das hat die Verteilung der Icons durcheinandergebracht, siehe
        // dieselbe Ursache beim Subraum-Nexus-Fix).
        const targetId = window._roomAreaTargetId || 'room-area';
        const container = document.getElementById(targetId);
        if (!container) return;
        const collected = Array.isArray(gameState.collectedArtifacts) ? gameState.collectedArtifacts : [];

        // WICHTIG: Icons sind NUR in der echten Raum-Detailansicht ('room-area') einzeln
        // anklickbar. In der kleinen Vorschau innerhalb der Aktive-Basis-Übersicht (targetId
        // ist dort 'bunker-room-X') soll ein Klick stattdessen ganz normal zum Raum-Slot
        // durchgereicht werden, damit sich (wie beim VIP-Raum) erst die Raumansicht öffnet -
        // vorher konnte ein Klick direkt auf ein Artefakt-Icon in der Übersicht das Detail-Popup
        // öffnen, OHNE dass der Raum überhaupt betreten wurde.
        const inDetailView = (targetId === 'room-area');

        let faecher = container.querySelectorAll('.regal-fach');
        if (!faecher.length) {
            // Kein gekauftes Archiv-Regal vorhanden (das ist ein KÄUFLICHES Möbelstück, kein
            // Standard-Inventar) - Artefakte sollen aber unabhängig davon trotzdem sichtbar sein.
            // Fallback: eigener kleiner Sammel-Bereich direkt im Raum, unabhängig vom Regal-Kauf.
            let fallback = container.querySelector('#artifact-fallback-display');
            if (!fallback) {
                fallback = document.createElement('div');
                fallback.id = 'artifact-fallback-display';
                fallback.className = 'fixed-item';
                fallback.style.cssText = 'position:absolute; left:8px; bottom:8px; width:120px; display:flex; flex-wrap:wrap; gap:3px; z-index:4;';
                container.appendChild(fallback);
            }
            fallback.innerHTML = '';
            if (collected.length === 0) return;
            collected.forEach(function(name) {
                const a = findArtefaktByName(name);
                const icon = document.createElement('span');
                icon.className = 'regal-artifact-icon';
                icon.style.cssText = 'background:rgba(192,96,255,0.12); border:1px solid rgba(192,96,255,0.4); border-radius:3px; padding:2px 3px;';
                icon.textContent = a ? a.icon : '❔';
                icon.title = name;
                if (inDetailView) {
                    icon.onclick = function(ev) { ev.stopPropagation(); window.showArtifactDetail(name); };
                } else {
                    icon.style.cursor = 'default';
                    icon.style.pointerEvents = 'none';
                }
                fallback.appendChild(icon);
            });
            return;
        }

        const existingFallback = container.querySelector('#artifact-fallback-display');
        if (existingFallback) existingFallback.remove();

        faecher.forEach(f => { f.innerHTML = ''; });
        collected.forEach(function(name, i) {
            const fach = faecher[i % faecher.length];
            if (!fach) return;
            const a = findArtefaktByName(name);
            const icon = document.createElement('span');
            icon.className = 'regal-artifact-icon';
            icon.textContent = a ? a.icon : '❔';
            icon.title = name;
            if (inDetailView) {
                icon.onclick = function(ev) { ev.stopPropagation(); window.showArtifactDetail(name); };
            } else {
                icon.style.cursor = 'default';
                icon.style.pointerEvents = 'none';
            }
            fach.appendChild(icon);
        });
    }


    // Entfernt einen gestorbenen Agenten aus dem aktiven Roster, merkt ihn sich aber im
    // "Friedhof" (gameState.deadAgents) - Grundlage für die Bio-Rekonstruktions-Kapsel im
    // Subraum-Nexus, die gestorbene Agenten gegen Chronos-Zellen wiederbeleben kann.
    function killAgent(agent, diedIn) {
        if (!Array.isArray(gameState.deadAgents)) gameState.deadAgents = [];
        gameState.deadAgents.push({
            id: agent.id,
            level: agent.level,
            isStarter: !!agent.isStarter,
            diedIn: diedIn,
            diedAt: Date.now()
        });
        gameState.agents = gameState.agents.filter(a => a.id !== agent.id);
    }

    // Schickt einen Agenten automatisch zurück zur Zentrale - OHNE Umweg über die Agenten-
    // Quartiere (Ausnahme von der sonst geltenden Regel, dass jeder Raumwechsel zwingend über
    // die Quartiere läuft; das gilt nur für manuelle Umleitungen durch den Spieler). Genutzt nach
    // Abschluss eines Arbeits-Zyklus, nach dem Impuls-Kondensator/Hochspannungs-Verteiler und am
    // Ende des Zeitreise-Kreislaufs.
    function sendAgentHome(agent) {
        const oldLocation = agent.location;
        agent.targetRoom = null;
        agent.state = 'idle';
        agent.location = 'ZENTRALE';
        agent.taskStartTs = null;
        agent.taskDurationMs = null;
        if (typeof playElevatorAnimation === 'function') playElevatorAnimation(oldLocation, 'ZENTRALE', agent.isStarter, agent.id);
    }

    // Ab Level 10 (Maximum) kehrt ein Agent nach einem Zyklus NICHT zur Zentrale zurück, sondern
    // läuft über die Agenten-Quartiere (Schlafkammer) direkt wieder in denselben Raum, dem er
    // zugewiesen war - und wiederholt das automatisch, bis der Spieler ihn manuell woanders
    // hinschickt. Läuft technisch genau wie eine normale Spieler-Zuweisung ab (also inklusive
    // Quartiere-Wartezeit), nur dass Ziel = aktueller Raum ist.
    function sendAgentOnAutoLoop(agent) {
        const oldLocation = agent.location;
        agent.targetRoom = oldLocation;
        agent.state = 'waiting_in_quartiere';
        agent.location = 'AGENTEN-QUARTIERE';
        agent.taskStartTs = Date.now();
        agent.taskDurationMs = agentScaledDurationMs(scaledQuartiereHours(roomLevelOf('AGENTEN-QUARTIERE')), agent.level, agent.isStarter);
        if (typeof playElevatorAnimation === 'function') playElevatorAnimation(oldLocation, 'AGENTEN-QUARTIERE', agent.isStarter, agent.id);
    }

    // Prüft alle Agenten gegen die reale, vergangene Zeit (nicht nur gegen einen laufenden
    // Timer im Browser) - dadurch funktioniert das System auch korrekt, wenn die Seite
    // zwischenzeitlich geschlossen war und man erst Stunden später wieder reinschaut.
    function tickAgents() {
        ensureAgentsInitialized();
        if (!gameState.agentSystemUnlocked) return false;
        const now = Date.now();
        let changed = false;

        gameState.agents.forEach(agent => {
            if (agent.state === 'waiting_in_quartiere') {
                if (effectiveElapsed(agent.taskStartTs, now) >= agent.taskDurationMs) {
                    const oldLocation = agent.location;
                    agent.location = agent.targetRoom;
                    agent.targetRoom = null;
                    if (typeof playElevatorAnimation === 'function') playElevatorAnimation(oldLocation, agent.location, agent.isStarter, agent.id);
                    const task = AGENT_TASK_ROOMS[agent.location];
                    if (isForgeRoom(agent.location)) {
                        // Kein Timer - der Agent wartet hier, bis der Spieler das
                        // Zeitreise-Terminal manuell startet (siehe window.startForgeJourney).
                        agent.state = 'forge_ready';
                        agent.taskStartTs = null;
                        agent.taskDurationMs = null;
                    } else if (task) {
                        agent.state = 'working';
                        agent.taskStartTs = now;
                        // Manche Räume haben eine vom RAUM-Level abhängige Basis-Zyklusdauer
                        // (zusätzlich zur bestehenden Agenten-Level-Skalierung).
                        let baseHours = task.hours;
                        if (agent.location === 'KI-KERNMATRIX') baseHours = scaledKiKernmatrixMinutes(roomLevelOf('KI-KERNMATRIX')) / 60;
                        else if (agent.location === 'SCANNER-PHALANX') baseHours = scaledScannerMinutes(roomLevelOf('SCANNER-PHALANX')) / 60;
                        else if (agent.location === 'FUNK-RELAIS "HORIZONT"') baseHours = scaledHorizonMinutes(roomLevelOf('FUNK-RELAIS "HORIZONT"')) / 60;
                        agent.taskDurationMs = agentScaledDurationMs(baseHours, agent.level, agent.isStarter);
                        if (agent.location === 'HOCHSPANNUNGS-VERTEILER') {
                            // Overdrive-Fenster beginnt SOFORT beim Start, nicht erst am Ende.
                            const pct = scaledOverdrivePct(roomLevelOf('HOCHSPANNUNGS-VERTEILER'));
                            gameState.overdrivePct = pct;
                            gameState.overdriveStartTs = now;
                            gameState.overdriveEndTs = now + agent.taskDurationMs;
                            if (typeof showInfoToast === 'function') showInfoToast('System-Overdrive aktiviert: Alle anderen Timer laufen für die Dauer ' + Math.round(pct) + '% schneller!');
                        } else if (agent.location === 'PARADOXON-FILTER') {
                            // Der älteste aktive Horizont-Auftrag wird sofort beim Start verbraucht
                            // (FIFO), unabhängig vom späteren Erfolg des Quanten-Warps. Mehrere
                            // Aufträge können gleichzeitig bestehen - nur einer wird verbraucht.
                            if (Array.isArray(gameState.horizonMissions) && gameState.horizonMissions.length > 0) {
                                gameState.horizonMissions.shift();
                            }
                            if (typeof renderHorizonStatus === 'function') renderHorizonStatus();
                            if (typeof showInfoToast === 'function') showInfoToast('Paradoxon-Filter: Quanten-Warp initiiert - ein Horizont-Auftrag verbraucht.');
                        }
                    } else {
                        agent.state = 'idle';
                        agent.taskStartTs = null;
                        agent.taskDurationMs = null;
                    }
                    changed = true;
                }
            } else if (agent.state === 'journey_mission') {
                // 8h Zeitreise-Mission - Agent gilt als "unterwegs" (siehe renderAgentPanel/
                // renderBunkerAgentVisuals), physisch nicht in der Forge sichtbar.
                if (effectiveElapsed(agent.taskStartTs, now) >= agent.taskDurationMs) {
                    agent.state = 'journey_forge_return';
                    agent.taskStartTs = now;
                    agent.taskDurationMs = Math.round(FORGE_RETURN_MS * adminTimeFactor()); // genau 1 Minute, bewusst NICHT level-skaliert
                    changed = true;
                }
            } else if (agent.state === 'journey_forge_return') {
                if (effectiveElapsed(agent.taskStartTs, now) >= agent.taskDurationMs) {
                    const oldLocation = agent.location;
                    agent.location = 'DEKONTAMINATIONS-SCHLEUSE';
                    agent.state = 'journey_dekontam';
                    agent.taskStartTs = now;
                    agent.taskDurationMs = Math.round(scaledDekontamMinutes(roomLevelOf('DEKONTAMINATIONS-SCHLEUSE')) * 60000 * adminTimeFactor());
                    if (typeof playElevatorAnimation === 'function') playElevatorAnimation(oldLocation, agent.location, agent.isStarter, agent.id);
                    changed = true;
                }
            } else if (agent.state === 'journey_dekontam') {
                if (effectiveElapsed(agent.taskStartTs, now) >= agent.taskDurationMs) {
                    const oldLocation = agent.location;
                    agent.location = 'ARTEFAKT-ARCHIV';
                    agent.state = 'journey_archiv';
                    agent.taskStartTs = now;
                    agent.taskDurationMs = Math.round(scaledArchivJourneyMinutes(roomLevelOf('ARTEFAKT-ARCHIV')) * 60000 * adminTimeFactor());
                    if (typeof playElevatorAnimation === 'function') playElevatorAnimation(oldLocation, agent.location, agent.isStarter, agent.id);
                    changed = true;
                }
            } else if (agent.state === 'journey_archiv') {
                if (effectiveElapsed(agent.taskStartTs, now) >= agent.taskDurationMs) {
                    resolveArchivReward(agent);
                    // Erst NACH dem kompletten Kreislauf (Forge -> Dekontam -> Archiv) geht's
                    // zurück zur Zentrale - die Zwischenschritte selbst bleiben unverändert
                    // (kein Umweg über die Zentrale zwischen den einzelnen Stationen).
                    sendAgentHome(agent);
                    changed = true;
                }
            } else if (agent.state === 'working') {
                const task = AGENT_TASK_ROOMS[agent.location];
                if (!task) { agent.state = 'idle'; agent.taskStartTs = null; agent.taskDurationMs = null; return; }
                // WICHTIG: Der Hochspannungs-Verteiler bekommt bewusst KEINEN eigenen
                // Overdrive-Bonus (sonst würde er sich selbst beschleunigen) - alle anderen
                // Timer (inkl. anderer Agenten hier) nutzen effectiveElapsed().
                const elapsed = (task.effect === 'overdrive') ? (now - agent.taskStartTs) : effectiveElapsed(agent.taskStartTs, now);
                if (elapsed >= agent.taskDurationMs) {
                    if (task.effect === 'life_risk') {
                        const survived = Math.random() < 0.5;
                        if (survived) {
                            const roomLvl = roomLevelOf('IMPULS-KONDENSATOR');
                            const lvlBonus = scaledImpulsAgentLevelBonus(roomLvl);
                            agent.level = Math.min(AGENT_MAX_LEVEL, agent.level + lvlBonus);
                            const mzGain = scaledImpulsMaterie(roomLvl);
                            const creditsGain = scaledImpulsCredits(roomLvl);
                            gameState.pendingRewards.materiezellen += mzGain;
                            gameState.pendingRewards.credits += creditsGain;
                            if (typeof showInfoToast === 'function') showInfoToast('Impuls-Kondensator: Agent hat die Entladung überlebt und ist aufgestiegen! (+' + lvlBonus + ' Agentenlevel, +' + mzGain + ' MZ, +' + creditsGain + ' Credits)');
                            sendAgentHome(agent);
                        } else {
                            killAgent(agent, 'IMPULS-KONDENSATOR');
                            if (typeof showCustomAlert === 'function') showCustomAlert('Impuls-Kondensator: Agent wurde von der Entladung getötet und dauerhaft gelöscht.');
                        }
                        changed = true;
                    } else if (task.effect === 'overdrive') {
                        gameState.overdriveStartTs = null;
                        gameState.overdriveEndTs = null;
                        const survived = Math.random() < 0.5;
                        if (survived) {
                            if (typeof showInfoToast === 'function') showInfoToast('Hochspannungs-Verteiler: Agent hat den System-Overdrive überstanden.');
                            sendAgentHome(agent);
                        } else {
                            killAgent(agent, 'HOCHSPANNUNGS-VERTEILER');
                            if (typeof showCustomAlert === 'function') showCustomAlert('Hochspannungs-Verteiler: Agent wurde vom Overdrive getötet und dauerhaft gelöscht.');
                        }
                        changed = true;
                    } else if (task.effect === 'quantum_warp') {
                        const uncollected = ARTEFAKTE.filter(a => !gameState.collectedArtifacts.includes(a.name));
                        const chancePct = scaledQuantumWarpChancePct(roomLevelOf('PARADOXON-FILTER'));
                        const success = uncollected.length > 0 && Math.random() * 100 < chancePct;
                        if (success) {
                            const picked = uncollected[Math.floor(Math.random() * uncollected.length)];
                            gameState.collectedArtifacts.push(picked.name);
                            if (typeof renderArtifactCollection === 'function') renderArtifactCollection();
                        }
                        if (typeof triggerParadoxWarpEffect === 'function') triggerParadoxWarpEffect(success);
                        sendAgentHome(agent);
                        changed = true;
                    } else if (task.effect === 'spawn_agent') {
                        // Nach Abschluss eines Scanner-Phalanx-Zyklus fahren BEIDE - der
                        // arbeitende Agent UND der frisch rekrutierte - zurück zur Zentrale.
                        // Limit-Check als Sicherheitsnetz (normalerweise schon in moveAgentTo
                        // blockiert, bevor der Zyklus überhaupt startet).
                        if (gameState.agents.length >= getAgentLimit()) {
                            if (typeof showInfoToast === 'function') showInfoToast('Scanner-Phalanx: Agenten-Limit erreicht, kein neuer Agent rekrutiert.');
                            sendAgentHome(agent);
                        } else {
                            applyAgentReward(agent, task);
                            const newAgent = gameState.agents[gameState.agents.length - 1];
                            sendAgentHome(agent);
                            if (newAgent) sendAgentHome(newAgent);
                        }
                        changed = true;
                    } else {
                        // Ein Zyklus, dann automatisch zurück zur Zentrale - kein automatisches
                        // Wiederholen mehr. Ein neuer Zyklus muss vom Spieler jedes Mal bewusst
                        // durch erneutes Zuweisen gestartet werden. AUSNAHME: Ab Level 10
                        // (Maximum) läuft der Agent stattdessen automatisch über die Quartiere
                        // direkt wieder in denselben Raum, bis der Spieler ihn manuell umleitet.
                        applyAgentReward(agent, task);
                        if (agent.level >= AGENT_MAX_LEVEL) {
                            sendAgentOnAutoLoop(agent);
                        } else {
                            sendAgentHome(agent);
                        }
                        changed = true;
                    }
                }
            }
        });

        if (changed) { updateUI(); try { saveGameState(); } catch(e) {} }
        if (typeof renderAgentPanel === 'function') renderAgentPanel();
        if (typeof renderBunkerAgentVisuals === 'function' && bunkerActive) renderBunkerAgentVisuals();
        if (typeof renderForgeStatus === 'function') renderForgeStatus();
        if (typeof renderHorizonStatus === 'function') renderHorizonStatus();
        return changed;
    }

    // Analog zu tickAgents(): holt reale, seit dem letzten Tick vergangene Zeit nach (auch nach
    // längerer Abwesenheit), aktuell nur für den Thermo-Koppler (1 Credit alle 2h, passiv).
    function tickPassiveRooms() {
        if (!Array.isArray(gameState.baseData)) return false;
        let changed = false;
        const now = Date.now();
        gameState.baseData.forEach(room => {
            if (room.type === 'THERMO-KOPPLER') {
                if (!room.lastTick) { room.lastTick = now; changed = true; return; }
                let safety = 0;
                while (effectiveElapsed(room.lastTick, now) >= THERMO_KOPPLER_INTERVAL_MS && safety < 1000) {
                    gameState.pendingRewards.credits += scaledThermoCredits(room.lvl || 1);
                    room.lastTick += THERMO_KOPPLER_INTERVAL_MS;
                    changed = true;
                    safety++;
                }
            } else if (room.type === 'SUBRAUM-NEXUS') {
                if (!room.lastTick) { room.lastTick = now; changed = true; return; }
                let safety = 0;
                while (effectiveElapsed(room.lastTick, now) >= SUBRAUM_NEXUS_INTERVAL_MS && safety < 1000) {
                    gameState.pendingRewards.credits += 100;
                    room.lastTick += SUBRAUM_NEXUS_INTERVAL_MS;
                    changed = true;
                    safety++;
                }
            }
        });
        if (changed) { updateUI(); try { saveGameState(); } catch(e) {} }
        return changed;
    }

    // Startet die Umleitung eines Agenten zu einem neuen Zielraum. Führt IMMER zwingend über
    // die Agenten-Quartiere. Ein Agent in der Warte-Phase ("waiting_in_quartiere") kann NICHT
    // umgeleitet werden. Ein arbeitender Agent KANN umgeleitet werden, verliert dabei aber den
    // Fortschritt seines aktuellen, unvollständigen Zyklus (bereits gutgeschriebene Belohnungen
    // aus früheren, abgeschlossenen Zyklen bleiben selbstverständlich erhalten).
    window.moveAgentTo = function(agentId, targetType) {
        const agent = gameState.agents.find(a => a.id === agentId);
        if (!agent) return;

        if (agent.state === 'waiting_in_quartiere') {
            if (typeof showCustomAlert === 'function') showCustomAlert('Agent befindet sich in den Quartieren und kann während der Wartezeit nicht umgeleitet werden.');
            return;
        }
        if (agent.state === 'journey_mission' || agent.state === 'journey_forge_return' || agent.state === 'journey_dekontam' || agent.state === 'journey_archiv') {
            if (typeof showCustomAlert === 'function') showCustomAlert('Agent befindet sich im Zeitreise-Kreislauf und kann währenddessen nicht umgeleitet werden.');
            return;
        }
        if (agent.isStarter && targetType === 'IMPULS-KONDENSATOR') {
            if (typeof showCustomAlert === 'function') showCustomAlert('Der Starter-Agent darf den Impuls-Kondensator nicht betreten - so bleibt immer mindestens ein Agent garantiert am Leben.');
            return;
        }
        if (!agent.isStarter && targetType === 'OSZILLATIONS-KAMMER') {
            if (typeof showCustomAlert === 'function') showCustomAlert('Zugang verweigert. Nur für Agent #1.');
            return;
        }
        if (agent.isStarter && targetType === 'HOCHSPANNUNGS-VERTEILER') {
            if (typeof showCustomAlert === 'function') showCustomAlert('Der Starter-Agent darf den Hochspannungs-Verteiler nicht betreten - Schutz vor Löschung.');
            return;
        }
        if (targetType === 'PARADOXON-FILTER' && (!Array.isArray(gameState.horizonMissions) || gameState.horizonMissions.length === 0)) {
            if (typeof showCustomAlert === 'function') showCustomAlert('Paradoxon-Filter benötigt einen aktiven Zeitreise-Auftrag aus dem Funk-Relais "Horizont".');
            return;
        }
        if (targetType === 'SCANNER-PHALANX' && gameState.agents.length >= getAgentLimit()) {
            if (typeof showCustomAlert === 'function') showCustomAlert('Agenten-Limit erreicht (' + getAgentLimit() + '). Kein neuer Agent kann rekrutiert werden.');
            return;
        }
        if (agent.location === targetType && agent.state !== 'working') return;

        const oldLocation = agent.location;

        agent.targetRoom = targetType;
        agent.state = 'waiting_in_quartiere';
        agent.location = 'AGENTEN-QUARTIERE';
        agent.taskStartTs = Date.now();
        agent.taskDurationMs = agentScaledDurationMs(scaledQuartiereHours(roomLevelOf('AGENTEN-QUARTIERE')), agent.level, agent.isStarter);

        window.selectedAgentId = null;
        saveGameState();
        renderGrid();

        // Kurze, rein optische Aufzug-Fahrt vom alten Standort zu den Quartieren. Die eigentliche
        // Wartezeit wird danach durch den Agenten sichtbar IN den Quartieren dargestellt, nicht im
        // Aufzug selbst (siehe renderBunkerAgentVisuals).
        if (typeof playElevatorAnimation === 'function') playElevatorAnimation(oldLocation, 'AGENTEN-QUARTIERE', agent.isStarter, agent.id);

        if (typeof showInfoToast === 'function') showInfoToast('Agent bewegt sich in die Agenten-Quartiere.');
    };
    // Alle spawnFurniture/reloadFurniture/clearRoom-Aufrufe im ganzen Code zielen normalerweise
    // auf "#room-area" (der eine sichtbare Raum-Bildschirm). Für die Bunker-Ansicht (mehrere
    // gleichzeitig sichtbare Raum-Vorschauen) wird dieses Ziel kurzzeitig umgebogen.
    window._roomAreaTargetId = 'room-area';
    let pendingCoords = {x: 0, y: 0};

    const roomColors = {
        'ZENTRALE': '#1a0d2a', 'FLUX-REAKTOR': '#220d22', 'HOCHSPANNUNGS-VERTEILER': '#140d2a', 'QUANTEN-LABOR': '#2a0d33', 
        'PARADOXON-FILTER': '#1d0d26', 'ARTEFAKT-ARCHIV': '#170a22', 'TECHNIK-DECK': '#261033', 'AGENTEN-QUARTIERE': '#120822', 
        'SERVER-HUB': '#1f132a', 'IMPULS-KONDENSATOR': '#1c152a', 'OSZILLATIONS-KAMMER': '#251230', 'TRANSFORMATOREN-STATION': '#151025',
        'RENAISSANCE-GENERATOR': '#201515', 'THERMO-KOPPLER': '#2a1a15', 'KINETIK-LABOR': '#152530', 'MATERIE-DEKOMPRESSOR': '#2a1520',
        'VAKUUM-SCHMIEDE': '#0a1420', 'TEMPORAL TIME FORGE': '#0a1420', 'RESONANZ-KAMMER': '#201025', 'KYBERNETIK-STATION': '#15202a', 'SCANNER-PHALANX': '#1a251a',
        'DEKONTAMINATIONS-SCHLEUSE': '#1a2a1a', 'ANOMALIE-DETEKTOR': '#25152a', 'KRYO-DEPOT': '#10202a', 'FUNK-RELAIS "HORIZONT"': '#151530',
        'KI-KERNMATRIX': '#121822', 'SUBRAUM-NEXUS': '#0d0d2a'
    };

    const roomTypes = [
        { n: 'FLUX-REAKTOR', d: 'Energieerzeugung für die Basis.' }, { n: 'HOCHSPANNUNGS-VERTEILER', d: 'Stabilisiert das Stromnetz.' },
        { n: 'QUANTEN-LABOR', d: 'Ermöglicht technische Forschung.' }, { n: 'PARADOXON-FILTER', d: 'Riskanter Quanten-Warp zur Artefakt-Bergung.' },
        { n: 'ARTEFAKT-ARCHIV', d: 'Generiert passives Einkommen.' }, { n: 'TECHNIK-DECK', d: 'Rabatte auf neue Flux-Modelle.' },
        { n: 'AGENTEN-QUARTIERE', d: 'Erhöht das Personal-Limit.' }, { n: 'SERVER-HUB', d: 'Schützt vor Credit-Diebstahl.' },
        { n: 'IMPULS-KONDENSATOR', d: 'Speichert massive Energiemengen.' }, { n: 'OSZILLATIONS-KAMMER', d: 'Frequenz-Feinabstimmung.' },
        { n: 'TRANSFORMATOREN-STATION', d: 'Wandelt rohe Energie um.' }, { n: 'RENAISSANCE-GENERATOR', d: 'Strom aus Schrott.' },
        { n: 'THERMO-KOPPLER', d: 'Nutzt Erdwärme der Ödnis.' }, { n: 'KINETIK-LABOR', d: 'Erforschung von Bewegungsenergie.' },
        { n: 'MATERIE-DEKOMPRESSOR', d: 'Zerlegt Fundstücke in Rohstoffe.' }, { n: 'TEMPORAL TIME FORGE', d: 'Schmiedet die Zeit selbst - Basis für kommende Zeitmaschinen-Missionen.' },
        { n: 'RESONANZ-KAMMER', d: 'Testet übernatürliche Fähigkeiten.' }, { n: 'KYBERNETIK-STATION', d: 'Einbau von Verstärkern.' },
        { n: 'SCANNER-PHALANX', d: 'Überwacht das Gelände.' }, { n: 'DEKONTAMINATIONS-SCHLEUSE', d: 'Reinigt von Strahlung.' },
        { n: 'ANOMALIE-DETEKTOR', d: 'Warnt vor Zeitrissen.' }, { n: 'KRYO-DEPOT', d: 'Lagert seltene Proben.' },
        { n: 'FUNK-RELAIS "HORIZONT"', d: 'Erhöht die Funk-Reichweite.' }, { n: 'KI-KERNMATRIX', d: 'Zentraler künstlicher Verstand.' },
        { n: 'SUBRAUM-NEXUS', d: 'VIP-Schnittstelle - Direktkanal zur Administration.' }
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
                if (parsed.chronosZellen !== undefined) gameState.chronosZellen = parsed.chronosZellen;
                if (Array.isArray(parsed.collectedArtifacts)) gameState.collectedArtifacts = parsed.collectedArtifacts;
                if (Array.isArray(parsed.horizonMissions)) gameState.horizonMissions = parsed.horizonMissions;
                if (Array.isArray(parsed.deadAgents)) gameState.deadAgents = parsed.deadAgents;
                if (parsed.overdriveStartTs !== undefined) gameState.overdriveStartTs = parsed.overdriveStartTs;
                if (parsed.overdrivePct !== undefined) gameState.overdrivePct = parsed.overdrivePct;
                if (parsed.overdriveEndTs !== undefined) gameState.overdriveEndTs = parsed.overdriveEndTs;
                if (parsed.baseData) gameState.baseData = parsed.baseData;
                if (Array.isArray(parsed.agents)) gameState.agents = parsed.agents;
                if (parsed.agentSystemUnlocked) gameState.agentSystemUnlocked = true;
                if (parsed.pendingRewards) gameState.pendingRewards = parsed.pendingRewards;
            } catch(e) {} 
        }
        ensureAgentsInitialized();
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
                let fusedCredits = 0, fusedMz = 0, fusedChronos = 0;
                try {
                    const agentSnap = await window.getDoc(window.doc(window.db, "agenten", window.agentSlug(currentAgentName)));
                    if (agentSnap.exists()) {
                        const ad = agentSnap.data();
                        fusedCredits = Math.max(fusedCredits, ad.credits || 0);
                        fusedMz = Math.max(fusedMz, (ad.materiezellen !== undefined ? ad.materiezellen : (ad.materialzellen || 0)));
                        fusedChronos = Math.max(fusedChronos, ad.chronoszellen || 0);
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
                    if (Array.isArray(data.agents)) gameState.agents = data.agents;
                    if (data.agentSystemUnlocked) gameState.agentSystemUnlocked = true;
                    if (Array.isArray(data.collectedArtifacts)) gameState.collectedArtifacts = data.collectedArtifacts;
                    if (Array.isArray(data.horizonMissions)) gameState.horizonMissions = data.horizonMissions;
                    if (Array.isArray(data.deadAgents)) gameState.deadAgents = data.deadAgents;
                    gameState.pendingDrop = data.pendingDrop || null;
                    if (data.overdriveStartTs !== undefined) gameState.overdriveStartTs = data.overdriveStartTs;
                    if (data.overdrivePct !== undefined) gameState.overdrivePct = data.overdrivePct;
                    if (data.overdriveEndTs !== undefined) gameState.overdriveEndTs = data.overdriveEndTs;
                    if (data.pendingRewards) gameState.pendingRewards = data.pendingRewards;
                }
                gameState.credits = fusedCredits;
                gameState.materieZellen = fusedMz;
                gameState.chronosZellen = fusedChronos;
                ensureAgentsInitialized();
                // Reale, seit dem letzten Speichern vergangene Zeit sofort nachholen (auch wenn
                // die Seite zwischenzeitlich Stunden geschlossen war).
                tickAgents();
                tickPassiveRooms();

                // Fusionierten Stand sofort zurück in die kanonische Quelle ("agenten") schreiben.
                try {
                    await window.setDoc(window.doc(window.db, "agenten", window.agentSlug(currentAgentName)), {
                        credits: fusedCredits, materiezellen: fusedMz, chronoszellen: fusedChronos
                    }, { merge: true });
                } catch(e) { console.error("Fusions-Speicherfehler:", e); }
                
                localStorage.setItem(localKey, JSON.stringify(gameState));
                updateUI(); renderGrid();
                // Inventar erst NACH abgeschlossener Credits-Fusion nachladen (nicht mehr per
                // festem 1s-Timer, der bei langsameren Verbindungen zu früh feuern konnte).
                if (typeof window.loadInventoryFromCloud === 'function') window.loadInventoryFromCloud();
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
        d.chronosZellen = gameState.chronosZellen;
        d.horizonMissions = gameState.horizonMissions;
        d.deadAgents = gameState.deadAgents;
        d.overdriveStartTs = gameState.overdriveStartTs;
        d.overdrivePct = gameState.overdrivePct;
        d.overdriveEndTs = gameState.overdriveEndTs;
        d.lvl = gameState.userLevel; 
        localStorage.setItem(mainProfileKey, JSON.stringify(d));

        // Credits/Materiezellen/Chronos-Zellen gehen jetzt in die kanonische Quelle "agenten"
        // (fusioniert, s.o.). "Agent - Base" speichert nur noch die Raum-/Grid-Daten (keine
        // Währungen mehr).
        if (window.db && window.setDoc) {
            try {
                await window.setDoc(window.doc(window.db, "agenten", window.agentSlug(currentAgentName)), {
                    credits: gameState.credits, materiezellen: gameState.materieZellen, chronoszellen: gameState.chronosZellen
                }, { merge: true });

                const baseRef = window.doc(window.db, "Agent - Base", window.agentSlug(currentAgentName));
                await window.setDoc(baseRef, {
                    baseData: gameState.baseData,
                    agents: gameState.agents,
                    agentSystemUnlocked: gameState.agentSystemUnlocked,
                    collectedArtifacts: gameState.collectedArtifacts,
                    horizonMissions: gameState.horizonMissions,
                    deadAgents: gameState.deadAgents,
                    overdriveStartTs: gameState.overdriveStartTs,
                    overdrivePct: gameState.overdrivePct,
                    overdriveEndTs: gameState.overdriveEndTs,
                    pendingRewards: gameState.pendingRewards,
                    letztesUpdate: new Date().toISOString()
                }, { merge: true });
            } catch (e) { console.error("Cloud-Speicherfehler:", e); }
        }
    }

    function updateUI() {
        document.getElementById('display-credits').innerText = gameState.credits;
        document.getElementById('display-mz').innerText = gameState.materieZellen;
        const chz = document.getElementById('display-chronos'); if (chz) chz.innerText = gameState.chronosZellen;
        document.getElementById('display-level').innerText = gameState.userLevel;
        const c2 = document.getElementById('display-credits-2'); if (c2) c2.innerText = gameState.credits;
        const m2 = document.getElementById('display-mz-2'); if (m2) m2.innerText = gameState.materieZellen;
        const chz2 = document.getElementById('display-chronos-2'); if (chz2) chz2.innerText = gameState.chronosZellen;
        const l2 = document.getElementById('display-level-2'); if (l2) l2.innerText = gameState.userLevel;
    }

    function renderGrid() {
        // Absicherung: eine komplett leere baseData würde ein leeres, nicht mehr bedienbares
        // Gitter ergeben (kein Raum, kein "+"-Button zum Bauen). Zentrale wird notfalls wieder
        // eingesetzt, statt den Spieler mit einer leeren Basis dastehen zu lassen.
        if (!Array.isArray(gameState.baseData) || gameState.baseData.length === 0) {
            gameState.baseData = [{x:2, y:2, type:'ZENTRALE', lvl:1}];
        }
        const grid = document.getElementById('base-grid'); if(!grid) return;
        grid.innerHTML = '';
        // Gitter ist 7x7 (49 Zellen) - bei 5x5 (25) war mit inzwischen 25 verschiedenen
        // Raumtypen (inkl. Zentrale) buchstäblich kein Platz mehr für weitere Räume übrig.
        for (let y = 0; y < 7; y++) {
            for (let x = 0; x < 7; x++) {
                const slot = document.createElement('div'); slot.className = 'room-slot';
                slot.style.gridColumn = x + 1; slot.style.gridRow = y + 1;
                const room = gameState.baseData.find(r => r.x === x && r.y === y);
                const isNeighbor = gameState.baseData.some(r => (Math.abs(r.x-x)===1 && r.y===y) || (Math.abs(r.y-y)===1 && r.x===x));
                if (room) {
                    slot.classList.add('room-active'); slot.style.backgroundColor = roomColors[room.type] || '#1a0a2a';
                    slot.innerHTML = `<b>${roomDisplayName(room.type)}</b>${room.type !== 'ZENTRALE' ? '<br><small>LVL '+room.lvl+'</small>' : ''}`;
                    slot.onclick = () => { playBeepBase(1200, 0.05); openRoom(room.type); };
                    slot.style.display = 'flex';
                } else if (isNeighbor) {
                    slot.classList.add('room-buildable'); slot.innerHTML = '<span>+</span>';
                    slot.dataset.buildable = '1';
                    slot.style.display = 'flex'; slot.onclick = () => { playBeepBase(900, 0.05); buyRoom(x, y); };
                }
                grid.appendChild(slot);
            }
        }
    }

    // Technik-Deck: Rabatt auf die Ausbaukosten für Räume, skaliert mit dessen Raum-Level
    // (siehe scaledTechnikDeckDiscountPct), immer zugunsten des Spielers abgerundet.
    function getRoomBuildCostMZ() {
        const technikRoom = gameState.baseData.find(r => r.type === 'TECHNIK-DECK');
        if (!technikRoom) return ROOM_BUILD_COST_MZ;
        const discountPct = scaledTechnikDeckDiscountPct(technikRoom.lvl || 1);
        return Math.max(1, Math.floor(ROOM_BUILD_COST_MZ * (1 - discountPct / 100)));
    }

    window.buyRoom = (x, y) => {
        pendingCoords = {x, y}; const list = document.getElementById('selection-list-container');
        list.innerHTML = ''; const reqLvl = gameState.baseData.length * 3;
        const levelI = document.getElementById('next-room-level-info');
        levelI.innerText = gameState.userLevel < reqLvl ? `Sperre: Level ${reqLvl} benötigt!` : `Bereit für Ausbau (Level ${reqLvl})`;
        const mzBalEl = document.getElementById('selection-mz-balance');
        if (mzBalEl) mzBalEl.innerText = gameState.materieZellen;
        const chronosBalEl = document.getElementById('selection-chronos-balance');
        if (chronosBalEl) chronosBalEl.innerText = gameState.chronosZellen;
        const buildCost = getRoomBuildCostMZ();
        const SUBRAUM_NEXUS_COST_CHRONOS = 75;
        // Subraum-Nexus ist der "Abschluss-Raum": erst baubar, wenn alle anderen Raumtypen
        // bereits besitzt werden.
        const otherRoomTypes = roomTypes.filter(r => r.n !== 'SUBRAUM-NEXUS').map(r => r.n);
        const missingRooms = otherRoomTypes.filter(n => !gameState.baseData.some(r => r.type === n));
        roomTypes.forEach(room => {
            const built = gameState.baseData.some(r => r.type === room.n);
            const isNexus = room.n === 'SUBRAUM-NEXUS';
            const nexusLocked = isNexus && missingRooms.length > 0;
            const item = document.createElement('div'); item.className = 'selection-item';
            if (isNexus) item.style.border = '1px solid #ffd700';
            if (built || gameState.userLevel < reqLvl) { item.style.opacity = '0.3'; item.style.pointerEvents = 'none'; }
            else if (nexusLocked) {
                // Bewusst NICHT deaktiviert: Klick bleibt möglich, zeigt aber eine erklärende
                // Fehlermeldung statt einfach nichts zu tun.
                item.style.opacity = '0.55'; item.style.cursor = 'pointer';
                item.onclick = () => { if (typeof showCustomAlert === 'function') showCustomAlert('Subraum-Nexus benötigt zuerst alle anderen Räume (noch ' + missingRooms.length + ' fehlend).'); };
            }
            else { item.onclick = () => confirmRoomSelection(room.n); }
            const priceLabel = isNexus
                ? '<span style="float:right; color:#c060ff; font-weight:bold;">' + SUBRAUM_NEXUS_COST_CHRONOS + ' Chronos-Zellen</span>'
                : '<span style="float:right; color:#0f8; font-weight:bold;">' + buildCost + ' MZ</span>';
            const nameLabel = isNexus ? '<b style="color:#ffd700; text-shadow:0 0 6px rgba(255,215,0,0.6);">[ ' + room.n + ' ]</b>' : `<b>[ ${room.n} ]</b>`;
            const lockHint = (gameState.userLevel < reqLvl && !built) ? '<span class="level-lock-hint">Benötigt Lvl '+reqLvl+'</span>'
                : (nexusLocked ? '<div style="font-size:0.65em; color:#ff8800; margin-top:4px;">Benötigt zuerst alle ' + otherRoomTypes.length + ' anderen Räume (noch ' + missingRooms.length + ' fehlend)</div>' : '');
            item.innerHTML = `${nameLabel} ${priceLabel}<br><small>${room.d}</small>${lockHint}`;
            list.appendChild(item);
        });
        document.getElementById('room-selection-overlay').style.display = 'flex';
    };

    window.hideRoomMenu = () => { playBeepBase(600, 0.05); document.getElementById('room-selection-overlay').style.display = 'none'; };

    window.confirmRoomSelection = async (type) => {
        if (type === 'SUBRAUM-NEXUS') {
            const otherRoomTypes = roomTypes.filter(r => r.n !== 'SUBRAUM-NEXUS').map(r => r.n);
            const missingRooms = otherRoomTypes.filter(n => !gameState.baseData.some(r => r.type === n));
            if (missingRooms.length > 0) {
                hideRoomMenu();
                if (typeof showCustomAlert === 'function') showCustomAlert('Subraum-Nexus benötigt zuerst alle anderen Räume (noch ' + missingRooms.length + ' fehlend).');
                return;
            }
            const cost = 75;
            if (gameState.chronosZellen >= cost) {
                gameState.chronosZellen -= cost;
                gameState.baseData.push({x: pendingCoords.x, y: pendingCoords.y, type: type, lvl: 1, lastTick: Date.now()});
                updateUI(); renderGrid(); hideRoomMenu(); await saveGameState();
                if (typeof window.logEreignis === 'function') window.logEreignis(roomDisplayName(type) + ' gebaut.');
            } else { hideRoomMenu(); if (typeof showCustomAlert === 'function') showCustomAlert("System: Nicht genügend Chronos-Zellen (75 benötigt)."); }
            return;
        }
        const buildCost = getRoomBuildCostMZ();
        if (gameState.materieZellen >= buildCost) {
            gameState.materieZellen -= buildCost;
            gameState.baseData.push({x: pendingCoords.x, y: pendingCoords.y, type: type, lvl: 1, lastTick: Date.now()});
            updateUI(); renderGrid(); hideRoomMenu(); await saveGameState();
            if (typeof window.logEreignis === 'function') window.logEreignis(roomDisplayName(type) + ' gebaut.');
        } else { hideRoomMenu(); if (typeof showCustomAlert === 'function') showCustomAlert("System: Nicht genügend Materie-Zellen."); }
    };

    window.cheatCredits = async () => {
        if (!isAdminSession) return; // Zusätzliche Absicherung, falls der Button per Konsole wieder eingeblendet wird
        playBeepBase(2000, 0.1); 
        gameState.credits += 50000; 
        gameState.materieZellen += 100;
        updateUI(); renderGrid(); await saveGameState();
    };

    // --- AKTIVE BASIS: Bunker-Querschnitt mit Aufzug ---
    // Reihenfolge der Stockwerke = Kaufreihenfolge. ZENTRALE ist immer das oberste Gebäude.
    // gameState.baseData ist bereits implizit in Kaufreihenfolge, da neue Räume beim Kauf
    // immer per push() ans Ende des Arrays angehängt werden (siehe confirmRoomSelection) -
    // ein separates Kaufdatum-Feld ist dafür nicht nötig, die Array-Reihenfolge IST das Datum.
    //
    // Jedes Stockwerk zeigt den ECHTEN Raum (Wände + tatsächlich gekaufte, echt animierte
    // Möbel), nicht nur einen Textnamen. Das funktioniert, indem spawnFurniture/reloadFurniture
    // (die überall im Code auf "document.getElementById('room-area')" fest verdrahtet waren,
    // s.o. die Umstellung auf window._roomAreaTargetId) kurzzeitig auf den jeweiligen
    // Stockwerk-Container umgeleitet werden.
    const BUNKER_FLOOR_HEIGHT = 128;
    const BUNKER_PREVIEW_SCALE = 0.46;
    const BUNKER_MAX_RIDERS = 3;
    const BUNKER_MAX_PER_FLOOR = 2;

    let bunkerFloorsData = [];       // [{type, lvl}] in Anzeige-Reihenfolge
    let bunkerActive = false;

    function bunkerFloorIndexForType(type) {
        return bunkerFloorsData.findIndex(r => r.type === type);
    }

    // Zeigt den Aufzug/die Agenten-Abzeichen exakt so, wie der ECHTE Agenten-Zustand
    // (gameState.agents) gerade ist - keine eigenständige Zufalls-Animation mehr. Der Aufzug
    // fährt nur, wenn ein Agent tatsächlich per Befehl unterwegs ist (state=waiting_in_quartiere),
    // ansonsten steht er dort, wo der zuletzt aktive Agent sich gerade befindet.
    let bunkerElevatorAnimating = false;
    // Verfolgt, WELCHE Agenten gerade eine Aufzug-Animation durchlaufen (nicht nur EIN globales
    // Ja/Nein) - nur diese werden beim Neu-Rendern übersprungen, alle anderen Agenten bleiben
    // normal sichtbar. Vorher hat ein einziges globales Flag ALLE Agenten ausgeblendet, sobald
    // irgendeiner unterwegs war.
    let bunkerAnimatingAgentIds = new Set();
    // Warteschlange für Aufzug-Fahrten: es gibt nur EINEN Aufzug im DOM - schickt man zwei
    // Agenten kurz hintereinander los, haben sich bisher beide Animationen denselben Aufzug
    // geteilt und sich gegenseitig überschrieben (der zweite Agent wirkte dadurch, als wäre er
    // in einen "nicht existierenden" Aufzug gestiegen). Jetzt wartet eine zweite Anfrage in der
    // Warteschlange, bis die laufende Fahrt komplett abgeschlossen ist.
    let elevatorQueue = [];

    // Wiederverwendbare Aufzug-Fahrt-Animation - Ablauf: (1) Aufzug fährt zur AKTUELLEN Position
    // des Agenten, (2) steht dort GENAU 10s lang, während (3) das Männchen sichtbar aus der
    // Raummitte in den Aufzug hineinläuft (dauert 5s, läuft innerhalb der 10s Standzeit ab),
    // (4) erst nach den vollen 10s fährt der Aufzug weiter. Kein Countdown/Timer wird angezeigt.
    // Kleine anklickbare Lampe im Aufzug - rein kosmetisch, hat keine Spielmechanik-Wirkung.
    window.toggleElevatorLamp = function() {
        const lamp = document.getElementById('bunker-elevator-lamp');
        if (!lamp) return;
        lamp.classList.toggle('an');
        playBeepBase(lamp.classList.contains('an') ? 700 : 300, 0.05);
    };

    // --- SAMMEL-SYSTEM: Boni aus Agenten/passiver Raumproduktion sammeln sich hier an und
    // werden erst auf Knopfdruck gutgeschrieben. Artefakte sind ausdrücklich ausgenommen und
    // landen weiterhin direkt im Lager.
    window.openSammelSystem = function() {
        const overlay = document.getElementById('sammel-system-overlay');
        const liste = document.getElementById('sammel-system-liste');
        const btn = document.getElementById('btn-sammel-einsammeln');
        if (!overlay || !liste) return;
        const p = gameState.pendingRewards || { credits: 0, materiezellen: 0, chronoszellen: 0 };
        const hatEtwas = (p.credits > 0 || p.materiezellen > 0 || p.chronoszellen > 0);
        if (!hatEtwas) {
            liste.innerHTML = '<div style="opacity:0.6;">Noch keine Boni angesammelt.</div>';
        } else {
            let html = '';
            if (p.credits > 0) html += '<div>💰 ' + p.credits.toLocaleString('de-DE') + ' Credits</div>';
            if (p.materiezellen > 0) html += '<div>🧬 ' + p.materiezellen + ' Materiezellen</div>';
            if (p.chronoszellen > 0) html += '<div>⏳ ' + p.chronoszellen + ' Chronos-Zellen</div>';
            liste.innerHTML = html;
        }
        if (btn) btn.disabled = !hatEtwas;
        overlay.style.display = 'flex';
    };
    window.closeSammelSystem = function() {
        const overlay = document.getElementById('sammel-system-overlay');
        if (overlay) overlay.style.display = 'none';
    };
    window.belohnungEinsammeln = async function() {
        const p = gameState.pendingRewards || { credits: 0, materiezellen: 0, chronoszellen: 0 };
        if (p.credits <= 0 && p.materiezellen <= 0 && p.chronoszellen <= 0) return;
        const eingesammelt = { credits: p.credits, materiezellen: p.materiezellen, chronoszellen: p.chronoszellen };
        gameState.credits += p.credits;
        gameState.materieZellen += p.materiezellen;
        gameState.chronosZellen += p.chronoszellen;
        gameState.pendingRewards = { credits: 0, materiezellen: 0, chronoszellen: 0 };
        updateUI();
        await saveGameState();
        const teile = [];
        if (eingesammelt.credits > 0) teile.push(eingesammelt.credits + ' Credits');
        if (eingesammelt.materiezellen > 0) teile.push(eingesammelt.materiezellen + ' Materiezellen');
        if (eingesammelt.chronoszellen > 0) teile.push(eingesammelt.chronoszellen + ' Chronos-Zellen');
        if (typeof window.logEreignis === 'function') window.logEreignis('Belohnung eingesammelt: ' + teile.join(', ') + '.');
        if (typeof showInfoToast === 'function') showInfoToast('Belohnung eingesammelt: ' + teile.join(', ') + '.');
        window.openSammelSystem(); // Liste direkt aktualisiert (jetzt leer) neu anzeigen
    };

    // Verfolgt den Aufzug kontinuierlich per requestAnimationFrame, solange er per CSS-
    // Transition unterwegs ist - ein einmaliges scrollIntoView() reicht NICHT, weil die Fahrt
    // über mehrere Sekunden läuft und die Seite dabei sonst zurückbleibt, statt mitzuwandern.
    let aufzugScrollAktiv = false;
    function folgeAufzugScroll(durationMs) {
        aufzugScrollAktiv = true;
        const startZeit = performance.now();
        function schritt(jetzt) {
            if (!aufzugScrollAktiv) return;
            const car = document.getElementById('bunker-elevator-car');
            if (car) {
                const rect = car.getBoundingClientRect();
                const zielMitte = window.innerHeight / 2;
                const aktuelleMitte = rect.top + rect.height / 2;
                const delta = aktuelleMitte - zielMitte;
                if (Math.abs(delta) > 1) window.scrollBy(0, delta);
            }
            if (jetzt - startZeit < durationMs + 200) requestAnimationFrame(schritt);
            else aufzugScrollAktiv = false;
        }
        requestAnimationFrame(schritt);
    }

    function playElevatorAnimation(oldLocation, newLocation, isStarter, agentId) {
        if (!bunkerActive || typeof bunkerFloorIndexForType !== 'function') return;
        if (bunkerElevatorAnimating) {
            // Aufzug gerade beschäftigt - Anfrage einreihen, wird automatisch gestartet, sobald
            // die aktuell laufende Fahrt fertig ist (siehe finish() unten). WICHTIG: der Agent
            // wird SOFORT beim Einreihen von der normalen Anzeige ausgenommen, nicht erst wenn
            // seine Fahrt tatsächlich beginnt - sonst würde er in der Wartezeit fälschlich ganz
            // normal an seinem (im Datenmodell schon aktualisierten) Zielort mitgerendert, obwohl
            // er "eigentlich" noch auf den Aufzug wartet. Das war die Ursache für gemeldete
            // Kopien/falsch wandernde Agenten, sobald der Aufzug schon unterwegs war.
            if (agentId) bunkerAnimatingAgentIds.add(agentId);
            elevatorQueue.push({ oldLocation, newLocation, isStarter, agentId });
            if (typeof renderBunkerAgentVisuals === 'function') renderBunkerAgentVisuals();
            return;
        }
        runElevatorRide(oldLocation, newLocation, isStarter, agentId);
    }

    function runElevatorRide(oldLocation, newLocation, isStarter, agentId) {
        const car = document.getElementById('bunker-elevator-car');
        const riderSlot = document.getElementById('bunker-elevator-rider-slot');
        const newIdx = bunkerFloorIndexForType(newLocation);
        const oldIdx = bunkerFloorIndexForType(oldLocation);
        if (!car || newIdx < 0) {
            // Auch bei einem übersprungenen Versuch weiter mit der nächsten Warteschlangen-
            // Anfrage, sonst bliebe die Schlange stecken.
            if (elevatorQueue.length > 0) { const next = elevatorQueue.shift(); runElevatorRide(next.oldLocation, next.newLocation, next.isStarter, next.agentId); }
            return;
        }
        const starterClass = isStarter ? ' bunker-agent-starter' : '';

        const PICKUP_MS = 1800;   // Anfahrt zur Abholung
        const STAND_MS = 7000;    // Aufzug steht am Zielfloor - genau 7s
        const WALK_MS = 5000;     // Männchen braucht 5s von der Raummitte bis zum Aufzug
        const DEPART_MS = 2600;   // Fahrt zum eigentlichen Ziel
        const ARRIVE_MS = 500;    // kurze Pause nach Ankunft, bevor neu gerendert wird

        bunkerElevatorAnimating = true;
        if (agentId) bunkerAnimatingAgentIds.add(agentId);
        document.querySelectorAll('.bunker-agent-figure').forEach(el => el.remove());
        if (riderSlot) riderSlot.innerHTML = '';

        function setDuration(ms) { car.style.transitionDuration = (ms / 1000) + 's'; }

        function finish() {
            bunkerElevatorAnimating = false;
            if (agentId) bunkerAnimatingAgentIds.delete(agentId);
            if (typeof renderBunkerAgentVisuals === 'function') renderBunkerAgentVisuals();
            // Nächste wartende Fahrt automatisch starten, falls vorhanden.
            if (elevatorQueue.length > 0) {
                const next = elevatorQueue.shift();
                runElevatorRide(next.oldLocation, next.newLocation, next.isStarter, next.agentId);
            }
        }

        function disembark() {
            // Männchen läuft sichtbar vom Aufzug in die Raummitte hinein - Spiegelbild des
            // Einsteigens. Der Aufzug bleibt die vollen 10s stehen (wie beim Einsteigen), auch
            // wenn der Laufweg selbst nur 5s dauert.
            const roomPreview = document.getElementById('bunker-room-' + newIdx);
            if (roomPreview && riderSlot) {
                riderSlot.innerHTML = '';
                const walker = document.createElement('div');
                walker.className = 'bunker-walking-figure' + starterClass;
                walker.style.left = '0%';
                walker.innerHTML = '<div class="bunker-figure"></div>';
                roomPreview.appendChild(walker);
                requestAnimationFrame(() => { walker.style.left = '50%'; });
                setTimeout(() => { walker.remove(); }, WALK_MS);
            }
            setTimeout(finish, STAND_MS);
        }

        function depart() {
            setDuration(DEPART_MS);
            requestAnimationFrame(() => {
                car.style.top = (newIdx * BUNKER_FLOOR_HEIGHT + 8) + 'px';
                folgeAufzugScroll(DEPART_MS);
            });
            setTimeout(() => setTimeout(disembark, ARRIVE_MS), DEPART_MS);
        }

        function boardAndWait() {
            // Laufanimation: das Männchen wandert sichtbar von der Raummitte zum Aufzug.
            const roomPreview = (oldIdx >= 0) ? document.getElementById('bunker-room-' + oldIdx) : null;
            if (roomPreview) {
                const walker = document.createElement('div');
                walker.className = 'bunker-walking-figure' + starterClass;
                walker.innerHTML = '<div class="bunker-figure"></div>';
                roomPreview.appendChild(walker);
                requestAnimationFrame(() => { walker.style.left = '0%'; });
                setTimeout(() => {
                    walker.remove();
                    if (riderSlot) riderSlot.innerHTML = '<div class="bunker-figure bunker-rider' + starterClass + '"></div>';
                }, WALK_MS);
            } else {
                // Raum nicht auffindbar - Männchen erscheint direkt im Aufzug, ohne Lauf-Animation.
                if (riderSlot) riderSlot.innerHTML = '<div class="bunker-figure bunker-rider' + starterClass + '"></div>';
            }
            // Unabhängig vom Laufweg steht der Aufzug in jedem Fall die vollen 10s, bevor er
            // weiterfährt (die 5s Laufzeit passen locker hinein).
            setTimeout(depart, STAND_MS);
        }

        if (oldIdx >= 0) {
            // Alte Position bekannt - erst dorthin fahren und sichtbar anhalten, bevor
            // eingestiegen wird.
            setDuration(PICKUP_MS);
            requestAnimationFrame(() => {
                car.style.top = (oldIdx * BUNKER_FLOOR_HEIGHT + 8) + 'px';
                folgeAufzugScroll(PICKUP_MS);
            });
            setTimeout(boardAndWait, PICKUP_MS);
        } else {
            // Alte Position unbekannt - Aufzug bleibt einfach stehen, wo er gerade ist
            // (keine falsche Rückkehr zur Zentrale), Männchen steigt direkt dort ein.
            boardAndWait();
        }
    }

    function renderBunkerAgentVisuals() {
        const car = document.getElementById('bunker-elevator-car');
        const riderSlot = document.getElementById('bunker-elevator-rider-slot');
        if (!car || !gameState.agentSystemUnlocked) { if (riderSlot) riderSlot.innerHTML = ''; return; }

        document.querySelectorAll('.bunker-agent-figure').forEach(el => el.remove());

        // Den Aufzug/Rider-Slot selbst nur anfassen, wenn GERADE KEINE Fahrt läuft (es gibt nur
        // einen Aufzug) - sonst würde eine laufende Animation mittendrin abgeschnitten.
        if (!bunkerElevatorAnimating) {
            if (riderSlot) riderSlot.innerHTML = '';
            car.style.top = '8px';
        }

        const agentsPerRoomCount = {};
        gameState.agents.forEach(agent => {
            // NUR der/die gerade animierende(n) Agent(en) werden hier übersprungen - deren
            // Darstellung übernimmt vollständig die laufende Aufzug-Animation. Alle ANDEREN
            // Agenten bleiben normal sichtbar (vorher hat ein einziges globales Flag ALLE
            // Agenten ausgeblendet, sobald irgendeiner unterwegs war).
            if (bunkerAnimatingAgentIds.has(agent.id)) return;
            const idx = bunkerFloorIndexForType(agent.location);
            if (idx < 0) return;
            const preview = document.getElementById('bunker-room-' + idx);
            if (!preview) return;

            const wrap = document.createElement('div');
            wrap.className = 'bunker-agent-figure';
            // Mehrere Agenten im selben Raum lagen bisher exakt übereinander (identische
            // bottom/left-Position) - dadurch konnte ein frisch rekrutierter Agent komplett
            // unsichtbar hinter einem bereits dort stehenden verschwinden. Jetzt werden sie
            // nebeneinander versetzt aufgereiht.
            const slot = agentsPerRoomCount[idx] || 0;
            agentsPerRoomCount[idx] = slot + 1;
            let offsetPx = 0;
            if (slot > 0) {
                const direction = (slot % 2 === 1) ? -1 : 1;
                const magnitude = Math.ceil(slot / 2) * 30;
                offsetPx = direction * magnitude;
            }
            wrap.style.left = 'calc(50% + ' + offsetPx + 'px)';
            if (agent.isStarter) wrap.classList.add('bunker-agent-starter');
            if (agent.id === window.selectedAgentId) wrap.classList.add('bunker-agent-figure-selected');
            const countdown = formatAgentCountdown(agent);
            let statusLabel = '';
            if (agent.state === 'waiting_in_quartiere') {
                statusLabel = '<div class="bunker-agent-wait">wartet · ' + countdown + '</div>';
            } else if (agent.state === 'working' && countdown) {
                statusLabel = '<div class="bunker-agent-timer">⏱ ' + countdown + '</div>';
            } else if (agent.state === 'forge_ready') {
                statusLabel = '<div class="bunker-agent-wait" style="color:#c060ff;">bereit · Terminal öffnen</div>';
            } else if (agent.state === 'journey_mission') {
                statusLabel = '<div class="bunker-agent-timer" style="color:#c060ff;">🌀 Unterwegs · ' + countdown + '</div>';
            } else if (agent.state === 'journey_forge_return') {
                statusLabel = '<div class="bunker-agent-timer" style="color:#c060ff;">zurückgekehrt · ' + countdown + '</div>';
            } else if (agent.state === 'journey_dekontam') {
                statusLabel = '<div class="bunker-agent-timer">☢ Dekontamination · ' + countdown + '</div>';
            } else if (agent.state === 'journey_archiv') {
                statusLabel = '<div class="bunker-agent-timer">📦 Archivierung · ' + countdown + '</div>';
            }
            wrap.innerHTML = '<div class="bunker-agent-level">' + (agent.isStarter ? '★ ' : '') + 'Lvl ' + agent.level + '</div><div class="bunker-figure"></div>' + statusLabel;
            wrap.onclick = (ev) => {
                ev.stopPropagation();
                if (agent.state === 'waiting_in_quartiere') {
                    playBeepBase(300, 0.1);
                    if (typeof showCustomAlert === 'function') showCustomAlert('Agent wartet in den Quartieren und kann gerade nicht ausgewählt werden.');
                    return;
                }
                if (agent.state === 'journey_mission' || agent.state === 'journey_forge_return' || agent.state === 'journey_dekontam' || agent.state === 'journey_archiv') {
                    playBeepBase(300, 0.1);
                    if (typeof showCustomAlert === 'function') showCustomAlert('Agent befindet sich im Zeitreise-Kreislauf und kann gerade nicht ausgewählt werden.');
                    return;
                }
                playBeepBase(1200, 0.05);
                if (typeof showAgentInfoPopup === 'function') showAgentInfoPopup(agent.id);
            };
            preview.appendChild(wrap);
        });
    }

    // Zeigt Level, den daraus resultierenden Zeit-Boost (und den Starter-Extra-Bonus, falls
    // zutreffend) in einem Popup mit zwei klaren Aktionen: Menü schließen, oder den Agenten zur
    // Zuweisung auswählen (identisch zum bisherigen Klick-Verhalten, nur jetzt über den Button).
    window.showAgentInfoPopup = function(agentId) {
        const agent = gameState.agents.find(a => a.id === agentId);
        if (!agent) return;
        const titleEl = document.getElementById('agent-info-title');
        const bodyEl = document.getElementById('agent-info-body');
        const assignBtn = document.getElementById('agent-info-assign-btn');
        const overlay = document.getElementById('agent-info-popup');
        if (!titleEl || !bodyEl || !assignBtn || !overlay) return;

        // Gleiche Formel wie agentScaledDurationMs(): Level-Bonus + ggf. Starter-Extra-Bonus.
        const levelBonusPct = Math.min(90, (agent.level - 1) * 5);
        const starterBonusPct = agent.isStarter ? 5 : 0;
        const totalBonusPct = levelBonusPct + starterBonusPct;

        titleEl.innerText = (agent.isStarter ? '★ STARTER-AGENT' : 'AGENT') + ' · LVL ' + agent.level;
        bodyEl.innerHTML =
            '<div>Level: <b style="color:#0ff;">' + agent.level + '</b></div>' +
            '<div>Zeit-Boost durch Level: <b style="color:#0f8;">' + levelBonusPct + '%</b> schneller</div>' +
            (agent.isStarter ? '<div>Starter-Extra-Bonus: <b style="color:#ffd700;">+' + starterBonusPct + '%</b></div>' : '') +
            '<div style="margin-top:6px; border-top:1px solid rgba(0,255,255,0.2); padding-top:6px;">Gesamt: <b style="color:#0ff;">' + totalBonusPct + '%</b> schneller bei allen Zyklen (Aufgaben, Quartiere-Wartezeit, Zeitreise-Mission)</div>' +
            (agent.isStarter ? '<div style="margin-top:6px; font-size:0.85em; color:#aaa;">Kann außerdem den Impuls-Kondensator nicht betreten - so bleibt immer mindestens ein Agent garantiert am Leben.</div>' : '');

        assignBtn.onclick = () => {
            window.selectedAgentId = agentId;
            renderBunkerAgentVisuals();
            if (typeof showInfoToast === 'function') showInfoToast('Agent ausgewählt (Lvl ' + agent.level + '). Ziel-Stockwerk antippen.');
            window.closeAgentInfoPopup();
        };

        overlay.style.display = 'flex';
    };
    window.closeAgentInfoPopup = function() {
        const overlay = document.getElementById('agent-info-popup');
        if (overlay) overlay.style.display = 'none';
    };

    // --- Raum-Info-Popup: ausführliche Beschreibung (Flavor-Text + Mechanik + aktuelles Level) ---
    // Ausführliche, mehrsätzige Erklärungen pro Raum für den Info-Button - bewusst eigenständig
    // formuliert, nicht nur aus Flavor-Text + Mechanik-Kurztext zusammengesetzt.
    const ROOM_DETAILED_INFO = {
        'ZENTRALE': 'Der Ausgangspunkt der gesamten Basis. Von hier aus gehen neu rekrutierte und zurückkehrende Agenten los, und hier warten sie zwischen zwei Einsätzen. Die Zentrale selbst produziert nichts und lässt sich nicht ausbauen - sie ist reine Infrastruktur.',
        'FLUX-REAKTOR': 'Ein einfacher Energiewandler, der einem zugewiesenen Agenten stündlich eine feste Menge Credits abwirft. Die Ausbeute pro Zyklus wächst linear mit dem Raum-Level - ein Level-2-Reaktor liefert doppelt so viel wie auf Level 1, ein Level-3-Reaktor das Dreifache.',
        'MATERIE-DEKOMPRESSOR': 'Zerlegt geborgene Fundstücke in nutzbare Materiezellen. Ein Zyklus dauert 8 Stunden. Die Ausbeute steigt nicht gleichmäßig, sondern in Stufen: bis Level 4 gibt es 1 Materiezelle pro Zyklus, ab Level 5 sind es 2, ab Level 10 schließlich 3.',
        'KINETIK-LABOR': 'Wandelt die Bewegungsenergie eines arbeitenden Agenten in Spieler-Erfahrungspunkte um - hilft also nicht dem Agenten, sondern deinem eigenen Spieler-Fortschritt. Die XP-Ausbeute pro Zyklus wächst linear mit dem Raum-Level.',
        'IMPULS-KONDENSATOR': 'Ein Hochrisiko-Raum: Der zugewiesene Agent hat nur eine 50/50-Chance, die Entladung zu überstehen. Überlebt er, steigt er im Level auf (ab Raum-Level 5 gleich um zwei Stufen, ab Level 10 um drei) und bringt Credits sowie Materiezellen mit, die ebenfalls mit dem Raum-Level wachsen. Stirbt er, ist er dauerhaft verloren - landet aber im Friedhof des Subraum-Nexus und kann dort gegen Chronos-Zellen wiederbelebt werden. Der Starter-Agent (★) darf diesen Raum aus Sicherheitsgründen nie betreten.',
        'OSZILLATIONS-KAMMER': 'Ein exklusiver Raum, der ausschließlich vom allerersten Agenten (★) betreten werden darf. Ein Zyklus dauert 15 Stunden und liefert Materiezellen nach der generischen Zwei-Level-Formel.',
        'FUNK-RELAIS "HORIZONT"': 'Empfängt sci-fi-artige Zeitreise-Aufträge mit einem konkreten Zieljahr. Mehrere Aufträge können gleichzeitig aktiv sein. Wird in der TEMPORAL TIME FORGE exakt dieses Jahr eingegeben, gilt die Reise als artefakt-berechtigt. Die Zeit bis zum Empfang eines neuen Auftrags sinkt mit dem Raum-Level.',
        'HOCHSPANNUNGS-VERTEILER': 'Aktiviert beim Start sofort einen System-Overdrive: Für die Dauer des Zyklus laufen alle ANDEREN Agenten-Timer in der Basis beschleunigt. Der Beschleunigungsfaktor selbst wächst mit dem Raum-Level (von 50% auf Level 1 bis 90% auf Level 10). Der zugewiesene Agent selbst riskiert dabei sein Leben (50% Sterberisiko) und profitiert nicht vom eigenen Overdrive. Der Starter-Agent ist aus Sicherheitsgründen ausgeschlossen.',
        'PARADOXON-FILTER': 'Ein instabiler Quanten-Warp-Versuch, der in nur 5 Minuten direkt ein Artefakt ins Archiv holen kann - vorausgesetzt, es liegt gerade ein aktiver Horizont-Auftrag vor (der beim Start sofort verbraucht wird, unabhängig vom Ausgang). Die Erfolgschance ist an das Raum-Level gekoppelt: 30% auf Level 1, steigend bis 75% auf Level 10. Chronos-Zellen gibt es über diesen Weg nie.',
        'TEMPORAL TIME FORGE': 'Das Herzstück des Zeitreise-Kreislaufs. Der Agent wartet hier, bis du am Terminal manuell ein Zieljahr einträgst und die Reise startest. Stimmt das Jahr mit einem aktiven Horizont-Auftrag überein, ist die Reise artefakt-berechtigt. Die Grund-Missionsdauer von 8 Stunden sinkt mit dem Raum-Level um 10 Minuten pro Stufe, zusätzlich zur normalen Agenten-Level-Beschleunigung.',
        'ARTEFAKT-ARCHIV': 'Endstation des Zeitreise-Kreislaufs. Hier gibt es garantiert 1-5 Chronos-Zellen, und bei artefakt-berechtigten Reisen zusätzlich die Chance auf eines von 40 einzigartigen Artefakten mit eigener Jahresangabe und Fundgeschichte. Gesammelte Artefakte werden physisch im Regal (falls gekauft) oder in einem Sammelbereich im Raum angezeigt. Die reine Aufenthaltsdauer hier sinkt mit dem Raum-Level.',
        'AGENTEN-QUARTIERE': 'Die Schlafkammer, durch die jeder reguläre Raumwechsel eines Agenten zwingend läuft. Die Wartezeit hier beträgt auf Level 1 eine volle Stunde und sinkt mit jedem weiteren Level um 3 Minuten (Untergrenze 15 Minuten), zusätzlich zur normalen Agenten-Level-Beschleunigung.',
        'DEKONTAMINATIONS-SCHLEUSE': 'Pflichtstation im Zeitreise-Kreislauf nach der Rückkehr aus der Forge. Reinigt den Agenten von temporaler Kontamination. Die Grunddauer von 60 Minuten sinkt mit dem Raum-Level um 2 Minuten pro Stufe.',
        'SCANNER-PHALANX': 'Rekrutiert nach Ablauf des Zyklus einen komplett neuen Agenten (sofern das Agenten-Limit nicht bereits erreicht ist) - beide, der arbeitende und der neue Agent, kehren danach zurück. Die Grund-Zykluszeit von 24 Stunden sinkt mit dem Raum-Level um 30 Minuten pro Stufe.',
        'KI-KERNMATRIX': 'Trainiert einen zugewiesenen Agenten und lässt ihn im Level aufsteigen (normalerweise um eine Stufe, ab Raum-Level 10 gleich um zwei). Die Grund-Zykluszeit von 8 Stunden sinkt mit dem Raum-Level um 6 Minuten pro Stufe.',
        'THERMO-KOPPLER': 'Nutzt die Erdwärme der Ödnis und produziert vollkommen automatisch, ganz ohne zugewiesenen Agenten, alle 2 Stunden Credits. Die Ausbeute pro Tick steigt um 4 Credits pro Level.',
        'TRANSFORMATOREN-STATION': 'Ein manueller Tauschautomat: Credits gegen Materiezellen, jederzeit nutzbar. Die Kosten pro Materiezelle sinken mit dem Raum-Level um 200 Credits pro Stufe.',
        'RENAISSANCE-GENERATOR': 'Verkauft Chronos-Zellen gegen Credits - ein reiner Verkaufsautomat, hier lassen sich keine Chronos-Zellen kaufen. Der Auszahlungsbetrag pro verkaufter Chronos-Zelle steigt mit dem Raum-Level um 500 Credits pro Stufe.',
        'ANOMALIE-DETEKTOR': 'Verlangsamt automatisch den Kohärenz-Abfall während WARNUNG- und INSTABIL-Phasen im Hauptterminal. Die Verlangsamung wächst mit dem Raum-Level von 5% auf 1,5%-Schritten weiter.',
        'QUANTEN-LABOR': 'Gibt einen passiven Bonus auf JEDE positive XP-Belohnung im Hauptterminal (nicht auf Abzüge/Strafen). Der Bonus wächst mit dem Raum-Level von 2% um jeweils 1 Prozentpunkt weiter.',
        'KYBERNETIK-STATION': 'Vergrößert den GPS-Ankunftsradius bei Missionen im Hauptterminal, was das Erreichen eines Zielpunkts erleichtert. Der Bonus wächst alle zwei Level um einen weiteren Meter.',
        'RESONANZ-KAMMER': 'Gibt bei jedem abgeschlossenen Mission-Loot im Hauptterminal eine Zufallschance auf komplett verdoppelte Belohnung (Credits, Materiezellen und XP gleichermaßen). Die Chance wächst mit dem Raum-Level von 5% um jeweils 1 Prozentpunkt weiter.',
        'TECHNIK-DECK': 'Gewährt einen Rabatt auf die Materiezellen-Kosten beim Bau neuer Räume. Der Rabatt wächst mit dem Raum-Level von 5% um jeweils 2 Prozentpunkte weiter.',
        'SERVER-HUB': 'Kann im Hauptterminal einen drohenden Übergang zu WARNUNG direkt abfangen, sodass die Kohärenz stabil bleibt. Die Abfangchance wächst mit dem Raum-Level von 10% um jeweils 2 Prozentpunkte weiter.',
        'KRYO-DEPOT': 'Erweitert das globale Agenten-Limit über die Basis von 8 hinaus. Der Bonus wächst alle zwei Level um einen weiteren Platz.',
        'SUBRAUM-NEXUS': 'Der VIP-Raum der Agentur mit fünf eigenständigen Stationen: Holoprojektor (Direktkanal zur Administration, 1 Chronos-Zelle pro Nachricht), Bio-Rekonstruktions-Kapsel (Wiederbelebung gestorbener Agenten für 25 Chronos-Zellen), Schattensyndikat-Terminal (Schwarzmarkt für fehlende Artefakte), Temporale Rohrpost (globale Drops der Administration) und Infostand. Produziert unabhängig von einem Agenten dauerhaft 100 Credits pro Stunde, mit zugewiesenem Agenten zusätzlich alle 3 Stunden 1 Materiezelle. Dieser Raum kann selbst nicht gelevelt werden.'
    };

    window.showRoomInfoPopup = function(roomType) {
        const room = gameState.baseData.find(r => r.type === roomType);
        const level = room ? (room.lvl || 1) : 1;
        const titleEl = document.getElementById('room-info-title');
        const bodyEl = document.getElementById('room-info-body');
        if (!titleEl || !bodyEl) return;
        titleEl.innerText = '[ ' + roomDisplayName(roomType) + (roomType !== 'ZENTRALE' ? ' · LVL ' + level : '') + ' ]';
        const category = roomEffectCategory(roomType);
        const categoryLabel = { active: 'Aktiver Raum (Agent nötig)', passive: 'Passiver Raum (läuft automatisch)', danger: 'Hochrisiko-Raum', journey: 'Teil des Zeitreise-Kreislaufs', quantum: 'Instabile Quanten-Alternative' }[category] || (roomType === 'ZENTRALE' ? 'Infrastruktur' : 'Dekorativer Raum');
        const detail = ROOM_DETAILED_INFO[roomType] || 'Für diesen Raum ist noch keine ausführliche Beschreibung hinterlegt.';
        bodyEl.innerHTML =
            '<div style="margin-bottom:8px;"><b style="color:#0ff;">Kategorie:</b> ' + categoryLabel + '</div>' +
            '<div>' + detail + '</div>';
        const overlay = document.getElementById('room-info-popup');
        if (overlay) overlay.style.display = 'flex';
    };
    window.closeRoomInfoPopup = function() {
        const overlay = document.getElementById('room-info-popup');
        if (overlay) overlay.style.display = 'none';
    };

    // --- Raum-Level-Up-Popup: aktuelle vs. nächste Produktionsstufe, Kauf-Button ---
    // Baut den "Aktuell vs. nächstes Level"-HTML-Block einheitlich zusammen.
    function roomLevelCompareHtml(level, nextLevel, curVal, nextVal, unitLabel, decimals) {
        const fmt = (v) => decimals ? v.toFixed(decimals) : Math.round(v);
        if (level === nextLevel) {
            // Maximallevel: kein "nächstes Level" mehr - nur der aktuelle, tatsächliche Wert.
            return '<div style="color:#0f8;">Aktuelle Produktion (Level ' + level + ', Maximallevel)</div>' +
                '<div>' + fmt(curVal) + ' ' + unitLabel + '</div>';
        }
        const diff = nextVal - curVal;
        return '<div style="color:#0f8;">Aktuell (Level ' + level + ')</div>' +
            '<div style="margin-bottom:8px;">' + fmt(curVal) + ' ' + unitLabel + '</div>' +
            '<div style="color:#4dd0ff;">Bei Level ' + nextLevel + '</div>' +
            '<div>' + fmt(curVal) + ' <span style="opacity:0.6;">' + (diff >= 0 ? '+' : '') + fmt(diff) + '</span> = ' + fmt(nextVal) + ' ' + unitLabel + '</div>';
    }
    // Räume, bei denen die Zeit/Wartedauer SINKT statt eines Produktionswerts zu STEIGEN -
    // eigene Darstellung, da "weniger ist besser" andersrum kommuniziert werden sollte.
    function roomLevelTimeHtml(level, nextLevel, curMin, nextMin) {
        if (level === nextLevel) {
            return '<div style="color:#0f8;">Aktuelles Zeitintervall (Level ' + level + ', Maximallevel)</div>' +
                '<div>' + Math.round(curMin) + ' Minuten</div>';
        }
        const diff = curMin - nextMin;
        return '<div style="color:#0f8;">Aktuell (Level ' + level + ')</div>' +
            '<div style="margin-bottom:8px;">' + Math.round(curMin) + ' Minuten</div>' +
            '<div style="color:#4dd0ff;">Bei Level ' + nextLevel + '</div>' +
            '<div>' + Math.round(nextMin) + ' Minuten <span style="opacity:0.7;">(' + (diff >= 0 ? '-' : '+') + Math.abs(Math.round(diff)) + ' Min.)</span></div>';
    }

    window.renderRoomLevelPopup = function(roomType) {
        const room = gameState.baseData.find(r => r.type === roomType);
        if (!room) return;
        const level = room.lvl || 1;
        const amMaxLevel = level >= ROOM_MAX_LEVEL;
        const nextLevel = amMaxLevel ? level : level + 1;
        const task = AGENT_TASK_ROOMS[roomType];
        const titleEl = document.getElementById('room-level-title');
        const bodyEl = document.getElementById('room-level-body');
        if (!titleEl || !bodyEl) return;
        titleEl.innerText = '[ ' + roomDisplayName(roomType) + ' · LEVEL-UP ]';

        let productionHtml = '';
        if (roomType === 'AGENTEN-QUARTIERE') {
            productionHtml = roomLevelTimeHtml(level, nextLevel, scaledQuartiereHours(level) * 60, scaledQuartiereHours(nextLevel) * 60);
        } else if (roomType === 'ARTEFAKT-ARCHIV') {
            productionHtml = roomLevelTimeHtml(level, nextLevel, scaledArchivJourneyMinutes(level), scaledArchivJourneyMinutes(nextLevel));
        } else if (roomType === 'DEKONTAMINATIONS-SCHLEUSE') {
            productionHtml = roomLevelTimeHtml(level, nextLevel, scaledDekontamMinutes(level), scaledDekontamMinutes(nextLevel));
        } else if (roomType === 'SCANNER-PHALANX') {
            productionHtml = roomLevelTimeHtml(level, nextLevel, scaledScannerMinutes(level), scaledScannerMinutes(nextLevel));
        } else if (roomType === 'FUNK-RELAIS "HORIZONT"') {
            productionHtml = roomLevelTimeHtml(level, nextLevel, scaledHorizonMinutes(level), scaledHorizonMinutes(nextLevel));
        } else if (roomType === 'KI-KERNMATRIX') {
            productionHtml = roomLevelTimeHtml(level, nextLevel, scaledKiKernmatrixMinutes(level), scaledKiKernmatrixMinutes(nextLevel)) +
                '<div style="margin-top:8px; font-size:0.85em; color:#ffd700;">Ab Level 10: Agent steigt pro Zyklus um +2 Agentenlevel statt +1.</div>';
        } else if (isForgeRoom(roomType)) {
            productionHtml = roomLevelTimeHtml(level, nextLevel, FORGE_MISSION_HOURS * 60 - scaledForgeMissionMinutesReduction(level), FORGE_MISSION_HOURS * 60 - scaledForgeMissionMinutesReduction(nextLevel));
        } else if (roomType === 'IMPULS-KONDENSATOR') {
            const curC = scaledImpulsCredits(level), nextC = scaledImpulsCredits(nextLevel);
            const curM = scaledImpulsMaterie(level), nextM = scaledImpulsMaterie(nextLevel);
            productionHtml = roomLevelCompareHtml(level, nextLevel, curC, nextC, 'Credits bei Erfolg') +
                '<div style="margin-top:10px;">' + roomLevelCompareHtml(level, nextLevel, curM, nextM, 'Materiezellen bei Erfolg') + '</div>' +
                '<div style="margin-top:8px; font-size:0.85em; color:#ffd700;">Ab Level 5: +2 Agentenlevel bei Erfolg. Ab Level 10: +3 Agentenlevel bei Erfolg.</div>';
        } else if (roomType === 'HOCHSPANNUNGS-VERTEILER') {
            productionHtml = roomLevelCompareHtml(level, nextLevel, scaledOverdrivePct(level), scaledOverdrivePct(nextLevel), '% schnellere Timer', 1);
        } else if (roomType === 'PARADOXON-FILTER') {
            productionHtml = roomLevelCompareHtml(level, nextLevel, scaledQuantumWarpChancePct(level), scaledQuantumWarpChancePct(nextLevel), '% Erfolgschance');
        } else if (roomType === 'TECHNIK-DECK') {
            productionHtml = roomLevelCompareHtml(level, nextLevel, scaledTechnikDeckDiscountPct(level), scaledTechnikDeckDiscountPct(nextLevel), '% Rabatt auf Raumausbau');
        } else if (roomType === 'SERVER-HUB') {
            productionHtml = roomLevelCompareHtml(level, nextLevel, scaledServerHubPct(level), scaledServerHubPct(nextLevel), '% Abfangchance');
        } else if (roomType === 'ANOMALIE-DETEKTOR') {
            productionHtml = roomLevelCompareHtml(level, nextLevel, scaledAnomaliePct(level), scaledAnomaliePct(nextLevel), '% langsamerer Kohärenz-Abfall', 1);
        } else if (roomType === 'QUANTEN-LABOR') {
            productionHtml = roomLevelCompareHtml(level, nextLevel, scaledQuantenLaborBonusPct(level), scaledQuantenLaborBonusPct(nextLevel), '% Bonus auf alle XP');
        } else if (roomType === 'KYBERNETIK-STATION') {
            productionHtml = roomLevelCompareHtml(level, nextLevel, scaledKybernetikMeters(level), scaledKybernetikMeters(nextLevel), 'm GPS-Ankunftsradius');
        } else if (roomType === 'RESONANZ-KAMMER') {
            productionHtml = roomLevelCompareHtml(level, nextLevel, scaledResonanzPct(level), scaledResonanzPct(nextLevel), '% Chance auf doppelten Loot');
        } else if (roomType === 'KRYO-DEPOT') {
            productionHtml = roomLevelCompareHtml(level, nextLevel, scaledKryoDepotBonus(level), scaledKryoDepotBonus(nextLevel), 'zusätzliche Agenten-Plätze');
        } else if (roomType === 'TRANSFORMATOREN-STATION') {
            productionHtml = roomLevelCompareHtml(level, nextLevel, scaledTransformatorCostCredits(level), scaledTransformatorCostCredits(nextLevel), 'Credits pro Materiezelle (Tauschkosten)');
        } else if (roomType === 'RENAISSANCE-GENERATOR') {
            productionHtml = roomLevelCompareHtml(level, nextLevel, scaledRenaissanceSellCredits(level), scaledRenaissanceSellCredits(nextLevel), 'Credits pro verkaufter Chronos-Zelle');
        } else if (task && task.effect === 'credits') {
            productionHtml = roomLevelCompareHtml(level, nextLevel, scaledCreditsAmount(task.amount, level), scaledCreditsAmount(task.amount, nextLevel), 'Credits pro Zyklus');
        } else if (task && task.effect === 'materiezelle') {
            const formula = (roomType === 'MATERIE-DEKOMPRESSOR') ? scaledMaterieDekompressor : scaledMaterieAmount;
            productionHtml = roomLevelCompareHtml(level, nextLevel, formula(level), formula(nextLevel), 'Materiezellen pro Zyklus');
        } else if (task && task.effect === 'player_xp') {
            productionHtml = roomLevelCompareHtml(level, nextLevel, scaledKinetikXP(level), scaledKinetikXP(nextLevel), 'Spieler-XP pro Zyklus');
        } else {
            productionHtml = '<div style="opacity:0.7;">Für diesen Raum ist noch keine Level-abhängige Produktionssteigerung hinterlegt - der Level-Wert wird aber trotzdem gespeichert.</div>';
        }
        bodyEl.innerHTML = productionHtml;

        const moebelKomplett = roomFurnitureVollstaendig(roomType);
        if (!moebelKomplett && !amMaxLevel) {
            bodyEl.innerHTML += '<div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,136,0,0.4); color:#ff8800;">⚠ Dieser Raum muss erst vollständig mit Möbeln ausgestattet sein, bevor er geleveled werden kann.</div>';
        }

        const btn = document.getElementById('room-level-upgrade-btn');
        if (btn) {
            if (amMaxLevel) {
                btn.disabled = true;
                btn.innerText = 'MAXIMALLEVEL ERREICHT';
                btn.onclick = null;
            } else if (!moebelKomplett) {
                btn.disabled = true;
                btn.innerText = 'ERST MÖBEL VERVOLLSTÄNDIGEN';
                btn.onclick = null;
            } else {
                btn.disabled = false;
                btn.innerText = 'LEVEL-UP (1000 C + 8 MZ)';
                btn.onclick = () => window.levelUpRoom(roomType);
            }
        }
    };
    window.showRoomLevelPopup = function(roomType) {
        window.renderRoomLevelPopup(roomType);
        const overlay = document.getElementById('room-level-popup');
        if (overlay) overlay.style.display = 'flex';
    };
    window.closeRoomLevelPopup = function() {
        const overlay = document.getElementById('room-level-popup');
        if (overlay) overlay.style.display = 'none';
    };

    function getAgentUnlockRequirementStatus() {
        const roomsBuilt = AGENT_UNLOCK_REQUIRED_ROOMS.map(type => ({
            type,
            ok: gameState.baseData.some(r => r.type === type)
        }));
        return {
            rooms: roomsBuilt,
            allRoomsBuilt: roomsBuilt.every(r => r.ok),
            levelOk: gameState.userLevel >= AGENT_UNLOCK_REQUIRED_LEVEL,
            creditsOk: gameState.credits >= AGENT_UNLOCK_COST_CREDITS,
            mzOk: gameState.materieZellen >= AGENT_UNLOCK_COST_MZ
        };
    }

    function renderAgentUnlockPopup() {
        const box = document.getElementById('agent-unlock-requirements');
        const btn = document.getElementById('btn-agent-unlock-confirm');
        if (!box || !btn) return;
        const st = getAgentUnlockRequirementStatus();
        const line = (ok, text) => '<div style="color:' + (ok ? '#0f8' : '#f44') + ';">' + (ok ? '✓' : '✗') + ' ' + text + '</div>';

        let html = '<b style="color:#ff8800;">Voraussetzungen (müssen bereits gebaut sein):</b>';
        st.rooms.forEach(r => { html += line(r.ok, r.type); });
        html += '<br>' + line(st.levelOk, 'Agentur-Level ' + AGENT_UNLOCK_REQUIRED_LEVEL + ' (aktuell ' + gameState.userLevel + ')');
        html += line(st.creditsOk, AGENT_UNLOCK_COST_CREDITS + ' Credits (aktuell ' + gameState.credits + ')');
        html += line(st.mzOk, AGENT_UNLOCK_COST_MZ + ' Materiezellen (aktuell ' + gameState.materieZellen + ')');
        box.innerHTML = html;

        const allOk = st.allRoomsBuilt && st.levelOk && st.creditsOk && st.mzOk;
        btn.disabled = !allOk;
        btn.style.opacity = allOk ? '1' : '0.4';
        btn.style.cursor = allOk ? 'pointer' : 'not-allowed';
    }

    window.openAgentUnlockPopup = function() {
        if (gameState.agentSystemUnlocked) {
            if (typeof showCustomAlert === 'function') showCustomAlert('Agenten-System bereits freigeschaltet.');
            return;
        }
        playBeepBase(900, 0.05);
        renderAgentUnlockPopup();
        document.getElementById('agent-unlock-overlay').style.display = 'flex';
    };

    window.closeAgentUnlockPopup = function() {
        playBeepBase(600, 0.05);
        document.getElementById('agent-unlock-overlay').style.display = 'none';
    };

    window.confirmAgentSystemUnlock = async function() {
        const st = getAgentUnlockRequirementStatus();
        if (!st.allRoomsBuilt) { if (typeof showCustomAlert === 'function') showCustomAlert('Nicht alle benötigten Räume sind gebaut.'); return; }
        if (!st.levelOk) { if (typeof showCustomAlert === 'function') showCustomAlert('Agentur-Level zu niedrig.'); return; }
        if (!st.creditsOk || !st.mzOk) { if (typeof showCustomAlert === 'function') showCustomAlert('Nicht genügend Credits/Materiezellen.'); return; }

        gameState.credits -= AGENT_UNLOCK_COST_CREDITS;
        gameState.materieZellen -= AGENT_UNLOCK_COST_MZ;
        gameState.agentSystemUnlocked = true;
        ensureAgentsInitialized(); // Jetzt erst darf der erste Agent in der Zentrale entstehen.

        updateUI();
        window.closeAgentUnlockPopup();
        const unlockBtn = document.getElementById('btn-agent-system-unlock');
        if (unlockBtn) unlockBtn.style.display = 'none';
        renderBunkerView();
        if (typeof renderAgentPanel === 'function') renderAgentPanel();
        await saveGameState();
        if (typeof showInfoToast === 'function') showInfoToast('Agenten-System freigeschaltet! Der erste Agent ist in der Zentrale einsatzbereit.');
    };

    window.showAktiveBasis = function() {
        const unlockBtn = document.getElementById('btn-agent-system-unlock');
        if (unlockBtn) unlockBtn.style.display = gameState.agentSystemUnlocked ? 'none' : 'block';
        playBeepBase(900, 0.05);
        document.getElementById('view-ausbaumenu').style.display = 'none';
        document.getElementById('view-aktive-basis').style.display = 'flex';
        updateUI();
        renderBunkerView();
    };

    // Alte Namen als Alias beibehalten, falls irgendwo noch darauf verwiesen wird.
    window.openAktiveBasis = window.showAktiveBasis;
    window.closeAktiveBasis = function() {
        bunkerActive = false;
        window._roomAreaTargetId = 'room-area';
    };

    window.showBasisausbaumenu = function() {
        playBeepBase(600, 0.05);
        bunkerActive = false;
        window._roomAreaTargetId = 'room-area';
        document.getElementById('view-aktive-basis').style.display = 'none';
        document.getElementById('view-ausbaumenu').style.display = 'flex';
        updateUI();
        renderGrid();
        // Statt blind auf die geometrische Mitte des GESAMTEN Gitters zu scrollen (das ist bei
        // 7x7 nicht zwangsläufig dort, wo die tatsächlich gebaute Basis liegt), wird gezielt ein
        // echtes Baufeld ("+") in den sichtbaren Bereich gescrollt - garantiert sichtbar, egal wo
        // es im Gitter liegt. Gibt es keins (Basis komplett leer o.ä.), wird notfalls die
        // Zentrale selbst zentriert.
        const buildable = document.querySelector('#base-grid [data-buildable="1"]');
        const zentrale = Array.from(document.querySelectorAll('#base-grid .room-active')).find(el => el.textContent.includes('ZENTRALE'));
        const target = buildable || zentrale;
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ block: 'center', inline: 'center' });
        } else {
            const wrap = document.getElementById('grid-wrapper');
            if (wrap) { wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2; wrap.scrollTop = (wrap.scrollHeight - wrap.clientHeight) / 2; }
        }
    };

    // Zeigt den aktuellen Anzeigenamen eines Raums - fängt den Fall ab, dass ein bereits vor
    // der Umbenennung gebauter Raum in den gespeicherten Daten noch unter dem alten internen
    // Namen "VAKUUM-SCHMIEDE" geführt wird.
    // Bildet Raumtyp -> ID des zugehörigen Möbel-Shop-Panels ab. Die meisten folgen dem Muster
    // "menu-" + kleingeschriebener Raumname, zwei Räume (Archiv, Quartiere) nutzen historisch
    // verkürzte IDs.
    function roomShopPanelId(roomType) {
        const sonderfaelle = {
            'ARTEFAKT-ARCHIV': 'menu-archiv',
            'AGENTEN-QUARTIERE': 'menu-quartiere',
            'TEMPORAL TIME FORGE': 'menu-vakuum-schmiede',
            'VAKUUM-SCHMIEDE': 'menu-vakuum-schmiede'
        };
        if (sonderfaelle[roomType]) return sonderfaelle[roomType];
        return 'menu-' + roomType.toLowerCase().replace(/"/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    // Ein Raum lässt sich erst leveln, wenn im zugehörigen Möbel-Shop-Panel ALLE Kauf-Buttons
    // deaktiviert sind (= komplett ausgestattet). Räume ohne eigenes Shop-Panel (z.B.
    // Subraum-Nexus, dessen 5 Stationen fest zum Raum gehören und nicht einzeln gekauft werden)
    // gelten automatisch als vollständig.
    function roomFurnitureVollstaendig(roomType) {
        // Buttons erst zwangsweise aktualisieren - sie werden sonst nur beim Öffnen des jeweiligen
        // Raums neu bewertet, ein Level-Klick direkt aus der Übersicht könnte also einen
        // veralteten (nicht aktualisierten) Zustand vorfinden.
        if (typeof window.updateAusbauButtons === 'function') window.updateAusbauButtons();
        const panel = document.getElementById(roomShopPanelId(roomType));
        if (!panel) return true;
        const kaufButtons = panel.querySelectorAll('.btn-upgrade-exec');
        if (kaufButtons.length === 0) return true;
        return Array.from(kaufButtons).every(btn => btn.disabled);
    }

    window.levelUpRoom = async function(roomType) {
        const room = gameState.baseData.find(r => r.type === roomType);
        if (!room) return;
        if ((room.lvl || 1) >= ROOM_MAX_LEVEL) {
            if (typeof showCustomAlert === 'function') showCustomAlert('Dieser Raum hat bereits das Maximallevel (' + ROOM_MAX_LEVEL + ') erreicht.');
            return;
        }
        if (!roomFurnitureVollstaendig(roomType)) {
            if (typeof showCustomAlert === 'function') showCustomAlert('Dieser Raum muss erst vollständig mit Möbeln ausgestattet sein, bevor er geleveled werden kann.');
            return;
        }
        if (gameState.materieZellen < ROOM_LEVEL_UP_COST_MZ || gameState.credits < ROOM_LEVEL_UP_COST_CREDITS) {
            if (typeof showCustomAlert === 'function') showCustomAlert('System: ' + ROOM_LEVEL_UP_COST_CREDITS + ' Credits + ' + ROOM_LEVEL_UP_COST_MZ + ' Materiezellen benötigt.');
            return;
        }
        gameState.materieZellen -= ROOM_LEVEL_UP_COST_MZ;
        gameState.credits -= ROOM_LEVEL_UP_COST_CREDITS;
        room.lvl = (room.lvl || 1) + 1;
        updateUI();
        await saveGameState();
        if (typeof showInfoToast === 'function') showInfoToast(roomDisplayName(roomType) + ' auf Level ' + room.lvl + ' hochgestuft.');
        if (typeof window.logEreignis === 'function') window.logEreignis(roomDisplayName(roomType) + ' auf Level ' + room.lvl + ' hochgestuft.');
        if (typeof window.renderRoomLevelPopup === 'function') window.renderRoomLevelPopup(roomType);
        if (typeof renderBunkerView === 'function') renderBunkerView();
    };

    function roomDisplayName(type) {
        if (type === 'VAKUUM-SCHMIEDE') return 'TEMPORAL TIME FORGE';
        return type;
    }

    // Ordnet der Raum-Kategorie die passende CSS-Klasse für den Sidebar-Infotext zu.
    function roomInfoColorClass(roomType) {
        const cat = roomEffectCategory(roomType);
        if (cat === 'passive') return ' passive-room-info';
        if (cat === 'danger') return ' danger-room-info';
        if (cat === 'journey') return ' journey-room-info';
        if (cat === 'quantum') return ' quantum-room-info';
        return '';
    }

    // Liefert 'active' (Agent nötig -> grün), 'passive' (läuft automatisch -> hellblau),
    // 'danger' (Agent nötig, aber mit Lebensrisiko -> orange), 'journey' (Zeitreise-Kreislauf ->
    // lila), 'quantum' (instabile Quanten-Alternative -> Neon-Türkis) oder null (reine Deko).
    function roomEffectCategory(roomType) {
        if (roomType === 'IMPULS-KONDENSATOR' || roomType === 'HOCHSPANNUNGS-VERTEILER') return 'danger';
        if (roomType === 'PARADOXON-FILTER') return 'quantum';
        if (isForgeRoom(roomType) || roomType === 'DEKONTAMINATIONS-SCHLEUSE' || roomType === 'ARTEFAKT-ARCHIV' || roomType === 'FUNK-RELAIS "HORIZONT"') return 'journey';
        if (roomType === 'AGENTEN-QUARTIERE' || AGENT_TASK_ROOMS[roomType]) return 'active';
        if (PASSIVE_ROOMS[roomType]) return 'passive';
        return null;
    }

    function agentRoomInfoText(roomType) {
        if (roomType === 'AGENTEN-QUARTIERE') {
            return 'Pflicht-Zwischenstopp bei jedem Raumwechsel · wartet hier 1h';
        }
        if (roomType === 'IMPULS-KONDENSATOR') {
            return '⚠ Agent wartet 20 Minuten · 50% Todesrisiko · bei Erfolg: +' + scaledImpulsAgentLevelBonus(roomLevelOf('IMPULS-KONDENSATOR')) + ' Agentenlevel, ' + scaledImpulsMaterie(roomLevelOf('IMPULS-KONDENSATOR')) + ' MZ, ' + scaledImpulsCredits(roomLevelOf('IMPULS-KONDENSATOR')) + ' Credits';
        }
        if (isForgeRoom(roomType)) {
            return 'Agent wartet ohne Zeitlimit · Terminal starten für 8h-Zeitreise → Dekontamination (1h) → Archiv (30min)';
        }
        if (roomType === 'DEKONTAMINATIONS-SCHLEUSE') {
            return 'Zwischenstation im Zeitreise-Kreislauf · Agent verbleibt hier genau 1h zur temporalen Reinigung';
        }
        if (roomType === 'ARTEFAKT-ARCHIV') {
            return 'Abschluss des Zeitreise-Kreislaufs · 30min · 1-5 Chronos-Zellen, Artefakt nur bei korrektem Horizont-Zieljahr';
        }
        if (roomType === 'OSZILLATIONS-KAMMER') {
            return 'Nur Agent #1 (Starter) · 15h · Belohnung: 1 Materiezelle';
        }
        if (roomType === 'SUBRAUM-NEXUS') {
            return 'VIP-Raum · immer 100 Credits/h passiv · mit Agent zusätzlich alle 3h 1 Materiezelle · Detailansicht mit 5 Interaktionen';
        }
        if (roomType === 'FUNK-RELAIS "HORIZONT"') {
            return 'Agent 30min zugewiesen · erzeugt einen Zeitreise-Auftrag (Ziel-Jahr) für die TEMPORAL TIME FORGE' +
                ' <button onclick="event.stopPropagation(); window.showHorizonBriefing();" style="margin-left:6px; padding:1px 8px; font-size:0.85em; background:#c060ff; color:#000; border:1px solid #c060ff; border-radius:3px; cursor:pointer; font-family:inherit;">📡 BERICHTE</button>';
        }
        if (roomType === 'HOCHSPANNUNGS-VERTEILER') {
            return '⚠ Regulärer Agent (nicht #1) · 1h · Alle Timer laufen währenddessen ' + Math.round(scaledOverdrivePct(roomLevelOf('HOCHSPANNUNGS-VERTEILER'))) + '% schneller · 50% Todesrisiko danach';
        }
        if (roomType === 'PARADOXON-FILTER') {
            return 'Agent 5min · versucht per Quanten-Warp ein Artefakt direkt ins Archiv zu holen · ' + Math.round(scaledQuantumWarpChancePct(roomLevelOf('PARADOXON-FILTER'))) + '% Erfolgschance';
        }
        if (roomType === 'TRANSFORMATOREN-STATION') {
            return PASSIVE_ROOMS[roomType].text +
                ' <button onclick="event.stopPropagation(); window.openTransformatorPopup();" style="margin-left:6px; padding:1px 8px; font-size:0.85em; background:#4dd0ff; color:#000; border:1px solid #4dd0ff; border-radius:3px; cursor:pointer; font-family:inherit;">⇄ TAUSCHEN</button>';
        }
        if (roomType === 'RENAISSANCE-GENERATOR') {
            return PASSIVE_ROOMS[roomType].text +
                ' <button onclick="event.stopPropagation(); window.openRenaissancePopup();" style="margin-left:6px; padding:1px 8px; font-size:0.85em; background:#4dd0ff; color:#000; border:1px solid #4dd0ff; border-radius:3px; cursor:pointer; font-family:inherit;">⇄ TAUSCHEN</button>';
        }
        if (PASSIVE_ROOMS[roomType]) {
            return PASSIVE_ROOMS[roomType].text;
        }
        const task = AGENT_TASK_ROOMS[roomType];
        if (!task) return '';
        const effectText = {
            credits: task.amount + ' Credits pro Zyklus',
            materiezelle: task.amount + ' Materiezelle pro Zyklus',
            level_up: 'erhöht das Agenten-Level (max. ' + AGENT_MAX_LEVEL + ')',
            spawn_agent: 'erzeugt einen neuen Agenten',
            player_xp: task.amount + ' Spieler-XP pro Zyklus'
        }[task.effect] || '';
        return 'Agent arbeitet hier ' + task.hours + 'h · ' + effectText;
    }

    function renderBunkerView() {
        const floorsEl = document.getElementById('bunker-floors');
        if (!floorsEl) return;
        floorsEl.innerHTML = '';

        const zentrale = gameState.baseData.find(r => r.type === 'ZENTRALE');
        const others = gameState.baseData.filter(r => r.type !== 'ZENTRALE');
        bunkerFloorsData = zentrale ? [zentrale, ...others] : others;

        bunkerFloorsData.forEach((room, idx) => {
            const previewId = 'bunker-room-' + idx;
            const floor = document.createElement('div');
            floor.className = 'bunker-floor';
            floor.onclick = () => {
                playBeepBase(1200, 0.05);
                if (window.selectedAgentId) {
                    window.moveAgentTo(window.selectedAgentId, room.type);
                    renderBunkerView();
                    return;
                }
                window.closeAktiveBasis(); window.openRoom(room.type);
            };
            floor.innerHTML =
                '<div class="bunker-floor-inner">' +
                    '<div class="bunker-room-preview-wrap" style="background:' + (roomColors[room.type] || '#1a0a2a') + ';">' +
                        '<div class="bunker-room-preview" id="' + previewId + '">' +
                            '<div class="r-ceiling"></div><div class="r-left"></div><div class="r-right"></div><div class="r-back"></div>' +
                            '<div class="r-floor"><div class="r-floor-grid"></div></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="bunker-floor-sidebar">' +
                        '<div class="bunker-floor-label"><b>' + roomDisplayName(room.type) + '</b>' +
                        (room.type !== 'ZENTRALE' ? ' · LVL ' + room.lvl : ' · EINGANGSEBENE') +
                        '</div>' +
                        (agentRoomInfoText(room.type) ? '<div class="bunker-floor-info' + roomInfoColorClass(room.type) + '">' + agentRoomInfoText(room.type) + '</div>' : '') +
                        (room.type === 'ZENTRALE' ? '' :
                        '<div class="bunker-floor-buttons">' +
                            '<button class="bunker-floor-btn" onclick="event.stopPropagation(); window.showRoomInfoPopup(\'' + room.type.replace(/"/g, '&quot;') + '\')">ℹ INFO</button>' +
                            (NOT_LEVELABLE_ROOMS.includes(room.type) ? '' :
                            '<button class="bunker-floor-btn bunker-floor-btn-level" onclick="event.stopPropagation(); window.showRoomLevelPopup(\'' + room.type.replace(/"/g, '&quot;') + '\')">⬆ LEVEL</button>') +
                        '</div>') +
                    '</div>' +
                '</div>';
            floorsEl.appendChild(floor);
        });

        const track = document.getElementById('bunker-shaft-track');
        if (track) track.style.height = (bunkerFloorsData.length * BUNKER_FLOOR_HEIGHT) + 'px';

        // Echte Möbel jedes Raumes in seine jeweilige Vorschau rendern (nacheinander,
        // damit clearRoom() - jetzt containerspezifisch - keinen falschen Raum trifft).
        bunkerFloorsData.forEach((room, idx) => {
            window._roomAreaTargetId = 'bunker-room-' + idx;
            try {
                window.reloadFurniture(room.type);
                if (room.type === 'ARTEFAKT-ARCHIV' && typeof placeArtifactsInShelves === 'function') placeArtifactsInShelves();
            } catch(e) { console.error('Bunker-Vorschau Fehler bei Stockwerk "' + room.type + '":', e); }
        });
        window._roomAreaTargetId = 'room-area';

        bunkerActive = true;
        renderBunkerAgentVisuals();
    }

    window.onload = async () => {
        const authPromise = await waitForBaseAuthReady();
        const user = await authPromise;
        if (!user) return; // guardBaseAccess leitet in diesem Fall bereits zu index.html um
        currentAgentName = currentAgentName || user.displayName || (user.email || '').split('@')[0];
        let isM = localStorage.getItem('flux_music_' + currentAgentName.toLowerCase()) === 'true';
        if (isM) { document.addEventListener('click', () => { document.getElementById('bg-music-base').play().catch(e=>{}); }, {once: true}); }
        await loadGameState();
        window.showAktiveBasis();

        if (typeof renderAgentPanel === 'function') renderAgentPanel();
        // Läuft alle 15s: holt reale, vergangene Zeit nach und schreibt fällige Belohnungen gut,
        // auch während die Seite offen im Hintergrund liegt.
        setInterval(() => { tickAgents(); tickPassiveRooms(); }, 15000);
        // Läuft jede Sekunde: aktualisiert nur die sichtbare Countdown-Anzeige am Männchen,
        // damit man wirklich live mitzählen sieht, ohne die volle Zustandsprüfung zu wiederholen.
        setInterval(() => { if (bunkerActive && typeof renderBunkerAgentVisuals === 'function') renderBunkerAgentVisuals(); }, 1000);
    };

    function formatAgentCountdown(agent) {
        if (!agent.taskStartTs || !agent.taskDurationMs) return '';
        const remainMs = Math.max(0, agent.taskDurationMs - (Date.now() - agent.taskStartTs));
        const totalMin = Math.ceil(remainMs / 60000);
        const h = Math.floor(totalMin / 60), m = totalMin % 60;
        return h > 0 ? (h + 'h ' + m + 'min') : (m + 'min');
    }

    function renderAgentPanel() {
        // Entfernt: Auswahl passiert jetzt ausschließlich über das sichtbare Männchen in der
        // Aktive-Basis-Ansicht (siehe renderBunkerAgentVisuals), kein separates Panel mehr.
    }


/* ==== next block ==== */


    window.showCustomAlert = (msg) => { document.getElementById('custom-alert-msg').innerText = msg; document.getElementById('custom-alert-box').style.display = 'flex'; };

    let infoToastTimeout = null;
    window.showInfoToast = (msg) => {
        const box = document.getElementById('info-toast-box');
        if (!box) return;
        document.getElementById('info-toast-msg').innerText = msg;
        box.style.display = 'block';
        requestAnimationFrame(() => box.classList.add('info-toast-visible'));
        if (infoToastTimeout) clearTimeout(infoToastTimeout);
        infoToastTimeout = setTimeout(() => {
            box.classList.remove('info-toast-visible');
            setTimeout(() => { box.style.display = 'none'; }, 300);
        }, 2600);
    };
    window.closeCustomAlert = () => { document.getElementById('custom-alert-box').style.display = 'none'; };

    // === AUTOMATISCHER CLOUD-SYNCHRONISATOR FÜR BLOCK 2 & BLOCK 3 ===
    let _invCache = { desk: 0, server: 0, kartograph: 0, lampe: 0, regal: 0, lampe_archiv: 0, bett: 0, lampe_quartier: 0 };
    try {
        // Läuft synchron beim Skript-Start, BEVOR die Auth-Session bestätigt ist - currentAgentName
        // existiert hier noch nicht. Dient nur als kurzzeitiger Platzhalter, bis loadInventoryFromCloud()
        // (das die zuverlässige Session nutzt) die echten Daten nachlädt und überschreibt.
        const ag = localStorage.getItem("flux_last_agent") || "";
        const lsData = localStorage.getItem('flux_base_inventory_' + ag);
        if (lsData) _invCache = { ..._invCache, ...JSON.parse(lsData) };
    } catch(e) {}

    let inventory = new Proxy(_invCache, {
        set: function(target, prop, val) {
            target[prop] = val;
            setTimeout(() => {
                // WICHTIG: gameState.credits wird hier NICHT mehr aus dem angezeigten DOM-Text
                // neu abgeleitet. Das lief der asynchronen Credits-Fusion beim Laden den Rang ab
                // (v.a. bei langsameren Verbindungen/Mobilgeräten): sobald das Inventar aus der
                // Cloud nachgeladen wurde, konnte dieser Trap einen noch nicht aktualisierten
                // "0"-Anzeigewert zurück nach Firestore schreiben und frisch gesetzte/fusionierte
                // Credits überschreiben. gameState.credits ist bereits die korrekte Quelle.
                if (typeof window.syncInventory === 'function') window.syncInventory();
            }, 50);
            return true;
        }
    });

    window.syncInventory = async function() {
        const ag = currentAgentName || ""; // zuverlässige Auth-Session statt evtl. fehlendem/veraltetem localStorage
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
        const ag = currentAgentName || ""; // zuverlässige Auth-Session statt evtl. fehlendem/veraltetem localStorage
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
    }; // Ende window.loadInventoryFromCloud
    // Hinweis: wird jetzt direkt am Ende von loadGameState() aufgerufen (s.o.), nicht mehr per
    // festem setTimeout - das eliminiert den Wettlauf mit der Credits-Fusion.

    window.openRoom = (type) => {
        window._roomOpenedFromView = (document.getElementById('view-ausbaumenu').style.display !== 'none') ? 'ausbaumenu' : 'aktive-basis';
        document.getElementById('view-aktive-basis').style.display = 'none';
        document.getElementById('view-ausbaumenu').style.display = 'none';
        document.getElementById('interior-screen').style.display = 'flex';
        
        document.getElementById(window._roomAreaTargetId || 'room-area').style.display = 'block';
        document.getElementById('ausbau-menu').style.display = 'none';
        document.getElementById('toggle-ausbau-btn').innerText = "AGENTUR-AUSBAU ÖFFNEN";
        
        const mt = document.getElementById('main-title'); if (mt) mt.innerText = "RAUM-ANSICHT";
        document.getElementById('room-title-detail').innerText = roomDisplayName(type);

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
            if (typeof renderArtifactCollection === 'function') renderArtifactCollection();
            // Zusätzlicher, leicht verzögerter Aufruf als Sicherheitsnetz - falls die Regal-Fächer
            // durch einen Reflow/Timing-Effekt beim ersten (synchronen) Versuch noch nicht bereit
            // waren, greift dieser zweite Versuch nach dem nächsten Render-Tick.
            setTimeout(() => { if (typeof placeArtifactsInShelves === 'function') placeArtifactsInShelves(); }, 60);
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
        if (window._roomOpenedFromView === 'ausbaumenu') {
            window.showBasisausbaumenu();
        } else {
            window.showAktiveBasis();
        }
    };

    window.toggleAusbauMenu = () => {
        const menu = document.getElementById('ausbau-menu');
        const btn = document.getElementById('toggle-ausbau-btn');
        const roomBox = document.getElementById(window._roomAreaTargetId || 'room-area');
        
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
        // Nur INNERHALB des aktuell anvisierten Raum-Containers leeren, nicht global -
        // sonst würden sich mehrere gleichzeitig gerenderte Bunker-Raumvorschauen
        // gegenseitig die Möbel wegräumen.
        const scopeEl = document.getElementById(window._roomAreaTargetId || 'room-area');
        (scopeEl || document).querySelectorAll('.fixed-item').forEach(el => el.remove());
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
        const room = document.getElementById(window._roomAreaTargetId || 'room-area');
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
            item.innerHTML = '<div class="regal-fach"></div><div class="regal-fach"></div><div class="regal-fach"></div><div class="regal-fach"></div><div class="regal-fach"></div>';
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
    const room = document.getElementById(window._roomAreaTargetId || 'room-area');
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
                    
                    const ag = currentAgentName || ""; // zuverlässige Auth-Session statt evtl. fehlendem/veraltetem localStorage
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
        const room = document.getElementById(window._roomAreaTargetId || 'room-area');
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
                    
                    const ag = currentAgentName || ""; // zuverlässige Auth-Session statt evtl. fehlendem/veraltetem localStorage
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
        const room = document.getElementById(window._roomAreaTargetId || 'room-area');
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
        const room = document.getElementById(window._roomAreaTargetId || 'room-area');
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

    // Zusätzliche, unregelmäßig getimte Effekte - sorgen für Abwechslung, statt dass immer
    // exakt dieselbe Dauerschleife läuft.
    if (type === 'PARADOXON-FILTER') startParadoxAmbientEffects();
    else stopParadoxAmbientEffects();
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
                const ag = currentAgentName || ""; // zuverlässige Auth-Session statt evtl. fehlendem/veraltetem localStorage
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
        const room = document.getElementById(window._roomAreaTargetId || 'room-area');
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
    const room = document.getElementById(window._roomAreaTargetId || 'room-area');
    if (!room || !itemsParadox.includes(type)) return;
    
    const item = document.createElement('div');
    item.classList.add('fixed-item');

    if (type === 'chrono_kern') {
        item.classList.add('item-chrono-kern');
        item.innerHTML = '<div class="chrono-ring-1"></div><div class="chrono-ring-2"></div><div class="chrono-sphere"></div><div class="chrono-base"></div>';
        // Leichte Zufalls-Varianz pro Besuch, damit es nicht immer exakt gleich wirkt.
        const jitter1 = (5.2 + Math.random() * 1.6).toFixed(1) + 's';
        const jitter2 = (3.4 + Math.random() * 1.4).toFixed(1) + 's';
        const sphereJitter = (4.3 + Math.random() * 1.6).toFixed(1) + 's';
        item.querySelector('.chrono-ring-1').style.animationDuration = jitter1;
        item.querySelector('.chrono-ring-2').style.animationDuration = jitter2;
        item.querySelector('.chrono-sphere').style.animationDuration = sphereJitter + ', 2.2s';
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

// 8. Zusätzliche, unregelmäßig getimte Ambiente-Effekte für mehr Abwechslung
let paradoxFragmentTimeout = null;
let paradoxTearTimeout = null;

function scheduleParadoxFragment() {
    paradoxFragmentTimeout = setTimeout(() => {
        const room = document.getElementById(window._roomAreaTargetId || 'room-area');
        if (room && document.getElementById('dimension-glitch-layer')) {
            const frag = document.createElement('div');
            frag.className = 'paradox-fragment';
            frag.style.left = (10 + Math.random() * 80) + '%';
            frag.style.setProperty('--drift', (Math.random() * 40 - 20) + 'px');
            frag.style.setProperty('--hue', Math.floor(Math.random() * 360) + 'deg');
            frag.style.animationDuration = (3 + Math.random() * 2.5).toFixed(1) + 's';
            room.appendChild(frag);
            setTimeout(() => { try { frag.remove(); } catch(e) {} }, 6000);
        }
        scheduleParadoxFragment();
    }, 1200 + Math.random() * 2800); // unregelmäßig: mal schnell hintereinander, mal Pause
}

function scheduleParadoxTear() {
    paradoxTearTimeout = setTimeout(() => {
        const room = document.getElementById(window._roomAreaTargetId || 'room-area');
        if (room && document.getElementById('dimension-glitch-layer')) {
            const scenes = [
                'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=600&q=80', // Steinzeit/Natur
                'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=600&q=80', // Cyber-City
                'https://images.unsplash.com/photo-1605722243979-fc087912411e?auto=format&fit=crop&w=600&q=80', // Sturm/Blitze
                'https://images.unsplash.com/photo-1614728263952-84ea256f9679?auto=format&fit=crop&w=600&q=80', // Mars
                'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=600&q=80', // Milchstraße
                'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=600&q=80', // Unterwasser
                'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=600&q=80', // Wüste
                'https://images.unsplash.com/photo-1491002052546-bf38f186af56?auto=format&fit=crop&w=600&q=80', // Schneegebirge
                'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=600&q=80', // Antike Ruinen
                'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=600&q=80', // Neon-Regenstadt
                'https://images.unsplash.com/photo-1554147090-e1221a04a025?auto=format&fit=crop&w=600&q=80', // Vulkan
                'https://images.unsplash.com/photo-1516339901601-2e1b62dc0c45?auto=format&fit=crop&w=600&q=80'  // Nordlichter
            ];
            const blends = ['screen', 'hard-light', 'color-dodge', 'difference', 'overlay'];
            const filters = ['sepia(0.7)', 'hue-rotate(90deg)', 'contrast(1.4)', 'invert(0.15)', 'hue-rotate(-40deg) saturate(1.4)', 'none'];

            const vision = document.createElement('div');
            vision.className = 'paradox-vision';
            vision.style.backgroundImage = "url('" + scenes[Math.floor(Math.random() * scenes.length)] + "')";
            vision.style.mixBlendMode = blends[Math.floor(Math.random() * blends.length)];
            vision.style.filter = filters[Math.floor(Math.random() * filters.length)];
            room.appendChild(vision);
            setTimeout(() => { try { vision.remove(); } catch(e) {} }, 1700);
        }
        scheduleParadoxTear();
    }, 3500 + Math.random() * 6000); // unregelmäßig, seltener als die Fragmente
}

window.startParadoxAmbientEffects = function() {
    stopParadoxAmbientEffects();
    scheduleParadoxFragment();
    scheduleParadoxTear();
};
window.stopParadoxAmbientEffects = function() {
    if (paradoxFragmentTimeout) { clearTimeout(paradoxFragmentTimeout); paradoxFragmentTimeout = null; }
    if (paradoxTearTimeout) { clearTimeout(paradoxTearTimeout); paradoxTearTimeout = null; }
};
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
        const roomArea = document.getElementById(window._roomAreaTargetId || 'room-area');
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
                const ag = currentAgentName || ""; // zuverlässige Auth-Session statt evtl. fehlendem/veraltetem localStorage
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
    const room = document.getElementById(window._roomAreaTargetId || 'room-area');
    if (!room || !itemsImpuls.includes(type)) return;
    
    const item = document.createElement('div');
    item.classList.add('fixed-item');

    if (type === 'impuls_kern') {
        item.classList.add('item-impuls-kern');
        item.innerHTML = `
            <div class="kern-ring-accel"></div>
            <div class="kern-gehaeuse">
                <div class="kern-charge-core"><div class="kern-charge-fill-inner"></div></div>
            </div>
            <div class="kern-base"></div>`;
        
        // Fügt dem gesamten Raum den Glitch-Effekt hinzu, sobald der Kern gebaut wird.
        // In der Bunker-Miniaturansicht läuft eine Variante, die die Verkleinerung
        // (scale(0.4)) in jedem Animationsschritt mit einbaut, damit sich Glitch und
        // Skalierung nicht gegenseitig überschreiben.
        if ((window._roomAreaTargetId || 'room-area') === 'room-area') {
            room.classList.add('emp-active');
        } else {
            room.classList.add('emp-active-scaled');
        }
        
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
    const room = document.getElementById(window._roomAreaTargetId || 'room-area');
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
    const ag = currentAgentName || ""; // zuverlässige Auth-Session statt evtl. fehlendem/veraltetem localStorage
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
    <div class="upgrade-card" style="border-color:#4dd0ff;">
        <b style="color:#4dd0ff;">[ ENERGIE-TAUSCH ]</b>
        <p style="font-size:0.7em; color:#aaa;">Wandelt überschüssige Credits direkt in seltene Materiezellen um.</p>
        <button id="btn-transformator-exchange" onclick="window.exchangeCreditsForMZ()" class="btn-action-repeatable" style="background:#4dd0ff; color:#000; border:1px solid #4dd0ff;">TAUSCHEN (5000 C → 1 MZ)</button>
    </div>
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
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsTransStation.includes(type)) return;
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
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsRenaissance.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'materie_rekon') {
        item.classList.add('item-materie-rekon');
        item.innerHTML = '<div class="mr-cylinder"><div class="mr-ring"></div><div class="mr-ring r2"></div></div><div class="mr-base"></div>';
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
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsThermo.includes(type)) return;
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
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsKinetik.includes(type)) return;
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
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsDekomp.includes(type)) return;
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


// === TEMPORAL TIME FORGE (ehem. VAKUUM-SCHMIEDE) ===
const menuForge = `
<div id="menu-vakuum-schmiede" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card" style="border-color:#c060ff;">
        <b style="color:#c060ff;">[ ZEITREISE-KREISLAUF ]</b>
        <div id="forge-journey-status" style="font-size:0.75em; color:#aaa; margin-top:6px;">Kein Agent anwesend.</div>
    </div>
    <div class="upgrade-card" style="border-color:#0ff;"><b style="color:#0ff;">[ ZEITMASCHINEN-KERN ]</b><p style="font-size:0.7em; color:#aaa;">Rotierender Ringkern mit pulsierendem Energiezentrum - das Herzstück der Schmiede.</p><button id="btn-buy-zeitmaschinen-kern" onclick="window.buyFurniture('zeitmaschinen_kern', 3500)" class="btn-upgrade-exec" style="background:#0ff; color:#000; border:1px solid #0ff;">KAUFEN (3500 C + 50 MZ)</button></div>
    <div class="upgrade-card"><b>[ HOLO-PROJEKTOR ]</b><p style="font-size:0.7em; color:#aaa;">Projiziert eine flackernde, rotierende Zeitstrom-Sphäre.</p><button id="btn-buy-holo-projektor" onclick="window.buyFurniture('holo_projektor', 1300)" class="btn-upgrade-exec">KAUFEN (1300 C)</button></div>
    <div class="upgrade-card"><b>[ ENERGIE-BOGEN-GENERATOR ]</b><p style="font-size:0.7em; color:#aaa;">Zwei Ladeknoten mit ständig überspringenden Energiebögen.</p><button id="btn-buy-energie-bogen" onclick="window.buyFurniture('energie_bogen', 950)" class="btn-upgrade-exec">KAUFEN (950 C)</button></div>
    <div class="upgrade-card"><b>[ CHRONO-LEUCHTE ]</b><p style="font-size:0.7em; color:#aaa;">Deckenring mit rotierendem Lichtband.</p><button id="btn-buy-chrono-leuchte" onclick="window.buyFurniture('chrono_leuchte', 280)" class="btn-upgrade-exec">KAUFEN (280 C)</button></div>
</div>`;
if (!document.getElementById('menu-vakuum-schmiede')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuForge);

const itemsForge = ['zeitmaschinen_kern','holo_projektor','energie_bogen','chrono_leuchte'];
itemsForge.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });
// Ist der Raum bereits unter dem alten Namen gebaut (VAKUUM-SCHMIEDE), gilt er als derselbe Raum.
function isForgeRoom(type) { return type === 'VAKUUM-SCHMIEDE' || type === 'TEMPORAL TIME FORGE'; }

const oldUpdateAusbau_VS = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_VS === 'function') oldUpdateAusbau_VS();
    if (typeof inventory === 'undefined') return;
    const limits = { zeitmaschinen_kern:1, holo_projektor:1, energie_bogen:1, chrono_leuchte:1 };
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
    if (m) m.style.display = isForgeRoom(type) ? 'flex' : 'none';
    if (isForgeRoom(type)) {
        const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important');
        window.reloadFurniture(type); window.updateAusbauButtons();
        if (typeof renderForgeStatus === 'function') renderForgeStatus();
    }
};

const oldBuyFurniture_VS = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsForge.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'zeitmaschinen_kern'); let costC = cost; let costMZ = isMZ ? 50 : 0;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? "System: 3500 C + 50 MZ benötigt." : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_VS) oldBuyFurniture_VS(type, cost);
};

const oldReload_VS = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_VS) oldReload_VS(type);
    if (isForgeRoom(type)) {
        if (inventory.chrono_leuchte > 0) window.spawnFurniture('chrono_leuchte', 1);
        if (inventory.zeitmaschinen_kern > 0) window.spawnFurniture('zeitmaschinen_kern', 1);
        if (inventory.holo_projektor > 0) window.spawnFurniture('holo_projektor', 1);
        if (inventory.energie_bogen > 0) window.spawnFurniture('energie_bogen', 1);
    }
};

const oldSpawn_VS = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_VS) oldSpawn_VS(type, count);
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsForge.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'zeitmaschinen_kern') {
        item.classList.add('item-zeitmaschinen-kern');
        item.innerHTML =
            '<div class="ttf-ring ttf-ring-1"></div><div class="ttf-ring ttf-ring-2"></div><div class="ttf-ring ttf-ring-3"></div><div class="ttf-ring ttf-ring-4"></div><div class="ttf-ring ttf-ring-5"></div>' +
            '<svg class="ttf-lightning-svg" viewBox="0 0 110 110"></svg>' +
            '<div class="ttf-core"></div>' +
            '<div class="ttf-spark s1"></div><div class="ttf-spark s2"></div><div class="ttf-spark s3"></div>' +
            '<div class="ttf-base"></div>';
    } else if (type === 'holo_projektor') {
        item.classList.add('item-holo-projektor');
        item.innerHTML =
            '<div class="hp-hologram"><div class="hp-globe"></div></div>' +
            '<div class="hp-emitter"></div><div class="hp-base"></div>';
    } else if (type === 'energie_bogen') {
        item.classList.add('item-energie-bogen');
        item.innerHTML =
            '<div class="eb-node left"></div><div class="eb-node right"></div>' +
            '<div class="eb-bolt b1"></div><div class="eb-bolt b2"></div><div class="eb-bolt b3"></div>';
    } else if (type === 'chrono_leuchte') {
        item.classList.add('item-chrono-leuchte');
        item.innerHTML = '<div class="cl-ring"></div>';
    }
    room.appendChild(item);
    if (type === 'zeitmaschinen_kern') {
        const svg = item.querySelector('.ttf-lightning-svg');
        if (svg && typeof spawnForgeLightning === 'function') spawnForgeLightning(svg);
    }
};

// === ZEITREISE-KREISLAUF: Terminal-Logik ===
let forgeTerminalAgentId = null;

// Zeichnet einzigartige, gezackte Blitze im Zeitmaschinen-Kern per SVG - bewusst KEINE geraden
// Balken wie beim Energie-Bogen-Generator, sondern ein per Zufall verzerrter Zickzack-Pfad, der
// in eine zufällige Richtung vom Zentrum aus "schießt". Läuft in einer selbstbeendenden Schleife:
// sobald das Element den Raum verlässt (z.B. Raum geschlossen -> clearRoom), bricht sie von
// selbst ab, statt für immer im Hintergrund weiterzulaufen.
function spawnForgeLightning(svgEl) {
    function jaggedPath(angleDeg) {
        const cx = 55, cy = 55;
        const angle = angleDeg * Math.PI / 180;
        const perp = angle + Math.PI / 2;
        const length = 26 + Math.random() * 22;
        const steps = 4 + Math.floor(Math.random() * 3);
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const frac = i / steps;
            const dist = 6 + frac * length;
            const jitter = i === 0 ? 0 : (Math.random() - 0.5) * 16;
            const x = cx + Math.cos(angle) * dist + Math.cos(perp) * jitter;
            const y = cy + Math.sin(angle) * dist + Math.sin(perp) * jitter;
            pts.push(x.toFixed(1) + ',' + y.toFixed(1));
        }
        return pts.join(' ');
    }
    function flash() {
        if (!document.body.contains(svgEl)) return; // Raum verlassen - Schleife beenden
        svgEl.innerHTML = '';
        const count = 1 + Math.floor(Math.random() * 2); // 1-2 gleichzeitige Blitze
        for (let i = 0; i < count; i++) {
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            poly.setAttribute('points', jaggedPath(Math.random() * 360)); // zufällige Richtung
            poly.setAttribute('class', 'ttf-lightning-bolt');
            svgEl.appendChild(poly);
        }
        setTimeout(() => { if (document.body.contains(svgEl)) svgEl.innerHTML = ''; }, 120 + Math.random() * 100);
        setTimeout(flash, 450 + Math.random() * 1300);
    }
    flash();
}

function renderForgeStatus() {
    const box = document.getElementById('forge-journey-status');
    if (!box) return;
    // Sucht gezielt einen Agenten, der HIER wartet (forge_ready) - andere Zustände (z.B. schon
    // unterwegs) sollen den Button nicht erneut anzeigen.
    const readyAgent = gameState.agents.find(a => isForgeRoom(a.location) && a.state === 'forge_ready');
    if (readyAgent) {
        box.innerHTML = 'Agent (Lvl ' + readyAgent.level + ') wartet bereit.<br>' +
            '<button class="btn-upgrade-exec" style="margin-top:8px; background:#c060ff; color:#000; border:1px solid #c060ff;" onclick="window.openForgeTerminal(\'' + readyAgent.id + '\')">⏳ ZEITREISE-TERMINAL ÖFFNEN</button>';
    } else {
        const busyAgent = gameState.agents.find(a => a.state === 'journey_mission' && isForgeRoom(a.location));
        const returnAgent = gameState.agents.find(a => a.state === 'journey_forge_return');
        if (busyAgent) {
            box.innerHTML = '🌀 Agent ist auf Zeitreise unterwegs · Rückkehr in ' + formatAgentCountdown(busyAgent) + '.';
        } else if (returnAgent) {
            box.innerHTML = 'Agent kurz zurück in der Forge, bevor es weiter zur Dekontaminationsschleuse geht.';
        } else {
            box.innerHTML = 'Kein Agent bereit. Weise einen Agenten dieser Forge zu.';
        }
    }
}

window.openForgeTerminal = function(agentId) {
    const agent = gameState.agents.find(a => a.id === agentId);
    if (!agent || agent.state !== 'forge_ready') { if (typeof showCustomAlert === 'function') showCustomAlert('Agent ist nicht mehr bereit.'); return; }
    forgeTerminalAgentId = agentId;
    const yearInput = document.getElementById('forge-terminal-year');
    const log = document.getElementById('forge-terminal-log');
    const startBtn = document.getElementById('forge-terminal-start-btn');
    if (yearInput) yearInput.value = '';
    if (log) log.innerHTML = '';
    if (startBtn) { startBtn.disabled = false; startBtn.innerText = 'START'; }
    const overlay = document.getElementById('forge-terminal-overlay');
    if (overlay) overlay.style.display = 'flex';
};

window.closeForgeTerminal = function() {
    const overlay = document.getElementById('forge-terminal-overlay');
    if (overlay) overlay.style.display = 'none';
    forgeTerminalAgentId = null;
};

window.startForgeJourney = function() {
    const agent = gameState.agents.find(a => a.id === forgeTerminalAgentId);
    if (!agent || agent.state !== 'forge_ready') { if (typeof showCustomAlert === 'function') showCustomAlert('Agent ist nicht mehr bereit.'); window.closeForgeTerminal(); return; }
    const yearInput = document.getElementById('forge-terminal-year');
    const year = (yearInput && yearInput.value.trim()) ? yearInput.value.trim() : 'UNBEKANNT';
    const log = document.getElementById('forge-terminal-log');
    const startBtn = document.getElementById('forge-terminal-start-btn');
    if (startBtn) { startBtn.disabled = true; startBtn.innerText = 'LÄUFT...'; }

    const lines = [
        '> Zielkoordinate eingehend: Jahr ' + year,
        '> Kalibriere Zeitmaschinen-Kern...',
        '> Energie-Bögen stabilisiert.',
        '> Temporale Signatur des Agenten verankert.',
        '> Sprungfenster wird geöffnet...',
        '> AGENT VERSETZT. Mission gestartet - Rückkehr in ~8h.'
    ];
    let i = 0;
    function printNext() {
        if (!log) return;
        if (i < lines.length) {
            const l = document.createElement('div');
            l.innerText = lines[i];
            log.appendChild(l);
            log.scrollTop = log.scrollHeight;
            i++;
            setTimeout(printNext, 650);
        } else {
            // Erst NACHDEM das Log fertig durchgelaufen ist, wird die eigentliche Mission
            // scharf geschaltet - passt zum "Start"-Gefühl des Terminals.
            // Artefakt-Berechtigung: nur wenn das eingegebene Jahr EXAKT dem aktuellen
            // Funk-Relais-"Horizont"-Auftrag entspricht. Bei Treffer wird der Auftrag verbraucht
            // (Button im Relais verschwindet dann beim nächsten Öffnen des Raums).
            // Artefakt-Berechtigung: nur wenn das eingegebene Jahr EXAKT einem der aktuell
            // aktiven Funk-Relais-"Horizont"-Aufträge entspricht (mehrere können gleichzeitig
            // bestehen). Bei Treffer wird NUR dieser eine Auftrag verbraucht, alle anderen
            // bleiben unangetastet bestehen.
            const missions = Array.isArray(gameState.horizonMissions) ? gameState.horizonMissions : [];
            const matchIdx = missions.findIndex(m => String(m.year) === year);
            const horizonMatch = matchIdx >= 0;
            agent.artifactEligible = horizonMatch;
            if (horizonMatch) {
                gameState.horizonMissions.splice(matchIdx, 1);
                if (typeof renderHorizonStatus === 'function') renderHorizonStatus();
            }
            agent.state = 'journey_mission';
            agent.taskStartTs = Date.now();
            const forgeBaseMinutes = Math.max(30, FORGE_MISSION_HOURS * 60 - scaledForgeMissionMinutesReduction(roomLevelOf('TEMPORAL TIME FORGE')));
            agent.taskDurationMs = agentScaledDurationMs(forgeBaseMinutes / 60, agent.level, agent.isStarter);
            saveGameState();
            renderBunkerAgentVisuals();
            renderForgeStatus();
            setTimeout(window.closeForgeTerminal, 1500);
        }
    }
    printNext();
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
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsResonanz.includes(type)) return;
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
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsKybernetik.includes(type)) return;
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
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsScanner.includes(type)) return;
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
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsDekont.includes(type)) return;
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


// === ANOMALIE-DETEKTOR ===
const menuAnomalie = `
<div id="menu-anomalie-detektor" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ TEMPORAL-WARNLEUCHTE ]</b><p style="font-size:0.7em; color:#aaa;">Rotierendes violettes Warnlicht bei Riss-Detektion.</p><button id="btn-buy-lampe-anomalie" onclick="window.buyFurniture('lampe_anomalie', 140)" class="btn-upgrade-exec">KAUFEN (140 C)</button></div>
    <div class="upgrade-card"><b>[ HOLO-ZEITRISS-SCANNER ]</b><p style="font-size:0.7em; color:#aaa;">Rotierende Radarschale mit Hologramm-Sweep.</p><button id="btn-buy-risz-scanner" onclick="window.buyFurniture('risz_scanner', 950)" class="btn-upgrade-exec">KAUFEN (950 C)</button></div>
    <div class="upgrade-card"><b>[ CHRONON-RESONANZKRISTALL ]</b><p style="font-size:0.7em; color:#aaa;">Schwebender Kristall mit umlaufenden Chronon-Partikeln.</p><button id="btn-buy-chronon-kristall" onclick="window.buyFurniture('chronon_kristall', 3000)" class="btn-upgrade-exec" style="background:#c0f; color:#000; border:1px solid #c0f;">KAUFEN (3000 C + 40 MZ)</button></div>
</div>`;
if (!document.getElementById('menu-anomalie-detektor')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuAnomalie);

const itemsAnomalie = ['lampe_anomalie','risz_scanner','chronon_kristall'];
itemsAnomalie.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_AD = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_AD === 'function') oldUpdateAusbau_AD();
    if (typeof inventory === 'undefined') return;
    const limitsAD = { lampe_anomalie:1, risz_scanner:1, chronon_kristall:1 };
    for (let k in limitsAD) {
        let max = limitsAD[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_AD = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_AD) oldOpenRoom_AD(type);
    const m = document.getElementById('menu-anomalie-detektor');
    if (m) m.style.display = (type === 'ANOMALIE-DETEKTOR') ? 'flex' : 'none';
    if (type === 'ANOMALIE-DETEKTOR') { const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important'); window.reloadFurniture(type); window.updateAusbauButtons(); }
};

const oldBuyFurniture_AD = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsAnomalie.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'chronon_kristall'); let costC = cost; let costMZ = isMZ ? 40 : 0;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? "System: 3000 C + 40 MZ benötigt." : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_AD) oldBuyFurniture_AD(type, cost);
};

const oldReload_AD = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_AD) oldReload_AD(type);
    if (type === 'ANOMALIE-DETEKTOR') {
        if (inventory.lampe_anomalie > 0) window.spawnFurniture('lampe_anomalie', 1);
        if (inventory.risz_scanner > 0) window.spawnFurniture('risz_scanner', 1);
        if (inventory.chronon_kristall > 0) window.spawnFurniture('chronon_kristall', 1);
    }
};

const oldSpawn_AD = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_AD) oldSpawn_AD(type, count);
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsAnomalie.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'lampe_anomalie') {
        item.classList.add('item-lampe-anomalie');
        item.innerHTML = '<div class="la-mount"></div><div class="la-beacon"></div><div class="la-sweep"></div>';
    } else if (type === 'risz_scanner') {
        item.classList.add('item-risz-scanner');
        item.innerHTML = '<div class="rs-dish"><div class="rs-sweep-line"></div><div class="rs-blip"></div></div><div class="rs-stand"></div>';
    } else if (type === 'chronon_kristall') {
        item.classList.add('item-chronon-kristall');
        item.innerHTML = '<div class="ck-crystal"></div><div class="ck-orbit"><div class="ck-particle"></div></div><div class="ck-orbit ck-o2"><div class="ck-particle"></div></div><div class="ck-glow-base"></div>';
    }
    room.appendChild(item);
};


// === KRYO-DEPOT ===
const menuKryo = `
<div id="menu-kryo-depot" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ FROSTLICHT-LEUCHTE ]</b><p style="font-size:0.7em; color:#aaa;">Eisblau flackernde Deckenlampe.</p><button id="btn-buy-lampe-kryo" onclick="window.buyFurniture('lampe_kryo', 150)" class="btn-upgrade-exec">KAUFEN (150 C)</button></div>
    <div class="upgrade-card"><b>[ KRYO-STASIS-KAPSEL ]</b><p style="font-size:0.7em; color:#aaa;">Vertikale Kapsel, Nebel wallt am Glas.</p><button id="btn-buy-kryo-kapsel" onclick="window.buyFurniture('kryo_kapsel', 1100)" class="btn-upgrade-exec">KAUFEN (1100 C)</button></div>
    <div class="upgrade-card"><b>[ PERMAFROST-PROBENREGAL ]</b><p style="font-size:0.7em; color:#aaa;">Regal mit gefrorenen, leuchtenden Proben.</p><button id="btn-buy-probenregal" onclick="window.buyFurniture('probenregal', 2900)" class="btn-upgrade-exec" style="background:#0ff; color:#000; border:1px solid #0ff;">KAUFEN (2900 C + 35 MZ)</button></div>
</div>`;
if (!document.getElementById('menu-kryo-depot')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuKryo);

const itemsKryo = ['lampe_kryo','kryo_kapsel','probenregal'];
itemsKryo.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_KD = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_KD === 'function') oldUpdateAusbau_KD();
    if (typeof inventory === 'undefined') return;
    const limitsKD = { lampe_kryo:1, kryo_kapsel:1, probenregal:1 };
    for (let k in limitsKD) {
        let max = limitsKD[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_KD = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_KD) oldOpenRoom_KD(type);
    const m = document.getElementById('menu-kryo-depot');
    if (m) m.style.display = (type === 'KRYO-DEPOT') ? 'flex' : 'none';
    if (type === 'KRYO-DEPOT') { const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important'); window.reloadFurniture(type); window.updateAusbauButtons(); }
};

const oldBuyFurniture_KD = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsKryo.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'probenregal'); let costC = cost; let costMZ = isMZ ? 35 : 0;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? "System: 2900 C + 35 MZ benötigt." : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_KD) oldBuyFurniture_KD(type, cost);
};

const oldReload_KD = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_KD) oldReload_KD(type);
    if (type === 'KRYO-DEPOT') {
        if (inventory.lampe_kryo > 0) window.spawnFurniture('lampe_kryo', 1);
        if (inventory.kryo_kapsel > 0) window.spawnFurniture('kryo_kapsel', 1);
        if (inventory.probenregal > 0) window.spawnFurniture('probenregal', 1);
    }
};

const oldSpawn_KD = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_KD) oldSpawn_KD(type, count);
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsKryo.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'lampe_kryo') {
        item.classList.add('item-lampe-kryo');
        item.innerHTML = '<div class="lk-mount"></div><div class="lk-bulb"></div><div class="lk-frost-mist"></div>';
    } else if (type === 'kryo_kapsel') {
        item.classList.add('item-kryo-kapsel');
        item.innerHTML = '<div class="kk-pod"><div class="kk-silhouette"></div><div class="kk-mist"></div><div class="kk-mist m2"></div><div class="kk-frost-glass"></div></div><div class="kk-base"></div>';
    } else if (type === 'probenregal') {
        item.classList.add('item-probenregal');
        item.innerHTML = '<div class="pr-shelf"><div class="pr-sample"></div><div class="pr-sample"></div><div class="pr-sample"></div></div><div class="pr-shelf pr-s2"><div class="pr-sample"></div><div class="pr-sample"></div></div><div class="pr-drip"></div>';
    }
    room.appendChild(item);
};


// === FUNK-RELAIS "HORIZONT" ===
const menuFunkRelais = `
<div id="menu-funk-relais-horizont" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card" style="border-color:#c060ff;">
        <b style="color:#c060ff;">[ ZEITREISE-AUFTRAG ]</b>
        <div id="horizon-mission-status" style="font-size:0.75em; color:#aaa; margin-top:6px;">Kein aktiver Auftrag.</div>
    </div>
    <div class="upgrade-card"><b>[ SIGNAL-BLINKLICHT ]</b><p style="font-size:0.7em; color:#aaa;">Rot-weiß blinkendes Antennenlicht.</p><button id="btn-buy-lampe-funk" onclick="window.buyFurniture('lampe_funk', 130)" class="btn-upgrade-exec">KAUFEN (130 C)</button></div>
    <div class="upgrade-card"><b>[ PARABOL-ANTENNE 'HORIZONT' ]</b><p style="font-size:0.7em; color:#aaa;">Rotierende Schüssel, sendet Signalwellen aus.</p><button id="btn-buy-parabol-antenne" onclick="window.buyFurniture('parabol_antenne', 1000)" class="btn-upgrade-exec">KAUFEN (1000 C)</button></div>
    <div class="upgrade-card"><b>[ SUBRAUM-FREQUENZMODULATOR ]</b><p style="font-size:0.7em; color:#aaa;">Konsole mit lebendiger Wellenform-Anzeige.</p><button id="btn-buy-subraum-modulator" onclick="window.buyFurniture('subraum_modulator', 3100)" class="btn-upgrade-exec" style="background:#08f; color:#000; border:1px solid #08f;">KAUFEN (3100 C + 45 MZ)</button></div>
</div>`;
if (!document.getElementById('menu-funk-relais-horizont')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuFunkRelais);

const itemsFunkRelais = ['lampe_funk','parabol_antenne','subraum_modulator'];
itemsFunkRelais.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_FR = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_FR === 'function') oldUpdateAusbau_FR();
    if (typeof inventory === 'undefined') return;
    const limitsFR = { lampe_funk:1, parabol_antenne:1, subraum_modulator:1 };
    for (let k in limitsFR) {
        let max = limitsFR[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_FR = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_FR) oldOpenRoom_FR(type);
    const m = document.getElementById('menu-funk-relais-horizont');
    if (m) m.style.display = (type === 'FUNK-RELAIS "HORIZONT"') ? 'flex' : 'none';
    if (type === 'FUNK-RELAIS "HORIZONT"') {
        const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important');
        window.reloadFurniture(type); window.updateAusbauButtons();
        if (typeof renderHorizonStatus === 'function') renderHorizonStatus();
    }
};

function renderHorizonStatus() {
    const box = document.getElementById('horizon-mission-status');
    if (!box) return;
    const missions = Array.isArray(gameState.horizonMissions) ? gameState.horizonMissions : [];
    if (missions.length > 0) {
        box.innerHTML = missions.length + ' aktive' + (missions.length === 1 ? 'r Auftrag' : ' Aufträge') + '<br>' +
            '<button class="btn-upgrade-exec" style="margin-top:8px; background:#c060ff; color:#000; border:1px solid #c060ff;" onclick="window.showHorizonBriefing()">📡 BRIEFINGS ANZEIGEN</button>';
    } else {
        box.innerHTML = 'Kein aktiver Auftrag. Weise einen Agenten für 30min zu, um einen neuen Zeitreise-Auftrag zu empfangen.';
    }
}

window.showHorizonBriefing = function() {
    const missions = Array.isArray(gameState.horizonMissions) ? gameState.horizonMissions : [];
    if (missions.length === 0) { if (typeof showCustomAlert === 'function') showCustomAlert('Kein aktiver Auftrag.'); return; }
    const overlay = document.getElementById('horizon-briefing-overlay');
    const list = document.getElementById('horizon-briefing-list');
    if (list) {
        list.innerHTML = missions.map(m =>
            '<div style="border:1px solid rgba(192,96,255,0.4); border-radius:4px; padding:8px 10px; margin-bottom:8px; text-align:left;">' +
                '<div style="font-size:0.9em; color:#e0c0ff;">' + m.briefing + '</div>' +
                '<div style="font-size:0.75em; color:#aaa; margin-top:4px;">Zieljahr: <b style="color:#c060ff;">' + m.year + '</b></div>' +
            '</div>'
        ).join('');
    }
    if (overlay) overlay.style.display = 'flex';
};
window.closeHorizonBriefing = function() {
    const overlay = document.getElementById('horizon-briefing-overlay');
    if (overlay) overlay.style.display = 'none';
};

const oldBuyFurniture_FR = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsFunkRelais.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'subraum_modulator'); let costC = cost; let costMZ = isMZ ? 45 : 0;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? "System: 3100 C + 45 MZ benötigt." : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_FR) oldBuyFurniture_FR(type, cost);
};

const oldReload_FR = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_FR) oldReload_FR(type);
    if (type === 'FUNK-RELAIS "HORIZONT"') {
        if (inventory.lampe_funk > 0) window.spawnFurniture('lampe_funk', 1);
        if (inventory.parabol_antenne > 0) window.spawnFurniture('parabol_antenne', 1);
        if (inventory.subraum_modulator > 0) window.spawnFurniture('subraum_modulator', 1);
    }
};

const oldSpawn_FR = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_FR) oldSpawn_FR(type, count);
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsFunkRelais.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'lampe_funk') {
        item.classList.add('item-lampe-funk');
        item.innerHTML = '<div class="lf-pole"></div><div class="lf-light"></div>';
    } else if (type === 'parabol_antenne') {
        item.classList.add('item-parabol-antenne');
        item.innerHTML = '<div class="pa-dish"><div class="pa-emitter"></div></div><div class="pa-wave"></div><div class="pa-wave w2"></div><div class="pa-stand"></div>';
    } else if (type === 'subraum_modulator') {
        item.classList.add('item-subraum-modulator');
        item.innerHTML = '<div class="sm-console"><div class="sm-wave-bar"></div><div class="sm-wave-bar"></div><div class="sm-wave-bar"></div><div class="sm-wave-bar"></div><div class="sm-wave-bar"></div><div class="sm-screen-glow"></div></div>';
    }
    room.appendChild(item);
};


// === KI-KERNMATRIX ===
const menuKiKern = `
<div id="menu-ki-kernmatrix" style="display:none; flex-direction:column; gap:15px;">
    <div class="upgrade-card"><b>[ NEURONALE STATUSLAMPE ]</b><p style="font-size:0.7em; color:#aaa;">Farbwechselnde Lampe im Takt neuronaler Pulse.</p><button id="btn-buy-lampe-ki" onclick="window.buyFurniture('lampe_ki', 160)" class="btn-upgrade-exec">KAUFEN (160 C)</button></div>
    <div class="upgrade-card"><b>[ HOLO-NEURONALES NETZ ]</b><p style="font-size:0.7em; color:#aaa;">Schwebende Drahtgitter-Kugel mit pulsierenden Knoten.</p><button id="btn-buy-holo-netz" onclick="window.buyFurniture('holo_netz', 1050)" class="btn-upgrade-exec">KAUFEN (1050 C)</button></div>
    <div class="upgrade-card"><b>[ QUANTEN-DATENKERN ]</b><p style="font-size:0.7em; color:#aaa;">Rotierender Zylinder mit durchlaufenden Datenströmen.</p><button id="btn-buy-daten-kern" onclick="window.buyFurniture('daten_kern', 3300)" class="btn-upgrade-exec" style="background:#0fc; color:#000; border:1px solid #0fc;">KAUFEN (3300 C + 50 MZ)</button></div>
</div>`;
if (!document.getElementById('menu-ki-kernmatrix')) document.getElementById('ausbau-menu').insertAdjacentHTML('beforeend', menuKiKern);

const itemsKiKern = ['lampe_ki','holo_netz','daten_kern'];
itemsKiKern.forEach(item => { if(typeof inventory !== 'undefined' && inventory[item] === undefined) inventory[item] = 0; });

const oldUpdateAusbau_KI = window.updateAusbauButtons;
window.updateAusbauButtons = function() {
    if (typeof oldUpdateAusbau_KI === 'function') oldUpdateAusbau_KI();
    if (typeof inventory === 'undefined') return;
    const limitsKI = { lampe_ki:1, holo_netz:1, daten_kern:1 };
    for (let k in limitsKI) {
        let max = limitsKI[k], current = parseInt(inventory[k])||0;
        let btn = document.getElementById('btn-buy-'+k.replace(/_/g,'-'));
        if (btn) {
            if (current >= max) { btn.innerText="[ INSTALLIERT ]"; btn.disabled=true; btn.style.setProperty('background','#333','important'); btn.style.setProperty('color','#555','important'); btn.style.setProperty('border','1px solid #333','important'); btn.style.setProperty('cursor','not-allowed','important'); }
            else { btn.disabled=false; btn.style.background=""; btn.style.color=""; btn.style.border=""; btn.style.cursor="pointer"; }
        }
    }
};

const oldOpenRoom_KI = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_KI) oldOpenRoom_KI(type);
    const m = document.getElementById('menu-ki-kernmatrix');
    if (m) m.style.display = (type === 'KI-KERNMATRIX') ? 'flex' : 'none';
    if (type === 'KI-KERNMATRIX') { const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display','none','important'); window.reloadFurniture(type); window.updateAusbauButtons(); }
};

const oldBuyFurniture_KI = window.buyFurniture;
window.buyFurniture = async (type, cost) => {
    if (itemsKiKern.includes(type)) {
        let current = parseInt(inventory[type])||0; if (current >= 1) return;
        let isMZ = (type === 'daten_kern'); let costC = cost; let costMZ = isMZ ? 50 : 0;
        if (gameState.credits >= costC && gameState.materieZellen >= costMZ) {
            gameState.credits -= costC; document.getElementById('display-credits').innerText = gameState.credits;
            if (isMZ) { gameState.materieZellen -= costMZ; document.getElementById('display-mz').innerText = gameState.materieZellen; window._saveMZ(); }
            inventory[type] = current + 1; window.updateAusbauButtons(); window.spawnFurniture(type, inventory[type]);
        } else { let msg = isMZ ? "System: 3300 C + 50 MZ benötigt." : "System: Credits unzureichend."; if(typeof showCustomAlert === 'function') showCustomAlert(msg); }
    } else if (oldBuyFurniture_KI) oldBuyFurniture_KI(type, cost);
};

const oldReload_KI = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_KI) oldReload_KI(type);
    if (type === 'KI-KERNMATRIX') {
        if (inventory.lampe_ki > 0) window.spawnFurniture('lampe_ki', 1);
        if (inventory.holo_netz > 0) window.spawnFurniture('holo_netz', 1);
        if (inventory.daten_kern > 0) window.spawnFurniture('daten_kern', 1);
    }
};

const oldSpawn_KI = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_KI) oldSpawn_KI(type, count);
    const room = document.getElementById(window._roomAreaTargetId || 'room-area'); if (!room || !itemsKiKern.includes(type)) return;
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (type === 'lampe_ki') {
        item.classList.add('item-lampe-ki');
        item.innerHTML = '<div class="lki-mount"></div><div class="lki-bulb"></div>';
    } else if (type === 'holo_netz') {
        item.classList.add('item-holo-netz');
        item.innerHTML = '<div class="hn-sphere"><div class="hn-ring"></div><div class="hn-ring hn-r2"></div><div class="hn-ring hn-r3"></div><div class="hn-node"></div><div class="hn-node hn-n2"></div><div class="hn-node hn-n3"></div></div><div class="hn-stand"></div>';
    } else if (type === 'daten_kern') {
        item.classList.add('item-daten-kern');
        item.innerHTML = '<div class="dk-cylinder"><div class="dk-stream"></div><div class="dk-stream ds2"></div><div class="dk-stream ds3"></div><div class="dk-core-glow"></div></div><div class="dk-base"></div>';
    }
    room.appendChild(item);
};


/* ==== next block ==== */


// === TRANSFORMATOREN-STATION: Tauschfunktion (Credits -> Materiezellen) ===
window.openTransformatorPopup = function() {
    const btn = document.getElementById('btn-transformator-exchange');
    if (btn) btn.innerText = 'TAUSCHEN (' + scaledTransformatorCostCredits(roomLevelOf('TRANSFORMATOREN-STATION')) + ' C → 1 MZ)';
    const overlay = document.getElementById('transformator-popup-overlay');
    if (overlay) overlay.style.display = 'flex';
};
window.closeTransformatorPopup = function() {
    const overlay = document.getElementById('transformator-popup-overlay');
    if (overlay) overlay.style.display = 'none';
};
window.exchangeCreditsForMZ = async function() {
    const cost = scaledTransformatorCostCredits(roomLevelOf('TRANSFORMATOREN-STATION'));
    if (gameState.credits >= cost) {
        gameState.credits -= cost;
        gameState.materieZellen += 1;
        updateUI();
        await saveGameState();
        if (typeof showInfoToast === 'function') showInfoToast('Tausch erfolgreich: ' + cost + ' Credits → 1 Materiezelle.');
    } else {
        if (typeof showCustomAlert === 'function') showCustomAlert('System: Nicht genügend Credits für den Tausch (' + cost + ' C benötigt).');
    }
};

// === RENAISSANCE-GENERATOR: bidirektionale Tauschfunktion (Credits <-> Chronos-Zellen) ===
window.openRenaissancePopup = function() {
    const btn = document.getElementById('btn-renaissance-sell');
    if (btn) btn.innerText = 'VERKAUFEN: 1 Chronos-Zelle → ' + scaledRenaissanceSellCredits(roomLevelOf('RENAISSANCE-GENERATOR')).toLocaleString('de-DE') + ' C';
    const overlay = document.getElementById('renaissance-popup-overlay');
    if (overlay) overlay.style.display = 'flex';
};
window.closeRenaissancePopup = function() {
    const overlay = document.getElementById('renaissance-popup-overlay');
    if (overlay) overlay.style.display = 'none';
};
window.sellChronosZelle = async function() {
    if (gameState.chronosZellen >= 1) {
        const payout = scaledRenaissanceSellCredits(roomLevelOf('RENAISSANCE-GENERATOR'));
        gameState.chronosZellen -= 1;
        gameState.credits += payout;
        updateUI();
        await saveGameState();
        if (typeof showInfoToast === 'function') showInfoToast('Tausch erfolgreich: 1 Chronos-Zelle → ' + payout + ' Credits.');
    } else {
        if (typeof showCustomAlert === 'function') showCustomAlert('System: Keine Chronos-Zelle zum Verkaufen vorhanden.');
    }
};

// === PARADOXON-FILTER: visueller Quanten-Warp-Effekt (Strahl ins Archiv / Verpuffung) ===
// Läuft als eigenständiges Vollbild-Overlay, unabhängig davon, welcher Raum gerade geöffnet ist -
// so wird der Effekt garantiert sichtbar, auch wenn der Zyklus im Hintergrund abgeschlossen wird.
window.triggerParadoxWarpEffect = function(success) {
    const overlay = document.getElementById('paradox-warp-overlay');
    if (!overlay) return;
    overlay.innerHTML = success
        ? '<div class="warp-beam"></div><div class="warp-result warp-success">⚡ ARTEFAKT ERFOLGREICH TELEPORTIERT ⚡</div>'
        : '<div class="warp-fizzle"></div><div class="warp-result warp-fail">✕ QUANTEN-WARP FEHLGESCHLAGEN ✕</div>';
    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
    }, success ? 2600 : 1800);
};

// === SUBRAUM-NEXUS: VIP-Raum mit 5 interaktiven Stationen ===
// Anders als zuerst umgesetzt: die 5 Stationen sind ECHTE, physische Gegenstände im Raum
// selbst (wie der Zeitmaschinen-Kern in der Forge oder das Regal im Archiv) - kein
// separates Menü-Popup. Immer alle 5 vorhanden, sobald der Raum gebaut ist, kein Kauf nötig.
const itemsSubraumNexus = ['sn_holoprojektor', 'sn_biokapsel', 'sn_schattenterminal', 'sn_rohrpost', 'sn_infostand'];

const oldOpenRoom_SN = window.openRoom;
window.openRoom = (type) => {
    if (oldOpenRoom_SN) oldOpenRoom_SN(type);
    if (type === 'SUBRAUM-NEXUS') {
        const ph = document.getElementById('menu-platzhalter'); if (ph) ph.style.setProperty('display', 'none', 'important');
        if (typeof window.reloadFurniture === 'function') window.reloadFurniture(type);
    }
};

const oldReload_SN = window.reloadFurniture;
window.reloadFurniture = (type) => {
    if (oldReload_SN) oldReload_SN(type);
    if (type === 'SUBRAUM-NEXUS') {
        itemsSubraumNexus.forEach(item => window.spawnFurniture(item, 1));
    }
};

const oldSpawn_SN = window.spawnFurniture;
window.spawnFurniture = (type, count) => {
    if (oldSpawn_SN) oldSpawn_SN(type, count);
    const room = document.getElementById(window._roomAreaTargetId || 'room-area');
    if (!room || !itemsSubraumNexus.includes(type)) return;
    // In der großen Detailansicht klickbar, in der kleinen Vorschau der Aktive-Basis-Übersicht
    // NUR sichtbar (kein eigener Klick-Handler) - dort soll ein Klick weiterhin den gesamten
    // Raum öffnen, statt von einem einzelnen Gegenstand abgefangen zu werden.
    const isDetailView = (!window._roomAreaTargetId || window._roomAreaTargetId === 'room-area');
    const item = document.createElement('div'); item.classList.add('fixed-item');
    if (!isDetailView) item.style.pointerEvents = 'none';
    if (type === 'sn_holoprojektor') {
        item.classList.add('item-sn-holoprojektor');
        item.innerHTML =
            '<div class="sn-holo-screen"><div class="sn-holo-flicker"></div><div class="sn-holo-scanline"></div></div>' +
            '<div class="sn-holo-base"></div>';
        if (isDetailView) item.onclick = (ev) => { ev.stopPropagation(); window.openHoloprojektor(); };
    } else if (type === 'sn_biokapsel') {
        item.classList.add('item-sn-biokapsel');
        item.innerHTML =
            '<div class="sn-kapsel-tube"><div class="sn-kapsel-liquid"></div><div class="sn-kapsel-bubble b1"></div><div class="sn-kapsel-bubble b2"></div><div class="sn-kapsel-bubble b3"></div></div>' +
            '<div class="sn-kapsel-base"></div>';
        if (isDetailView) item.onclick = (ev) => { ev.stopPropagation(); window.openBioKapsel(); };
    } else if (type === 'sn_schattenterminal') {
        item.classList.add('item-sn-schattenterminal');
        item.innerHTML =
            '<div class="sn80-monitor"><div class="sn80-screen"></div><div class="sn80-vents"><span></span><span></span><span></span><span></span></div></div>' +
            '<div class="sn80-keyboard"></div>';
        if (isDetailView) item.onclick = (ev) => { ev.stopPropagation(); window.openSchattensyndikat(); };
    } else if (type === 'sn_rohrpost') {
        item.classList.add('item-sn-rohrpost');
        if (isDetailView) item.id = 'sn-rohrpost-item';
        item.innerHTML =
            '<div class="sn-rohrpost-pipe"></div>' +
            '<div class="sn-rohrpost-box"><div class="sn-rohrpost-slot"></div><div class="sn-rohrpost-light"></div></div>';
        if (isDetailView) item.onclick = (ev) => { ev.stopPropagation(); window.openRohrpost(); };
    } else if (type === 'sn_infostand') {
        item.classList.add('item-sn-infostand');
        item.innerHTML = '<div class="sn-info-icon">ℹ</div><div class="sn-info-base"></div>';
        if (isDetailView) item.onclick = (ev) => { ev.stopPropagation(); window.openSubraumInfo(); };
    }
    room.appendChild(item);
    if (type === 'sn_rohrpost' && typeof updateRohrpostVisual === 'function') updateRohrpostVisual();
};

// --- Infostand ---
window.openSubraumInfo = function() {
    const overlay = document.getElementById('subraum-info-overlay');
    if (overlay) overlay.style.display = 'flex';
};
window.closeSubraumInfo = function() {
    const overlay = document.getElementById('subraum-info-overlay');
    if (overlay) overlay.style.display = 'none';
};

// --- Bio-Rekonstruktions-Kapsel ---
window.openBioKapsel = function() {
    const list = document.getElementById('biokapsel-list');
    const dead = Array.isArray(gameState.deadAgents) ? gameState.deadAgents : [];
    if (list) {
        if (dead.length === 0) {
            list.innerHTML = '<p style="font-size:0.75em; color:#666; font-style:italic;">Keine gestorbenen Agenten zu rekonstruieren.</p>';
        } else {
            list.innerHTML = dead.map((d, i) =>
                '<div class="upgrade-card" style="text-align:left;">' +
                    '<b>' + (d.isStarter ? '★ Starter-Agent' : 'Agent') + ' · Lvl ' + d.level + '</b>' +
                    '<p style="font-size:0.7em; color:#aaa; margin:4px 0;">Gestorben in: ' + d.diedIn + '</p>' +
                    '<button class="btn-upgrade-exec" style="background:#0f8; color:#000; border:1px solid #0f8;" onclick="window.reviveDeadAgent(' + i + ')">WIEDERBELEBEN (25 Chronos-Zellen)</button>' +
                '</div>'
            ).join('');
        }
    }
    const overlay = document.getElementById('subraum-biokapsel-overlay');
    if (overlay) overlay.style.display = 'flex';
};
window.closeBioKapsel = function() {
    const overlay = document.getElementById('subraum-biokapsel-overlay');
    if (overlay) overlay.style.display = 'none';
};
window.reviveDeadAgent = async function(idx) {
    const cost = 25;
    if (!Array.isArray(gameState.deadAgents) || !gameState.deadAgents[idx]) return;
    if (gameState.chronosZellen < cost) {
        if (typeof showCustomAlert === 'function') showCustomAlert('System: Nicht genügend Chronos-Zellen (25 benötigt).');
        return;
    }
    const dead = gameState.deadAgents[idx];
    gameState.chronosZellen -= cost;
    gameState.deadAgents.splice(idx, 1);
    const newAgent = {
        id: 'agent_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        level: dead.level,
        location: 'SUBRAUM-NEXUS',
        state: 'idle',
        targetRoom: null,
        taskStartTs: null,
        taskDurationMs: null,
        isStarter: dead.isStarter
    };
    gameState.agents.push(newAgent);
    updateUI();
    await saveGameState();
    if (typeof showInfoToast === 'function') showInfoToast('Agent erfolgreich rekonstruiert - fährt mit dem Aufzug zur Zentrale.');
    window.closeBioKapsel();
    // Zur Aktive-Basis-Übersicht wechseln, BEVOR die Fahrt beginnt - playElevatorAnimation
    // greift nur, wenn bunkerActive true ist, was innerhalb der Raum-Detailansicht (hier sind
    // wir gerade, da die Kapsel nur von dort aus geöffnet werden kann) nicht der Fall ist. Ohne
    // diesen Wechsel lief die komplette Fahrt bisher unsichtbar im Hintergrund ab.
    if (typeof window.showAktiveBasis === 'function') window.showAktiveBasis();
    if (typeof sendAgentHome === 'function') sendAgentHome(newAgent);
    await saveGameState();
};

// --- Schattensyndikat-Terminal ---
window.openSchattensyndikat = function() {
    const list = document.getElementById('schatten-list');
    const collected = Array.isArray(gameState.collectedArtifacts) ? gameState.collectedArtifacts : [];
    const missing = ARTEFAKTE.filter(a => !collected.includes(a.name));
    if (list) {
        if (missing.length === 0) {
            list.innerHTML = '<p style="font-size:0.75em; color:#666; font-style:italic;">Sammlung bereits vollständig - nichts mehr zu kaufen.</p>';
        } else {
            list.innerHTML = missing.map(a =>
                '<div class="upgrade-card" style="text-align:left;">' +
                    '<b>' + a.name + '</b>' +
                    '<button class="btn-upgrade-exec" style="background:#f44; color:#000; border:1px solid #f44; margin-top:6px;" onclick="window.buyBlackMarketArtifact(\'' + a.name.replace(/'/g, "\\'") + '\')">KAUFEN (100.000 C + 10 MZ)</button>' +
                '</div>'
            ).join('');
        }
    }
    const overlay = document.getElementById('subraum-schatten-overlay');
    if (overlay) overlay.style.display = 'flex';
};
window.closeSchattensyndikat = function() {
    const overlay = document.getElementById('subraum-schatten-overlay');
    if (overlay) overlay.style.display = 'none';
};
window.buyBlackMarketArtifact = async function(name) {
    const costC = 100000, costMZ = 10;
    if (gameState.credits < costC || gameState.materieZellen < costMZ) {
        if (typeof showCustomAlert === 'function') showCustomAlert('System: Nicht genügend Ressourcen (100.000 C + 10 MZ benötigt).');
        return;
    }
    if (!Array.isArray(gameState.collectedArtifacts)) gameState.collectedArtifacts = [];
    if (gameState.collectedArtifacts.includes(name)) { window.openSchattensyndikat(); return; }
    gameState.credits -= costC;
    gameState.materieZellen -= costMZ;
    gameState.collectedArtifacts.push(name);
    updateUI();
    await saveGameState();
    if (typeof renderArtifactCollection === 'function') renderArtifactCollection();
    if (typeof showInfoToast === 'function') showInfoToast('Artefakt vom Schwarzmarkt erworben: ' + name);
    window.openSchattensyndikat(); // Liste neu aufbauen (Artefakt jetzt raus)
};

// --- Temporale Rohrpost: Admin-Drops mit Bau-Zeitpunkt-Snapshot ---
// Admin schreibt "pendingDrop" direkt in JEDES berechtigten Spielers "Agent - Base"-Dokument
// (die Admin-Schreibrechte dafür existieren in firestore.rules schon: isAdminUser() darf JEDES
// "Agent - Base"-Dokument beschreiben). Nur Spieler, die SUBRAUM-NEXUS zum Versandzeitpunkt
// bereits gebaut hatten, bekommen den Eintrag - später gebaute Räume erhalten nichts rückwirkend.
function updateRohrpostVisual() {
    const item = document.getElementById('sn-rohrpost-item');
    if (item) item.classList.toggle('sn-rohrpost-pending', !!gameState.pendingDrop);
}
function renderRohrpostStatus() { updateRohrpostVisual(); }

window.openRohrpost = async function() {
    if (isAdminSession) {
        // --- Admin-Ansicht: Versand-Formular ---
        const overlay = document.getElementById('rohrpost-admin-overlay');
        const info = document.getElementById('rohrpost-admin-eligible');
        if (info) info.innerText = 'Lade Empfänger...';
        if (overlay) overlay.style.display = 'flex';
        try {
            const snap = await window.getDocs(window.collection(window.db, "Agent - Base"));
            let count = 0;
            snap.forEach(d => {
                const bd = d.data().baseData;
                if (Array.isArray(bd) && bd.some(r => r.type === 'SUBRAUM-NEXUS')) count++;
            });
            if (info) info.innerText = count + ' Agent' + (count === 1 ? ' hat' : 'en haben') + ' den Subraum-Nexus bereits freigeschaltet und würde' + (count === 1 ? '' : 'n') + ' diese Sendung erhalten.';
        } catch (e) {
            console.error(e);
            if (info) info.innerText = 'Empfänger konnten nicht ermittelt werden.';
        }
        return;
    }
    // --- Spieler-Ansicht: Sendung abholen, falls vorhanden ---
    if (gameState.pendingDrop) {
        const d = gameState.pendingDrop;
        const resourceLabel = { credits: 'Credits', materiezellen: 'Materiezellen', chronoszellen: 'Chronos-Zellen' }[d.resourceType] || d.resourceType;
        const textEl = document.getElementById('rohrpost-claim-text');
        const msgEl = document.getElementById('rohrpost-claim-message');
        if (textEl) textEl.innerText = 'Eine Sendung der Administration ist eingetroffen: ' + d.amount + ' ' + resourceLabel + '.';
        if (msgEl) msgEl.innerText = d.message ? '„' + d.message + '"' : '';
        const overlay = document.getElementById('rohrpost-claim-overlay');
        if (overlay) overlay.style.display = 'flex';
    } else {
        if (typeof showCustomAlert === 'function') showCustomAlert('Keine Sendung vorhanden.');
    }
};

window.closeRohrpostAdmin = function() {
    const overlay = document.getElementById('rohrpost-admin-overlay');
    if (overlay) overlay.style.display = 'none';
};

window.sendRohrpostDrop = async function() {
    const resourceType = document.getElementById('rohrpost-admin-resource').value;
    const amount = parseInt(document.getElementById('rohrpost-admin-amount').value) || 0;
    const message = document.getElementById('rohrpost-admin-message').value.trim();
    if (amount <= 0) { if (typeof showCustomAlert === 'function') showCustomAlert('Menge muss größer als 0 sein.'); return; }

    try {
        const snap = await window.getDocs(window.collection(window.db, "Agent - Base"));
        const drop = { resourceType, amount, message, sentAt: Date.now() };
        let count = 0;
        const writes = [];
        snap.forEach(d => {
            const bd = d.data().baseData;
            if (Array.isArray(bd) && bd.some(r => r.type === 'SUBRAUM-NEXUS')) {
                writes.push(window.setDoc(window.doc(window.db, "Agent - Base", d.id), { pendingDrop: drop }, { merge: true }));
                count++;
            }
        });
        await Promise.all(writes);
        if (typeof showInfoToast === 'function') showInfoToast('Sendung an ' + count + ' Agent' + (count === 1 ? '' : 'en') + ' versendet.');
        window.closeRohrpostAdmin();
    } catch (e) {
        console.error(e);
        if (typeof showCustomAlert === 'function') showCustomAlert('Versand fehlgeschlagen.');
    }
};

window.claimRohrpostDrop = async function() {
    if (!gameState.pendingDrop) return;
    const d = gameState.pendingDrop;
    if (d.resourceType === 'credits') gameState.credits += d.amount;
    else if (d.resourceType === 'materiezellen') gameState.materieZellen += d.amount;
    else if (d.resourceType === 'chronoszellen') gameState.chronosZellen += d.amount;
    gameState.pendingDrop = null;
    updateUI();
    updateRohrpostVisual();
    await saveGameState();
    try {
        await window.setDoc(window.doc(window.db, "Agent - Base", window.agentSlug(currentAgentName)), { pendingDrop: null }, { merge: true });
    } catch (e) { console.error(e); }
    const overlay = document.getElementById('rohrpost-claim-overlay');
    if (overlay) overlay.style.display = 'none';
    if (typeof showInfoToast === 'function') showInfoToast('Sendung entnommen.');
};

// --- Holoprojektor: Direktkanal zur Administration, baut auf dem bestehenden Komm-Link-System
// auf (gleiche Firestore-Collection "agenten_funk", gleiches Kanal-/Nachrichtenschema) - der
// Admin sieht neue Nachrichten dadurch automatisch als normalen ungelesenen Chat im Komm-Link
// des Hauptterminals, inkl. der dort bereits vorhandenen "[NEUE NACHRICHT]"-Markierung. Kein
// separates Ping-System nötig.
let holoChatListener = null;
let holoChannelId = null;
let holoAdminSlug = null;

async function findAdminSlug() {
    if (holoAdminSlug) return holoAdminSlug;
    try {
        const q = window.query(window.collection(window.db, "agenten"), window.where("isAdmin", "==", true), window.limit(1));
        const snap = await window.getDocs(q);
        if (!snap.empty) { holoAdminSlug = snap.docs[0].id; return holoAdminSlug; }
    } catch (e) { console.error("Admin-Suche fehlgeschlagen:", e); }
    return null;
}

window.openHoloprojektor = async function() {
    const adminSlug = await findAdminSlug();
    if (!adminSlug) {
        if (typeof showCustomAlert === 'function') showCustomAlert('Kein Administrator-Kanal gefunden.');
        return;
    }
    const myName = window.agentSlug(currentAgentName);
    holoChannelId = [myName, adminSlug].sort().join("_");

    // Platzhalter-Kanal anlegen, falls noch keine Nachricht existiert (analog zu
    // window.openPrivateChat im Hauptterminal).
    window.setDoc(window.doc(window.db, "agenten_funk", holoChannelId), { ungelesen_fuer: "" }, { merge: true });

    const overlay = document.getElementById('holoprojektor-overlay');
    if (overlay) overlay.style.display = 'flex';

    if (holoChatListener) holoChatListener();
    const q = window.query(window.collection(window.db, "agenten_funk", holoChannelId, "nachrichten"), window.orderBy("zeitstempel", "asc"), window.limit(50));
    holoChatListener = window.onSnapshot(q, (snapshot) => {
        const win = document.getElementById('holo-chat-window');
        if (!win) return;
        win.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const isMe = (data.absender === currentAgentName);
            const msgDiv = document.createElement('div');
            msgDiv.style.cssText = isMe ? "color:#aaa; align-self:flex-end; text-align:right;" : "color:#0ff; align-self:flex-start; text-align:left;";
            const senderEl = document.createElement('b');
            senderEl.textContent = (isMe ? 'Du' : 'ADMINISTRATION') + ': ';
            const textEl = document.createElement('span');
            textEl.textContent = String(data.text || '');
            msgDiv.appendChild(senderEl);
            msgDiv.appendChild(textEl);
            win.appendChild(msgDiv);
        });
        win.scrollTop = win.scrollHeight;
    });
};

window.closeHoloprojektor = function() {
    const overlay = document.getElementById('holoprojektor-overlay');
    if (overlay) overlay.style.display = 'none';
    if (holoChatListener) { holoChatListener(); holoChatListener = null; }
};

window.sendHoloMsg = async function() {
    const inp = document.getElementById('holo-msg-input');
    const text = inp ? inp.value.trim() : '';
    if (text === '' || !holoChannelId) return;

    const cost = 1;
    if (gameState.chronosZellen < cost) {
        if (typeof showCustomAlert === 'function') showCustomAlert('System: Nicht genügend Chronos-Zellen (1 pro Nachricht benötigt).');
        return;
    }
    inp.value = '';
    try {
        const myName = window.agentSlug(currentAgentName);
        const msgRef = window.collection(window.db, "agenten_funk", holoChannelId, "nachrichten");
        await window.addDoc(msgRef, { absender: currentAgentName, text: text, zeitstempel: window.serverTimestamp() });
        const channelRef = window.doc(window.db, "agenten_funk", holoChannelId);
        await window.setDoc(channelRef, {
            teilnehmer: [myName, holoAdminSlug],
            ungelesen_fuer: holoAdminSlug,
            last_ping: Date.now()
        }, { merge: true });
        // Kosten erst NACH erfolgreichem Versand abziehen.
        gameState.chronosZellen -= cost;
        updateUI();
        await saveGameState();
    } catch (e) {
        console.error(e);
        if (typeof showCustomAlert === 'function') showCustomAlert('Nachricht konnte nicht gesendet werden.');
    }
};
