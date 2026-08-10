import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const appId = 'YOUR_APP_ID';

const firebaseConfig = {
  apiKey: 'AIzaSyB8l7Od781kGHyI9pXMLBXvzt7NuuIyq8c',
  authDomain: 'splite-expense-tracker.firebaseapp.com',
  projectId: 'splite-expense-tracker',
  storageBucket: 'splite-expense-tracker.firebasestorage.app',
  messagingSenderId: '425612895494',
  appId: '1:425612895494:web:b5889f1d83cafb41d7ea87',
  measurementId: 'G-FVS0WSGZD9',
};

let firebaseApp;
let storageModulePromise;

export function getFirebaseApp() {
  if (!firebaseApp) {
    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return firebaseApp;
}

export function getFirebaseServices() {
  const app = getFirebaseApp();
  return { app, auth: getAuth(app), db: getFirestore(app) };
}

export function getStorageModule() {
  if (!storageModulePromise) {
    storageModulePromise = import('firebase/storage').then((module) => ({
      getStorage: module.getStorage,
      storageRef: module.ref,
      uploadBytes: module.uploadBytes,
      getDownloadURL: module.getDownloadURL,
      deleteObject: module.deleteObject,
    }));
  }
  return storageModulePromise;
}
