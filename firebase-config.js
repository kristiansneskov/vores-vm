// Firebase wiring — shared by app.js (read) and admin.js (write).
//
// The Firebase SDK is loaded straight from the modular ESM CDN, so there is
// still NO build step. Nothing secret lives here: a web `firebaseConfig` is
// public by design (it ships in every page). Write access is protected by the
// Firestore security rules (write only when signed in), not by hiding this.
//
// ⚙️  ONE-TIME SETUP — paste the values from your Firebase project below.
//     Firebase console → Project settings → "Your apps" → SDK setup → Config.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// ----- PASTE YOUR firebaseConfig HERE -----

export const firebaseConfig = {

  apiKey: "AIzaSyC9Ii7ZAx7ZUJg1QJXfXOtqt1KI7Khlc1w",

  authDomain: "vores-vm.firebaseapp.com",

  projectId: "vores-vm",

  storageBucket: "vores-vm.firebasestorage.app",

  messagingSenderId: "498738430219",

  appId: "1:498738430219:web:ec647307c9cb91f733220e"

};

// The single shared account that "the password" signs into. The email is fixed
// (an internal label — it never needs to receive mail); only the password is
// asked for in the form. Create this user in Firebase console → Authentication.
export const SHARED_EMAIL = 'vm@vores-vm.local';

// All site data lives in one document so app.js can use today's data shape.
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const stateDoc = doc(db, 'state', 'current');

// True once a real config has been pasted in (lets app.js fall back gracefully).
export const isConfigured = firebaseConfig.apiKey !== 'PASTE_ME';

// Re-export the SDK functions consumers need, pinned to one SDK version.
export {
  getDoc, setDoc, onSnapshot, runTransaction,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence,
};
