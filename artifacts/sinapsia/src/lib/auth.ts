import { db, ref, set, get } from './firebase'

export interface SinapUser {
  phone: string
  name: string
}

const STORAGE_KEY = 'sinapsia-user'

export function getStoredUser(): SinapUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const u = JSON.parse(raw) as SinapUser
    if (u?.phone && u?.name) return u
    return null
  } catch { return null }
}

export function storeUserLocal(user: SinapUser): void {
  console.log('[Sinapsia] storeUserLocal', user)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

export async function saveUser(user: SinapUser): Promise<void> {
  console.log('[Sinapsia] saveUser called', { user, firebaseConnected: Boolean(db) })
  storeUserLocal(user)
  if (!db) {
    console.warn('[Sinapsia] Firebase DB unavailable during saveUser. Local cache updated only.', user.phone)
    return
  }

  try {
    await set(ref(db, `users/${user.phone}`), {
      name: user.name,
      phone: user.phone,
      updatedAt: Date.now(),
    })
    console.log('[Sinapsia] saveUser succeeded', user.phone)
  } catch (err) {
    console.error('[Sinapsia] saveUser failed', { phone: user.phone, err })
    throw err
  }
}

export async function lookupUserName(phone: string): Promise<string | null> {
  console.log('[Sinapsia] lookupUserName called', { phone, firebaseConnected: Boolean(db) })
  if (!db) {
    console.warn('[Sinapsia] Firebase DB unavailable during lookupUserName', phone)
    return null
  }
  try {
    const snap = await get(ref(db, `users/${phone}`))
    const name = snap.val()?.name ?? null
    console.log('[Sinapsia] lookupUserName result', { phone, name })
    return name
  } catch (err) {
    console.error('[Sinapsia] lookupUserName failed', { phone, err })
    return null
  }
}

export function cleanPhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function clearStoredUser(): void {
  localStorage.removeItem(STORAGE_KEY)
}
