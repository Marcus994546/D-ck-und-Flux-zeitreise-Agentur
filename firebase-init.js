
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
  import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp, getDocs, deleteDoc, deleteField, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
  import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, reauthenticateWithCredential, EmailAuthProvider, deleteUser, sendPasswordResetEmail, updateEmail, updatePassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
  window.fbSendPasswordResetEmail = sendPasswordResetEmail;
  window.fbUpdateEmail = updateEmail;
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
  window.getDocs = getDocs;
  window.deleteDoc = deleteDoc;
  window.where = where; 

  console.log("UPLINK & KOMM-LINK AKTIV");
