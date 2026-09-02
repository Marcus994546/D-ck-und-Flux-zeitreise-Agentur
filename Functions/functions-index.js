/**
 * Cloud Functions: adminResetPassword & adminDeleteAgent
 * ------------------------------------------------------------------
 * Serverseitige Admin-Aktionen für das Admin-Dashboard (admin.html), die aus dem
 * Browser heraus NICHT möglich sind (Passwort eines fremden Accounts setzen, einen
 * fremden Firebase-Auth-Account vollständig löschen). Der Admin-SDK-Zugriff passiert
 * ausschließlich hier, serverseitig auf Googles Infrastruktur - niemals im Browser.
 *
 * VORAUSSETZUNGEN ZUM DEPLOYEN:
 *   1. Firebase-Projekt muss auf den "Blaze"-Tarif (Pay-as-you-go) laufen
 *      (Cloud Functions sind auf dem kostenlosen "Spark"-Tarif nicht verfügbar).
 *   2. Firebase CLI installieren:      npm install -g firebase-tools
 *   3. Einloggen:                      firebase login
 *   4. Im Projektordner (der diesen "functions"-Ordner enthält):
 *        firebase init functions   (falls noch nicht initialisiert)
 *        cd functions && npm install firebase-admin firebase-functions
 *   5. Deployen:                       firebase deploy --only functions
 *
 * SICHERHEIT: Beide Funktionen prüfen server-seitig, dass der Aufrufer eingeloggt ist
 * UND laut seinem eigenen Firestore-Dokument isAdmin=true hat. Ohne diese Prüfung
 * könnte theoretisch jeder eingeloggte Nutzer fremde Accounts löschen/übernehmen -
 * das wäre fatal.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();

// Muss exakt derselben Logik wie window.agentSlug() im Client-Code entsprechen.
function agentSlug(name) {
  return (name || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}
function agentNameToEmail(name) {
  return agentSlug(name) + "@agenten.flux-terminal.local";
}

async function requireAdmin(request) {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Login erforderlich.");
  const callerEmail = auth.token.email || "";
  const callerName = callerEmail.split("@")[0];
  const callerDoc = await admin.firestore().collection("agenten").doc(callerName).get();
  if (!callerDoc.exists || callerDoc.data().isAdmin !== true) {
    throw new HttpsError("permission-denied", "Kein Administrator-Konto.");
  }
}

exports.adminResetPassword = onCall(async (request) => {
  await requireAdmin(request);

  const { targetAgentName, newPassword } = request.data || {};
  if (!targetAgentName || !newPassword || newPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Agenten-ID und Passwort (min. 6 Zeichen) erforderlich.");
  }

  const targetEmail = agentNameToEmail(targetAgentName);

  try {
    const targetUser = await admin.auth().getUserByEmail(targetEmail);
    await admin.auth().updateUser(targetUser.uid, { password: newPassword });
    return { success: true, agent: targetAgentName };
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "Agent '" + targetAgentName + "' hat keinen Auth-Account.");
    }
    throw new HttpsError("internal", e.message || "Unbekannter Fehler.");
  }
});

// Löscht einen Agenten VOLLSTÄNDIG: den Firebase-Auth-Account (Login geht danach nicht
// mehr) UND alle zugehörigen Firestore-Dokumente (Profil, Basis, Legacy-Sammlung).
// Anders als das reine Firestore-Löschen im Client (admin.html) bleibt hier KEIN
// Login-Zugang mehr übrig - die Person müsste sich komplett neu registrieren.
exports.adminDeleteAgent = onCall(async (request) => {
  await requireAdmin(request);

  const { targetAgentName } = request.data || {};
  if (!targetAgentName) {
    throw new HttpsError("invalid-argument", "Agenten-ID erforderlich.");
  }

  const slug = agentSlug(targetAgentName);
  const targetEmail = agentNameToEmail(targetAgentName);
  const db = admin.firestore();

  // Firestore-Dokumente löschen (unabhängig davon, ob der Auth-Account noch existiert).
  const results = await Promise.allSettled([
    db.collection("agenten").doc(slug).delete(),
    db.collection("Agent - Base").doc(slug).delete(),
    db.collection("SLAs Agent").doc(slug).delete()
  ]);

  // Firebase-Auth-Account löschen (falls vorhanden - bei sehr alten/nie eingeloggten
  // Test-Profilen kann es sein, dass es nie einen echten Auth-Account gab).
  let authDeleted = false;
  try {
    const targetUser = await admin.auth().getUserByEmail(targetEmail);
    await admin.auth().deleteUser(targetUser.uid);
    authDeleted = true;
  } catch (e) {
    if (e.code !== "auth/user-not-found") {
      throw new HttpsError("internal", "Auth-Account konnte nicht gelöscht werden: " + (e.message || e.code));
    }
  }

  return { success: true, agent: targetAgentName, authDeleted };
});

/**
 * Cloud Functions: missionAbschliessen & dualMissionAbschliessen
 * ------------------------------------------------------------------
 * Serverseitige Missionsbelohnung, ersetzt die bisherige rein clientseitige Berechnung in
 * app.js (window.applyMissionRewards) bzw. dualmission.js. Der Client meldet nur noch "diese
 * Mission ist fertig" - die tatsächliche Höhe der Belohnung wird ausschließlich hier berechnet
 * und geschrieben. Ohne das könnte theoretisch jeder über die Browser-Konsole eine höhere
 * Belohnung eintragen, als die Mission eigentlich wert ist.
 *
 * WICHTIG: Die Formeln hier MÜSSEN exakt zu den gleichnamigen Formeln in app.js/dailyanomaly.js
 * passen (Spielbalance darf sich durch diese Umstellung nicht ändern). Bei künftigen
 * Balance-Änderungen im Client IMMER auch hier nachziehen, sonst laufen Client-Anzeige und
 * tatsächliche Gutschrift auseinander.
 */

