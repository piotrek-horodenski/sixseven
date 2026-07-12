import * as bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

import { App } from '../app'
import { syncUser } from './sync-users.service'
import { SettingsService } from '../settings.service'
import logger from '../logger'

/**
 * Wspólna logika zakładania konta (4c — konwersja gościa). Odwzorowuje przepływ
 * `register.handler` (walidacja unikatu, hash hasła, seed ról/uprawnień) + `login.handler`
 * (wystawienie tokenu sesji), żeby `guest:convert` mógł zwrócić `userData` w kształcie
 * `login-complete` (od razu zalogowany nowy użytkownik).
 *
 * Wydzielone jako serwis, a NIE przez refactor `register.handler` — `register.handler`
 * pozostaje nietknięty (jego kontrakt emituje `register-complete` z surowym dokumentem
 * usera). Integrator może później zdedupować oba miejsca (patrz RAPORT A2).
 *
 * `App.models` czytane leniwie przy wywołaniu — brak efektu ubocznego przy imporcie.
 */

export interface CreateAccountInput {
  username: string
  email: string
  password: string
}

export interface AccountUserData {
  _id: string
  username: string
  email: string
  profile: Record<string, unknown>
  permissions: string[]
  token: string
}

export type CreateAccountResult =
  | { ok: true; userId: string; userData: AccountUserData }
  | { ok: false; reason: 'taken' | 'disabled' | 'invalid' }

export async function registerAccount(
  input: CreateAccountInput,
  opts: { userAgent?: string } = {},
): Promise<CreateAccountResult> {
  const { username, email, password } = input
  if (typeof username !== 'string' || !username.trim()
    || typeof email !== 'string' || !email.trim()
    || typeof password !== 'string' || password.length < 6) {
    return { ok: false, reason: 'invalid' }
  }

  const UserModel = App.models.find(item => item.name === 'users')?.model
  if (!UserModel) return { ok: false, reason: 'invalid' }

  const SettingModel = App.models.find(item => item.name === 'settings')?.model
  const [settingsDocs, existingUserCount] = await Promise.all([
    SettingModel ? SettingModel.find({ name: { $in: ['register', 'admin-first'] } }).lean() : [],
    UserModel.countDocuments(),
  ])
  const settingsMap = new Map((settingsDocs as any[]).map((s: any) => [s.name, s.value]))

  // Rejestracja wyłączona (poza pierwszym userem) — konwersja też jest zakładaniem konta.
  if (settingsMap.get('register') === false && existingUserCount > 0) {
    return { ok: false, reason: 'disabled' }
  }

  const existing = await UserModel.findOne({ $or: [{ email }, { username }] })
  if (existing) {
    return { ok: false, reason: 'taken' }
  }

  const salt = await bcrypt.genSalt(10)
  const hash = await bcrypt.hash(password, salt)

  // Pierwszy user = admin (gdy admin-first włączone), inaczej zwykły gość — zgodnie z register.handler.
  const adminFirstSetting = (settingsDocs as any[]).find((s: any) => s.name === 'admin-first')
  const isFirstAdmin = adminFirstSetting?.value === true && existingUserCount === 0
  const initialRoles = isFirstAdmin ? ['admin'] : ['guest']

  const User = new UserModel({
    username,
    email,
    password: hash,
    profile: { display: username, type: 'regular', status: '' },
    roles: initialRoles,
    permissions: [],
    allRoles: [],
  })

  let saved
  try {
    saved = await User.save()
  } catch (err: any) {
    if (err.code === 11000) return { ok: false, reason: 'taken' }
    throw err
  }

  // Seed uprawnień z przypisanych ról.
  await syncUser(String(saved._id))

  // Wystawienie tokenu sesji (jak login.handler) → od razu zalogowany.
  const settings = SettingsService()
  const token = jwt.sign(
    { _id: String(saved._id), username, email },
    settings.jwtSecret,
    { expiresIn: settings.jwtExpiresIn as any },
  )

  const fresh = await UserModel.findById(saved._id)
  if (!fresh) return { ok: false, reason: 'invalid' }

  const sessions = Array.isArray((fresh as any).sessions) ? (fresh as any).sessions : []
  ;(fresh as any).sessions = [...sessions, { token, createdAt: Date.now(), userAgent: opts.userAgent ?? '' }]
  ;(fresh as any).token = token
  await fresh.save()

  if (isFirstAdmin) {
    logger.info({ userId: fresh._id, username }, 'first user assigned admin role (guest convert)')
  }

  return {
    ok: true,
    userId: String(fresh._id),
    userData: {
      _id: String(fresh._id),
      username: (fresh as any).username,
      email: (fresh as any).email,
      profile: (fresh as any).profile,
      permissions: (fresh as any).permissions ?? [],
      token,
    },
  }
}
