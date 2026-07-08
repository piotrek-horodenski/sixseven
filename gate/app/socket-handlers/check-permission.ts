import { AuthenticatedSocket } from '.'

export function hasPermission(socket: AuthenticatedSocket, permission: string): boolean {
  return socket.user?.permissions?.includes(permission) ?? false
}
