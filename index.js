/**
 * Cloud Function: adminResetPassword
 * ------------------------------------------------------------------
 * Ermöglicht dem Admin-Dashboard (admin.html), das Passwort eines
 * beliebigen Agenten sicher zu setzen - OHNE dass ein Admin-SDK-Schlüssel
 * jemals im Browser landet. Der Admin SDK-Zugriff passiert ausschließlich
 * hier, serverseitig auf Googles Infrastruktur.
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
 * SICHERHEIT: Diese Funktion prüft server-seitig, dass der Aufrufer
 * eingeloggt ist UND laut seinem eigenen Firestore-Dokument isAdmin=true
 * hat. Ohne diese Prüfung könnte theoretisch jeder eingeloggte Nutzer
 * fremde Passwörter setzen - das wäre fatal.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();

function agentNameToEmail(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_") + "@agenten.flux-terminal.local";
}

exports.adminResetPassword = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError("unauthenticated", "Login erforderlich.");
  }

  // Aufrufer-Identität aus dem eigenen Auth-Token ableiten und dessen isAdmin-Flag prüfen.
  const callerEmail = auth.token.email || "";
  const callerName = callerEmail.split("@")[0];
  const callerDoc = await admin.firestore().collection("agenten").doc(callerName).get();

  if (!callerDoc.exists || callerDoc.data().isAdmin !== true) {
    throw new HttpsError("permission-denied", "Kein Administrator-Konto.");
  }

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
