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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

export async function saveUser(user: SinapUser): Promise<void> {
  storeUserLocal(user)
  if (!db) return
  await set(ref(db, `users/${user.phone}`), {
    name: user.name,
    phone: user.phone,
    updatedAt: Date.now(),
  })
}

export async function lookupUserName(phone: string): Promise<string | null> {
  if (!db) return null
  try {
    const snap = await get(ref(db, `users/${phone}`))
    return snap.val()?.name ?? null
  } catch { return null }
}

export function cleanPhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function clearStoredUser(): void {
  localStorage.removeItem(STORAGE_KEY)
}