// Muss exakt zu window.missionLootTables in app.js passen.
const MISSION_LOOT_TABLES = {
  normal:          { level: 1,  xp: 50, credits: 100,  materiezellen: 0 },
  fortgeschritten: { level: 3,  xp: 0,  credits: 200,  materiezellen: 2 },
  weit:            { level: 6,  xp: 50, credits: 500,  materiezellen: 8 },
  dual:            { level: 8,  xp: 0,  credits: 1500, materiezellen: 10 }
};

// Muss exakt zu BELOHNUNGS_TABELLE in dailyanomaly.js passen.
const TAEGLICH_BELOHNUNGS_TABELLE = {
  1: { credits: 100,  materiezellen: 1 },
  2: { credits: 250,  materiezellen: 1 },
  3: { credits: 400,  materiezellen: 2 },
  4: { credits: 550,  materiezellen: 2 },
  5: { credits: 700,  materiezellen: 3 },
  6: { credits: 850,  materiezellen: 4 },
  7: { credits: 1000, materiezellen: 5 }
};

// Müssen exakt zu den gleichnamigen Formeln in app.js/base-app.js passen.
function scaledQuantenLaborBonusPct(lvl) { return 2 + (lvl - 1) * 1; }
function scaledResonanzPct(lvl) { return 5 + (lvl - 1) * 1; }
function tagImZyklus(streak) { return Math.min(streak, 7); }

