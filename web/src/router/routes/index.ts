import type { RouteRecordRaw } from 'vue-router'

import homeRoute from './home.route'
import adminRoute from './admin.route'
import profileRoute from './profile.route'
import loginRoute from './login.route'
import registerRoute from './register.route'
import imagesRoute from './images.route'
import newGameRoute from './new-game.route'
import roomJoinRoute from './room-join.route'
import gameRpsRoute from './game-rps.route'
import preferencesRoute from './preferences.route'
import profilePublicRoute from './profile-public.route'
import guestConvertRoute from './guest-convert.route'

// Jawny typ: bez niego TS skleja route'y w unię i wymaga `redirect` od
// wszystkich (TS2322 w router/index.ts) — z typem sprawdza każdy element osobno.
export const routes: RouteRecordRaw[] = [
  loginRoute,
  registerRoute,
  homeRoute,
  adminRoute,
  profileRoute,
  imagesRoute,
  newGameRoute,
  roomJoinRoute,
  gameRpsRoute,
  preferencesRoute,
  profilePublicRoute,
  guestConvertRoute,
]
