import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

/**
 * The database the app talks to.
 *
 * NOT the project's default instance — the project has two, and
 * `bomedia-official-default-rtdb` is empty. Stated once and reused, because the
 * two literals that used to say this drifted from `firebase.json`, which named
 * neither: the security rules were deployed to the empty database for months
 * while this one sat open to any signed-in user. See docs/DATABASE_RUNBOOK.md.
 */
export const DATABASE_URL = 'https://bomedia-official.firebaseio.com';

const firebaseConfig = {
  apiKey: "AIzaSyBy_iuT-YwyqyQwsa67_a6_0mmGtWdmgno",
  authDomain: "bomedia-official.firebaseapp.com",
  databaseURL: DATABASE_URL,
  projectId: "bomedia-official",
  storageBucket: "bomedia-official.firebasestorage.app",
  messagingSenderId: "1054405810396",
  appId: "1:1054405810396:web:21cf8769eb3ef6de3abc19",
  // measurementId: "G-ZRX1NW30VV"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Realtime Database and get a reference to the service
const db = getDatabase(app, DATABASE_URL);

export { app, db };