exports.missionAbschliessen = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Login erforderlich.");
  const callerSlug = agentSlug((auth.token.email || "").split("@")[0]);

  const { missionHistoryId, missionType, lat, lng } = request.data || {};
  if (!missionHistoryId || !missionType) {
    throw new HttpsError("invalid-argument", "missionHistoryId und missionType erforderlich.");
  }
  if (missionType !== "taeglich" && !MISSION_LOOT_TABLES[missionType]) {
    throw new HttpsError("invalid-argument", "Unbekannter Missionstyp: " + missionType);
  }

  const db = admin.firestore();
  const historyRef = db.collection("protokolle").doc(callerSlug).collection("missionsverlauf").doc(missionHistoryId);
  const agentRef = db.collection("agenten").doc(callerSlug);

  return db.runTransaction(async (tx) => {
    // ---- PHASE 1: ALLE Lesevorgänge zuerst (Firestore-Transaktionen verlangen zwingend, dass
    // sämtliche Reads vor jedem Write passieren - sonst wirft die Transaktion einen Laufzeitfehler). ----
    const historySnap = await tx.get(historyRef);
    if (!historySnap.exists) throw new HttpsError("not-found", "Missionseintrag nicht gefunden.");
    const historyData = historySnap.data();
    if (historyData.status !== "gestartet") {
      throw new HttpsError("failed-precondition", "Diese Mission wurde bereits abgeschlossen oder abgebrochen.");
    }
    if (historyData.typ !== missionType) {
      throw new HttpsError("failed-precondition", "Missionstyp stimmt nicht mit dem Eintrag überein.");
    }

    const agentSnap = await tx.get(agentRef);
    const agentData = agentSnap.exists ? agentSnap.data() : {};

    const baseSnap = await tx.get(db.collection("Agent - Base").doc(callerSlug));
    const rooms = (baseSnap.exists && Array.isArray(baseSnap.data().baseData)) ? baseSnap.data().baseData : [];

    // Mentorschafts-Prüfung: die Suche selbst ist eine normale (nicht-transaktionale) Abfrage,
    // der anschließende Lesevorgang des Mentor-Kontos MUSS aber noch in dieser Lese-Phase
    // passieren, bevor unten die erste Schreibaktion stattfindet.
    const mentorshipQuery = await db.collection("mentorships").where("menteeSlug", "==", callerSlug).where("status", "==", "aktiv").limit(1).get();
    let mentorshipSnap = null, mentorRef = null, mentorSnap = null;
    if (!mentorshipQuery.empty) {
      mentorshipSnap = mentorshipQuery.docs[0];
      mentorRef = db.collection("agenten").doc(mentorshipSnap.data().mentorSlug);
      mentorSnap = await tx.get(mentorRef);
    }

    // ---- PHASE 2: Berechnung (kein Firestore-Zugriff mehr, nur noch Rechnen). ----
    let loot;
    if (missionType === "taeglich") {
      const streak = (agentData.taeglicheAnomalie && agentData.taeglicheAnomalie.streak) || 1;
      const tag = tagImZyklus(streak);
      const b = TAEGLICH_BELOHNUNGS_TABELLE[tag];
      loot = { level: 0, xp: 0, credits: b.credits, materiezellen: b.materiezellen };
    } else {
      loot = MISSION_LOOT_TABLES[missionType];
    }

    let xp = loot.xp, credits = loot.credits, materiezellen = loot.materiezellen;

    const levelOf = (name) => { const r = rooms.find(r => r.type === name); return r ? (r.lvl || 1) : 0; };
    const resonanzLvl = levelOf("RESONANZ-KAMMER");
    const quantenLvl = levelOf("QUANTEN-LABOR");

    let doubled = false;
    if (resonanzLvl > 0) {
      const pct = scaledResonanzPct(resonanzLvl);
      if (Math.random() * 100 < pct) { xp *= 2; credits *= 2; materiezellen *= 2; doubled = true; }
    }
    let quantenLaborAktiv = false;
    if (quantenLvl > 0 && xp > 0) {
      const pct = scaledQuantenLaborBonusPct(quantenLvl);
      xp = xp * (1 + pct / 100);
      quantenLaborAktiv = true;
    }

    let mentorBonusAktiv = false;
    if (mentorshipSnap) {
      mentorBonusAktiv = true;
      xp = Math.round(xp * 1.2);
      credits = Math.round(credits * 1.2);
      materiezellen = Math.round(materiezellen * 1.2);
    }

    // XP/Level-Verrechnung - dieselbe Logik wie window.updateXP() im Client.
    let neuesXp = (agentData.xp || 0) + xp;
    let neuesLvl = agentData.lvl || 1;
    while (neuesXp >= 100) { neuesLvl++; neuesXp -= 100; }
    if (loot.level > 0) neuesLvl += loot.level;

    // ---- PHASE 3: ALLE Schreibvorgänge (erst jetzt, nach Abschluss sämtlicher Reads oben). ----
    const neueUpdate = {
      xp: neuesXp,
      lvl: neuesLvl,
      credits: (agentData.credits || 0) + credits,
      materiezellen: (agentData.materiezellen || 0) + materiezellen,
      ["missionen_" + missionType + "_erfolgreich"]: admin.firestore.FieldValue.increment(1)
    };
    if (missionType === "taeglich" && agentData.taeglicheAnomalie) {
      neueUpdate.taeglicheAnomalie = { ...agentData.taeglicheAnomalie, status: "abgeschlossen" };
    }
    tx.set(agentRef, neueUpdate, { merge: true });

    tx.set(historyRef, {
      status: "abgeschlossen",
      endTs: admin.firestore.FieldValue.serverTimestamp(),
      belohnung: { credits, materiezellen, xp: Math.round(xp), levelBonus: loot.level > 0 ? loot.level : 0 },
      lat: (typeof lat === "number") ? lat : null,
      lng: (typeof lng === "number") ? lng : null
    }, { merge: true });

    // Mentor-Trickle-Belohnung + Graduierung - nutzt mentorRef/mentorSnap, die bereits ganz oben
    // in der Lese-Phase geholt wurden (siehe PHASE 1), kein erneuter Lesevorgang hier nötig bzw.
    // zulässig (Firestore-Transaktionen erlauben nach dem ersten Write keine weiteren Reads mehr).
    if (mentorshipSnap) {
      const mentorship = mentorshipSnap.data();
      tx.set(mentorshipSnap.ref, { missionsAbgeschlossen: (mentorship.missionsAbgeschlossen || 0) + 1 }, { merge: true });
      const mentorCredits = mentorSnap.exists ? (mentorSnap.data().credits || 0) : 0;
      tx.set(mentorRef, { credits: mentorCredits + 20 }, { merge: true });

      const tageVergangen = (Date.now() - (mentorship.erstelltAm || Date.now())) / 86400000;
      if (tageVergangen >= 30 || neuesLvl >= 10) {
        tx.set(mentorshipSnap.ref, { status: "graduiert" }, { merge: true });
        tx.set(agentRef, { credits: (agentData.credits || 0) + credits + 300 }, { merge: true });
        tx.set(mentorRef, { credits: mentorCredits + 20 + 800 }, { merge: true });
      }
    }

    return {
      xp: Math.round(xp), credits, materiezellen,
      levelBonus: loot.level > 0 ? loot.level : 0,
      doubled, quantenLaborAktiv, mentorBonusAktiv
    };
  });
});

