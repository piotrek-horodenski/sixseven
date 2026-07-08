import { HandlerObject, AuthenticatedSocket } from '..'
import { App } from '../../app'

export const settingsPublicHandler: HandlerObject = {
  event: 'settings:get-public',
  handler: async (socket: AuthenticatedSocket) => {
    const SettingModel = App.models.find(m => m.name === 'settings')?.model
    if (!SettingModel) return

    const registerSetting = await SettingModel.findOne({ name: 'register' }).lean()

    socket.emit('settings:public', {
      register: registerSetting ? (registerSetting as any).value : true,
    })
  },
}
