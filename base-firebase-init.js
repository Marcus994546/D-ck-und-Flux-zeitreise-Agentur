
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
  import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
  import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
  window.doc = doc;
  window.setDoc = setDoc;
  window.getDoc = getDoc;

  // Wie in index.html: Zugriff wird nur gewährt, wenn Firebase Auth eine ECHTE Session bestätigt.
  // localStorage wird nicht mehr als Vertrauensquelle genutzt.
  window.baseAuthReady = new Promise((resolve) => {
      const unsub = onAuthStateChanged(window.auth, (user) => { unsub(); resolve(user); });
  });
