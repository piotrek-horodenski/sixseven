import { Express } from 'express'

import { App } from '../app'

export class Api {

  init() {
    App.app.get('/api/collections/:collection', (req, res) => {
      res.status(501).json({ message: 'Not implemented' })
    })
  }

}
