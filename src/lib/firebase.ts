import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBy_iuT-YwyqyQwsa67_a6_0mmGtWdmgno",
  authDomain: "bomedia-official.firebaseapp.com",
  databaseURL: "https://bomedia-official.firebaseio.com",
  projectId: "bomedia-official",
  storageBucket: "bomedia-official.firebasestorage.app",
  messagingSenderId: "1054405810396",
  appId: "1:1054405810396:web:21cf8769eb3ef6de3abc19",
  // measurementId: "G-ZRX1NW30VV"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Realtime Database and get a reference to the service
const db = getDatabase(app, "https://bomedia-official.firebaseio.com");

export { app, db };
