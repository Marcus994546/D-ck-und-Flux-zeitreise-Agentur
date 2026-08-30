// ============================================================
// SHARE-KARTEN: erzeugt teilbare Bild-Karten nach erfolgreichen Missionen und beim Sammeln von
// Artefakten. Läuft im Hauptterminal (index.html) und in der Basis (base.html), lädt daher
// keine eigene Firebase-Verbindung - nutzt window.db/window.agentName, die von der jeweiligen
// Seite bereits bereitgestellt werden.
//
// WICHTIG (Datenschutz): Es wird bewusst NUR der Stadt-/Ortsname aufgelöst (z.B. "Gummersbach"),
// niemals eine genaue Adresse oder Straße - ein Spieler soll kein Bild teilen können, das seinen
// exakten Standort öffentlich preisgibt.
// ============================================================

(function() {
    // --- Reverse-Geocoding: GPS-Koordinaten -> nur Stadt-/Ortsname ---
    // Nutzt Nominatim (OpenStreetMap), dieselbe kostenlose, schlüssellose API-Familie wie die
    // bereits vorhandene Overpass-Zielsuche im Spiel.
    async function loeseOrtsnamenAuf(lat, lng) {
        if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`, {
                headers: { 'Accept-Language': 'de' },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await res.json();
            const a = data.address || {};
            return a.city || a.town || a.village || a.municipality || a.county || null;
        } catch (e) {
            console.error('Ortsauflösung fehlgeschlagen (wird ohne Ortsname fortgesetzt):', e);
            return null;
        }
    }

    // --- Canvas-Rendering der Karte ---
    // Format 1080x1350 (Instagram-Story/Post-tauglich), im bestehenden Spiel-Look.
    async function zeichneKarte(optionen) {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1350;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 0, 1350);
        grad.addColorStop(0, '#020806');
        grad.addColorStop(1, '#000000');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1080, 1350);

        ctx.strokeStyle = 'rgba(0,255,204,0.06)';
        ctx.lineWidth = 1;
        for (let x = 0; x < 1080; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1350); ctx.stroke(); }
        for (let y = 0; y < 1350; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080, y); ctx.stroke(); }

        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 6;
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 25;
        ctx.strokeRect(30, 30, 1020, 1290);
        ctx.shadowBlur = 0;

        ctx.textAlign = 'center';
        ctx.fillStyle = '#0ff';
        ctx.font = '700 34px Orbitron, sans-serif';
        ctx.shadowColor = '#0ff'; ctx.shadowBlur = 15;
        ctx.fillText('DÜCK & FLUX ZEITREISEAGENTUR', 540, 130);
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(0,255,255,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(160, 165); ctx.lineTo(920, 165); ctx.stroke();

        ctx.font = '180px sans-serif';
        ctx.fillText(optionen.icon || '⏱', 540, 480);

        ctx.fillStyle = '#0ff';
        ctx.font = '700 56px Orbitron, sans-serif';
        ctx.shadowColor = '#0ff'; ctx.shadowBlur = 20;
        ctx.fillText(optionen.titel, 540, 590);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#e0fff8';
        ctx.font = '400 38px sans-serif';
        wrapText(ctx, optionen.untertitel, 540, 660, 880, 46);

        ctx.fillStyle = '#ffcc00';
        ctx.font = '700 32px Orbitron, sans-serif';
        ctx.fillText('AGENT: ' + optionen.agentName.toUpperCase(), 540, 800);

        if (optionen.belohnungZeilen && optionen.belohnungZeilen.length > 0) {
            ctx.fillStyle = 'rgba(0,255,204,0.08)';
            ctx.strokeStyle = 'rgba(0,255,204,0.5)';
            ctx.lineWidth = 2;
            const boxY = 850, boxH = 60 + optionen.belohnungZeilen.length * 46;
            ctx.fillRect(190, boxY, 700, boxH);
            ctx.strokeRect(190, boxY, 700, boxH);
            ctx.fillStyle = '#0f8';
            ctx.font = '700 28px sans-serif';
            ctx.fillText(optionen.boxLabel || 'BELOHNUNG', 540, boxY + 44);
            ctx.font = '400 30px sans-serif';
            ctx.fillStyle = '#dfffef';
            optionen.belohnungZeilen.forEach((zeile, i) => {
                ctx.fillText(zeile, 540, boxY + 90 + i * 46);
            });
        }

        ctx.fillStyle = '#88a';
        ctx.font = '400 26px sans-serif';
        const ortText = optionen.ort ? optionen.ort : 'Unbekannter Sektor';
        ctx.fillText('📍 ' + ortText + '  ·  ' + optionen.datum, 540, 1140);

        ctx.fillStyle = '#0ff';
        ctx.font = '700 30px Orbitron, sans-serif';
        ctx.shadowColor = '#0ff'; ctx.shadowBlur = 12;
        ctx.fillText('WERDE SELBST ZEITREISEAGENT →', 540, 1230);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#7dd';
        ctx.font = '400 26px sans-serif';
        ctx.fillText('marcus994546.github.io/D-ck-und-Flux-zeitreise-Agentur', 540, 1270);

        return canvas;
    }

    function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = String(text || '').split(' ');
        let line = '';
        let lines = [];
        for (const word of words) {
            const test = line + word + ' ';
            if (ctx.measureText(test).width > maxWidth && line !== '') {
                lines.push(line);
                line = word + ' ';
            } else {
                line = test;
            }
        }
        lines.push(line);
        lines.forEach((l, i) => ctx.fillText(l.trim(), x, y + i * lineHeight));
    }

    function stelleShareModalSicher() {
        if (document.getElementById('sharecard-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'sharecard-modal';
        modal.className = 'top-level';
        modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:80000; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;';
        modal.innerHTML = `
            <div style="width:100%; max-width:360px; text-align:center;">
                <div id="sharecard-preview-wrap" style="border:1px solid #0ff; box-shadow:0 0 25px rgba(0,255,255,0.4); border-radius:8px; overflow:hidden; margin-bottom:16px;">
                    <canvas id="sharecard-canvas" style="width:100%; display:block;"></canvas>
                </div>
                <div id="sharecard-status" style="color:#0f8; font-size:0.8em; margin-bottom:10px;"></div>
                <button id="sharecard-share-btn" style="width:100%; background:#0ff; color:#000; border:none; padding:12px; font-family:'Orbitron',monospace; font-weight:bold; cursor:pointer; margin-bottom:8px; border-radius:4px;">📤 TEILEN</button>
                <button id="sharecard-download-btn" style="width:100%; background:none; color:#0f8; border:1px solid #0f8; padding:12px; font-family:monospace; cursor:pointer; margin-bottom:8px; border-radius:4px;">⬇ BILD HERUNTERLADEN</button>
                <button style="width:100%; background:none; color:#888; border:1px dashed #555; padding:10px; font-family:monospace; cursor:pointer; border-radius:4px;" onclick="document.getElementById('sharecard-modal').style.display='none';">SCHLIESSEN</button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // optionen: { titel, untertitel, icon, agentName, belohnungZeilen: [...], lat, lng, dateiname }
    window.zeigeShareKarte = async function(optionen) {
        stelleShareModalSicher();
        const modal = document.getElementById('sharecard-modal');
        const statusEl = document.getElementById('sharecard-status');
        const canvasEl = document.getElementById('sharecard-canvas');
        modal.style.display = 'flex';
        statusEl.innerText = 'Karte wird erstellt...';

        try {
            let ort = null;
            if (optionen.lat && optionen.lng) {
                ort = await loeseOrtsnamenAuf(optionen.lat, optionen.lng);
            }

            const datum = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const canvas = await zeichneKarte({
                titel: optionen.titel,
                untertitel: optionen.untertitel,
                icon: optionen.icon,
                agentName: optionen.agentName || window.agentName || 'AGENT',
                belohnungZeilen: optionen.belohnungZeilen || [],
                boxLabel: optionen.boxLabel,
                ort: ort,
                datum: datum
            });

            const ctx = canvasEl.getContext('2d');
            canvasEl.width = canvas.width;
            canvasEl.height = canvas.height;
            ctx.drawImage(canvas, 0, 0);
            statusEl.innerText = '';

            const dateiname = (optionen.dateiname || 'zeitreise-karte') + '.png';

            document.getElementById('sharecard-share-btn').onclick = () => {
                canvas.toBlob(async (blob) => {
                    const file = new File([blob], dateiname, { type: 'image/png' });
                    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                        try {
                            await navigator.share({ files: [file], title: optionen.titel, text: 'Ich hab gerade eine Anomalie in Dück & Flux Zeitreise-Agentur extrahiert!' });
                        } catch (e) { /* Nutzer hat abgebrochen - kein Fehler */ }
                    } else {
                        statusEl.innerText = 'Teilen auf diesem Gerät nicht verfügbar - bitte herunterladen.';
                    }
                }, 'image/png');
            };

            document.getElementById('sharecard-download-btn').onclick = () => {
                canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = dateiname;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 5000);
                }, 'image/png');
            };
        } catch (e) {
            console.error('Karte konnte nicht erstellt werden:', e);
            statusEl.innerText = '⚠ Karte konnte nicht erstellt werden - bitte erneut versuchen.';
        }
    };

    // --- Terminal-Befehl "log": echte Missions-Historie aus Firestore, mit Teilen-Button je
    // abgeschlossener Mission. Ersetzt die alte, nie befüllte lokale missionHistory-Variable. ---
    window.zeigeMissionsLog = async function(container) {
        // Kurz auf Login-Bereitschaft warten (max. 3s), statt sofort mit einem Fehler
        // aufzugeben - direkt nach dem Laden der Seite kann window.agentName/window.db kurz
        // noch nicht gesetzt sein, obwohl der Spieler längst eingeloggt ist.
        for (let i = 0; i < 15 && (!window.db || !window.agentName); i++) {
            await new Promise(r => setTimeout(r, 200));
        }
        if (!window.db || !window.agentName) {
            container.innerHTML = '<div style="color:#f44; padding:20px;">[ FEHLER ]<br>&gt; Nicht angemeldet oder Verbindung zur Datenbank fehlgeschlagen. Bitte Seite neu laden.</div>';
            return;
        }
        try {
            const mySlug = window.agentSlug(window.agentName);
            const q = window.query(
                window.collection(window.db, "protokolle", mySlug, "missionsverlauf"),
                window.orderBy("startTs", "desc"),
                window.limit(30)
            );
            const snapshot = await window.getDocs(q);
            if (snapshot.empty) {
                container.innerHTML = '<div style="color:#0f8; padding:20px;">[ MISSIONS-LOG ]<br>&gt; Keine Missionen im Verlauf gefunden.</div>';
                return;
            }
            const statusLabel = { gestartet: 'LÄUFT/ABGEBROCHEN', abgeschlossen: 'ERFOLGREICH', abgebrochen: 'ABGEBROCHEN' };
            const statusColor = { gestartet: '#ffcc00', abgeschlossen: '#0f8', abgebrochen: '#f44' };
            const typLabel = { normal: 'Normale Mission', fortgeschritten: 'Fortgeschrittene Mission', weit: 'Weit entfernte Mission', galaktisch: 'Galaktische Mission' };

            let html = '<div style="color:#0f8; padding:15px; text-align:left; max-height:70vh; overflow-y:auto;">[ MISSIONS-LOG ]<br><br>';
            snapshot.docs.forEach(d => {
                const a = d.data();
                const start = (a.startTs && typeof a.startTs.toDate === 'function') ? a.startTs.toDate().toLocaleString('de-DE') : '(Zeitstempel unbekannt)';
                const status = statusLabel[a.status] || a.status || 'unbekannt';
                const farbe = statusColor[a.status] || '#aaa';
                const typ = typLabel[a.typ] || a.typ || 'unbekannt';
                let belohnungText = 'keine';
                const zeilen = [];
                if (a.belohnung) {
                    if (a.belohnung.credits > 0) zeilen.push(a.belohnung.credits + ' Credits');
                    if (a.belohnung.materiezellen > 0) zeilen.push(a.belohnung.materiezellen + ' Materiezellen');
                    if (a.belohnung.xp > 0) zeilen.push(a.belohnung.xp + ' XP');
                    if (a.belohnung.levelBonus > 0) zeilen.push('+' + a.belohnung.levelBonus + ' Level');
                    if (zeilen.length > 0) belohnungText = zeilen.join(', ');
                }
                const kannTeilen = (a.status === 'abgeschlossen');
                html += `<div style="border:1px solid rgba(0,255,204,0.25); border-radius:4px; padding:10px; margin-bottom:8px; font-size:0.8em;">
                    <div style="color:${farbe}; font-weight:bold;">${status}</div>
                    <div>${typ} · ${start}</div>
                    <div style="opacity:0.8;">Belohnung: ${belohnungText}</div>
                    ${kannTeilen ? `<button style="margin-top:6px; background:none; border:1px solid #0ff; color:#0ff; padding:4px 10px; font-size:0.85em; border-radius:3px; cursor:pointer;" onclick='window.zeigeShareKarte(${JSON.stringify({
                        titel: "ANOMALIE EXTRAHIERT",
                        untertitel: typ,
                        icon: "⏱",
                        agentName: window.agentName,
                        belohnungZeilen: zeilen,
                        lat: a.lat || null,
                        lng: a.lng || null,
                        dateiname: "mission-" + d.id
                    }).replace(/'/g, "&apos;")})'>📤 Karte öffnen</button>` : ''}
                </div>`;
            });
            html += '</div>';
            container.innerHTML = html;
        } catch (e) {
            console.error('Missions-Log konnte nicht geladen werden:', e);
            container.innerHTML = '<div style="color:#f44; padding:20px;">[ FEHLER ]<br>&gt; Missions-Log konnte nicht geladen werden: ' + (e && e.message ? window.escHtml(e.message) : 'Unbekannter Fehler') + '</div>';
        }
    };
})();