exports.dualMissionAbschliessen = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Login erforderlich.");
  const callerSlug = agentSlug((auth.token.email || "").split("@")[0]);

  const { missionId } = request.data || {};
  if (!missionId) throw new HttpsError("invalid-argument", "missionId erforderlich.");

  const db = admin.firestore();
  const missionRef = db.collection("dual_missionen").doc(missionId);

  return db.runTransaction(async (tx) => {
    const missionSnap = await tx.get(missionRef);
    if (!missionSnap.exists) throw new HttpsError("not-found", "Dual-Mission nicht gefunden.");
    const mission = missionSnap.data();
    if (mission.status !== "angenommen") {
      throw new HttpsError("failed-precondition", "Diese Dual-Mission ist nicht in einem abschließbaren Zustand.");
    }
    if (mission.von !== callerSlug && mission.an !== callerSlug) {
      throw new HttpsError("permission-denied", "Du bist an dieser Mission nicht beteiligt.");
    }

    const loot = MISSION_LOOT_TABLES.dual;
    const ref1 = db.collection("agenten").doc(mission.von);
    const ref2 = db.collection("agenten").doc(mission.an);
    const [snap1, snap2] = await Promise.all([tx.get(ref1), tx.get(ref2)]);
    const data1 = snap1.exists ? snap1.data() : {};
    const data2 = snap2.exists ? snap2.data() : {};

    tx.set(ref1, {
      lvl: (data1.lvl || 1) + loot.level,
      credits: (data1.credits || 0) + loot.credits,
      materiezellen: (data1.materiezellen || 0) + loot.materiezellen,
      missionen_dual_erfolgreich: admin.firestore.FieldValue.increment(1)
    }, { merge: true });
    tx.set(ref2, {
      lvl: (data2.lvl || 1) + loot.level,
      credits: (data2.credits || 0) + loot.credits,
      materiezellen: (data2.materiezellen || 0) + loot.materiezellen,
      missionen_dual_erfolgreich: admin.firestore.FieldValue.increment(1)
    }, { merge: true });
    tx.set(missionRef, { status: "abgeschlossen" }, { merge: true });

    return { success: true, credits: loot.credits, materiezellen: loot.materiezellen, levelBonus: loot.level };
  });
});
