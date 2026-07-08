import * as bcrypt from 'bcrypt'

import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'
import logger from '../../logger'

export const profileUpdateHandler: HandlerObject = {
  event: 'profile:update',
  handler: async (socket: AuthenticatedSocket, { display }: { display: string }) => {
    if (!socket.user) {
      socket.emit('profile:update-stopped', { message: 'not authenticated' })
      return
    }

    const UserModel = App.models.find(m => m.name === 'users')?.model
    if (!UserModel) return

    const trimmed = display?.trim()
    if (!trimmed) {
      socket.emit('profile:update-stopped', { message: 'display name is required' })
      return
    }

    await UserModel.updateOne(
      { _id: socket.user._id },
      { $set: { 'profile.display': trimmed } },
    )

    socket.user.profile = { ...socket.user.profile, display: trimmed }

    logger.info({ userId: socket.user._id }, 'updated profile')
    socket.emit('profile:update-complete', { display: trimmed })
  },
}

export const changePasswordHandler: HandlerObject = {
  event: 'profile:change-password',
  handler: async (socket: AuthenticatedSocket, { currentPassword, newPassword }: {
    currentPassword: string, newPassword: string
  }) => {
    if (!socket.user) {
      socket.emit('profile:change-password-stopped', { message: 'not authenticated' })
      return
    }

    if (!currentPassword || !newPassword) {
      socket.emit('profile:change-password-stopped', { message: 'both fields are required' })
      return
    }

    if (newPassword.length < 6) {
      socket.emit('profile:change-password-stopped', { message: 'new password must be at least 6 characters' })
      return
    }

    const isMatch = await bcrypt.compare(currentPassword, socket.user.password)
    if (!isMatch) {
      socket.emit('profile:change-password-stopped', { message: 'current password is incorrect' })
      return
    }

    const UserModel = App.models.find(m => m.name === 'users')?.model
    if (!UserModel) return

    const hashed = await bcrypt.hash(newPassword, 10)
    await UserModel.updateOne(
      { _id: socket.user._id },
      { $set: { password: hashed } },
    )

    logger.info({ userId: socket.user._id }, 'changed password')
    socket.emit('profile:change-password-complete')
  },
}
