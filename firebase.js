// firebase.js
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyB6bJ3qDvhqJJoFXdM3Pi4Vjp-2CTEK5Lg",
  authDomain: "rizzapizza-35a65.firebaseapp.com",
  projectId: "rizzapizza-35a65",
  storageBucket: "rizzapizza-35a65.firebasestorage.app",
  messagingSenderId: "895020982027",
  appId: "1:895020982027:web:85092bfc6546ecb4998c0e",
  measurementId: "G-C7NYC5T7XR"
};


// App
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Auth (en RN usa initializeAuth para persistencia real)
let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  // Si ya existe una instancia, getAuth la devuelve; si no, creamos con AsyncStorage
  try {
    auth = getAuth(app);
  } catch (_) {
    /* noop */
  }
  if (!auth) {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }
}

// Firestore
const db = getFirestore(app);

// DEBUG opcional: confirma a qué proyecto apuntas
// console.log('Firebase projectId:', app.options.projectId);

export { app, auth, db };