
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
  import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp, getDocs, deleteDoc, deleteField, where, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
  import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, reauthenticateWithCredential, EmailAuthProvider, deleteUser, updatePassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
  import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
  import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

  const firebaseConfig = {
    apiKey: "AIzaSyBPnK30ra0r8pDMOhgRsiY6jSWCbJlt2t4",
    authDomain: "zeitreise-agentur.firebaseapp.com",
    projectId: "zeitreise-agentur",
    storageBucket: "zeitreise-agentur.firebasestorage.app",
    messagingSenderId: "516125325960",
    appId: "1:516125325960:web:936883a5474820b10bfd3d",
    measurementId: "G-8809YG4WHM"
  };

  const app = initializeApp(firebaseConfig);
  window.db = getFirestore(app);
  window.auth = getAuth(app);
  // Cloud Functions - für serverseitig verifizierte Aktionen (z.B. Missionsbelohnungen), bei
  // denen der Client dem Server nur noch meldet "das ist passiert", die eigentliche Berechnung
  // aber ausschließlich serverseitig läuft (siehe functions-index.js: missionAbschliessen,
  // dualMissionAbschliessen).
  const functionsInstance = getFunctions(app);
  window.callFunction = (name, data) => httpsCallable(functionsInstance, name)(data);

  // ============================================================
  // PUSH-BENACHRICHTIGUNGEN (Firebase Cloud Messaging)
  // ============================================================
  // WICHTIG: "VAPID_KEY" unten muss durch den echten Schlüssel aus der Firebase-Konsole ersetzt
  // werden (Projekteinstellungen -> Cloud Messaging -> Web-Push-Zertifikate -> Schlüsselpaar
  // generieren). Ohne einen echten Schlüssel schlägt getToken() fehl - das Spiel funktioniert
  // aber auch ohne Push-Benachrichtigungen ganz normal weiter (siehe try/catch unten), es gibt
  // nur keine Benachrichtigungen, bis der Schlüssel eingetragen ist.
  const VAPID_KEY = "BMxONEMvaFADMc11gHjYAk_jVtgj38WFOCNR0sgDdUEh2nwA7E-yUzmjw9HsxxvkTCDeXO4uoVACOHPz6jN5q7E";

  let messagingInstance = null;
  try { messagingInstance = getMessaging(app); } catch (e) { console.warn("Push-Benachrichtigungen auf diesem Gerät/Browser nicht verfügbar:", e); }

  // Wird gezielt an einer sinnvollen Stelle im Spiel aufgerufen (nicht sofort beim Laden) -
  // fragt die Berechtigung beim Nutzer ab und speichert den Geräte-Token am Spieler-Dokument,
  // damit Cloud Functions gezielt Nachrichten an dieses Gerät schicken können.
  window.registriereFuerPushBenachrichtigungen = async function() {
    if (!messagingInstance || !window.agentName) return false;
    if (localStorage.getItem('flux_push_angefragt_' + window.agentName.toLowerCase()) === 'true') return false;
    localStorage.setItem('flux_push_angefragt_' + window.agentName.toLowerCase(), 'true');
    try {
      const berechtigung = await Notification.requestPermission();
      if (berechtigung !== "granted") return false;
      const token = await getToken(messagingInstance, { vapidKey: VAPID_KEY });
      if (!token) return false;
      await setDoc(doc(window.db, "agenten", window.agentSlug(window.agentName)), { fcmToken: token }, { merge: true });
      return true;
    } catch (e) {
      console.error("Push-Registrierung fehlgeschlagen:", e);
      return false;
    }
  };

  // Nachrichten, die eintreffen, während das Spiel gerade GEÖFFNET ist, zeigt der Browser nicht
  // automatisch an (das übernimmt sonst der Service Worker nur im Hintergrund) - deshalb hier
  // manuell als Info-Hinweis im Spiel selbst anzeigen.
  if (messagingInstance) {
    onMessage(messagingInstance, (payload) => {
      const titel = (payload.notification && payload.notification.title) || "Zeitreise-Agentur";
      const text = (payload.notification && payload.notification.body) || "";
      if (typeof window.zeigeInfo === 'function') window.zeigeInfo(titel + (text ? ': ' + text : ''));
    });
  }
  window.fbCreateUser = createUserWithEmailAndPassword;
  window.fbSignIn = signInWithEmailAndPassword;
  window.fbSignOut = signOut;
  window.fbOnAuthStateChanged = onAuthStateChanged;
  window.doc = doc;
  window.deleteField = deleteField;
  window.fbUpdateProfile = updateProfile;
  window.fbReauthenticate = reauthenticateWithCredential;
  window.fbEmailAuthProvider = EmailAuthProvider;
  window.fbDeleteUser = deleteUser;
  window.fbUpdatePassword = updatePassword;

  // Kanonische, ASCII-sichere Kurzform eines Agentennamens (Umlaute/Sonderzeichen -> "_").
  // WICHTIG: Wird ab jetzt konsequent überall verwendet, wo der Name zu einer Firestore-
  // Dokument-ID wird - sonst passt die Dokument-ID nicht mehr zur synthetischen E-Mail-Adresse
  // des Auth-Accounts, und die Security Rules (isOwner) lehnen den Zugriff ab.
  window.agentSlug = (name) => (name || '').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '_');
  window.agentNameToEmail = (name) => window.agentSlug(name) + "@agenten.flux-terminal.local";

  // WICHTIG: Die Session-Gültigkeit wird jetzt ausschließlich von Firebase Auth entschieden,
  // NICHT mehr von einem manipulierbaren localStorage-Flag. onAuthStateChanged liefert den
  // echten, serverseitig verifizierten Login-Status.
  let _resolveAuthReady;
  window.fbAuthReady = new Promise((resolve) => { _resolveAuthReady = resolve; });
  onAuthStateChanged(window.auth, (user) => {
      window.currentFirebaseUser = user;
      if (_resolveAuthReady) { _resolveAuthReady(user); _resolveAuthReady = null; }
  });
  window.setDoc = setDoc;
  window.getDoc = getDoc;
  window.collection = collection;
  window.addDoc = addDoc;
  window.onSnapshot = onSnapshot;
  window.query = query;
  window.orderBy = orderBy;
  window.limit = limit;
  window.serverTimestamp = serverTimestamp;
  window.increment = increment;
  window.getDocs = getDocs;
  window.deleteDoc = deleteDoc;
  window.where = where; 

  console.log("UPLINK & KOMM-LINK AKTIV");
