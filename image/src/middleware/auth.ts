import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

import { settings } from '@/settings'

export interface AuthUser {
  _id: string
  username: string
  email: string
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const token = header.slice(7)
  try {
    const decoded = jwt.verify(token, settings.jwtSecret) as AuthUser
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ message: 'Unauthorized' })
  }
}
