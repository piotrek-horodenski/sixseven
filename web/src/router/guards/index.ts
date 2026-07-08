import { LayoutGuard } from './layout.guard'
import { AuthGuard } from './auth.guard'

export const guards = [
  AuthGuard,
  LayoutGuard,
]
