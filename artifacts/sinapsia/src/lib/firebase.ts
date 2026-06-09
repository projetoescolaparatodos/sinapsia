import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  onValue,
  off,
  onDisconnect,
  serverTimestamp,
  type Database,
} from 'firebase/database'

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
const appId = import.meta.env.VITE_FIREBASE_APP_ID

export const isFirebaseConfigured =
  Boolean(apiKey) &&
  Boolean(databaseURL) &&
  Boolean(projectId) &&
  Boolean(appId)

let app: FirebaseApp | null = null
let db: Database | null = null

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0
      ? initializeApp({
          apiKey,
          authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
          databaseURL,
          projectId,
          storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
          appId,
        })
      : getApps()[0]
    db = getDatabase(app)
  } catch (err) {
    console.warn('[Sinapsia] Firebase init error — modo local:', err)
    db = null
  }
}

export { db, ref, set, update, get, onValue, off, onDisconnect, serverTimestamp }
