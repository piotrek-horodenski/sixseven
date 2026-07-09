import express, { Express, Request, Response } from 'express'
import { readFileSync } from 'fs'
import { createServer } from 'https'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { SettingsService } from './settings.service'
import { Api } from './api'
import { socketHandlers, AuthenticatedSocket } from './socket-handlers'
import { ModelCollectionMapping, models } from './models'
import { Db } from './db'
import { SubscriptionsManager } from './subscriptions/subscriptions'
import { checkSocketRateLimit, clearSocketRateLimits } from './socket-rate-limit'
import logger from './logger'
import { seed } from './services/seed.service'
import { peekTokenType, verifyScopedToken } from './services/tokens.service'

export enum RequestMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
}

export class AppClass {
  public app!: Express
  public io!: Server
  public db!: Db
  public api!: Api
  public server: any
  public subManager!: SubscriptionsManager
  public models: ModelCollectionMapping[]

  logMissingEventHandlers: boolean = false
  settings: any

  constructor() {
    this.settings = SettingsService()
    this.models = models
    this.configureProcessHandlers()
  }

  async boot() {
    await this.initilize()
    await seed()
    this.configureApp()
    this.configureSocket()
  }

  private async initilize() {
    const port = this.settings.port

    this.app = express()
    this.db = new Db()
    await this.db.connect()
    this.api = new Api()
    this.server = createServer({
      key: readFileSync(this.settings.certKey),
      cert: readFileSync(this.settings.cert),
    }, this.app)
    this.io = new Server(this.server, {
      cors: {
        origin: this.settings.webUrl,
        methods: [
          RequestMethod.GET,
          RequestMethod.POST,
          RequestMethod.PUT,
          RequestMethod.DELETE,
        ],
      }
    })
    this.subManager = new SubscriptionsManager()
    this.server.listen(port, () => {
      logger.info({ port }, 'server listening')
    })
  }

  private configureApp() {
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok' })
    })
    this.app.get('/', (req: Request, res: Response) => {
      res.redirect(this.settings.webUrl)
    })
    this.api.init()
  }

  private configureSocket() {
    this.io.use(async (socket, next) => {
      const authSocket = socket as AuthenticatedSocket
      const token = socket.handshake.auth.token
      if (token) {
        // Guest sessions carry a scoped token (typ: 'guest'); everything else is
        // treated as a full user token with DB-backed revocation.
        if (peekTokenType(token) === 'guest') {
          const claims = verifyScopedToken(this.settings.jwtSecret, token)
          if (claims && claims.typ === 'guest') {
            authSocket.guest = { guestId: claims.guestId, roomId: claims.roomId }
          }
        } else {
          try {
            const decoded = jwt.verify(token, this.settings.jwtSecret) as { _id: string }
            const UserModel = this.models.find(item => item.name === 'users')?.model
            if (!UserModel) { next(); return }
            const User = await UserModel.findOne({ _id: decoded._id, token })

            if (User) {
              authSocket.user = User
            }
          } catch {
            // Invalid or expired token — continue without auth
          }
        }
      } else {
        if (authSocket.user) authSocket.user = null
        if (authSocket.guest) authSocket.guest = null
      }

      next()
    })
    this.io.on('connection', (socket) => {
      const authSocket = socket as AuthenticatedSocket

      if (authSocket.user) {
        const u = authSocket.user as any
        socket.emit('session', {
          _id: u._id,
          username: u.username,
          email: u.email,
          profile: u.profile,
          permissions: u.permissions,
          roles: u.roles,
          allRoles: u.allRoles,
        })
      }

      socketHandlers.forEach(handler => {
        socket.on(handler.event, (...args: unknown[]) => {
          if (handler.event !== 'disconnect' && !checkSocketRateLimit(
            socket,
            handler.event,
            this.settings.rateLimitApiMax,
            this.settings.rateLimitWindowMs,
          )) {
            logger.warn({ event: handler.event, socketId: socket.id }, 'socket rate limit exceeded')
            socket.emit('error', { message: 'Rate limit exceeded', event: handler.event })
            return
          }
          handler.handler(authSocket, ...args)
        })
      })

      socket.on('disconnect', () => {
        clearSocketRateLimits(socket)
      })

      this.checkMissingEventHandlers(socket)
    })
  }

  private configureProcessHandlers() {
    process.on('uncaughtException', (err) => { logger.fatal({ err }, 'uncaught exception'); process.exit(1) })
    process.on('unhandledRejection', (reason) => { logger.fatal({ reason }, 'unhandled promise rejection'); process.exit(1) })
  }

  checkMissingEventHandlers(socket: AuthenticatedSocket) {
    if (!this.logMissingEventHandlers) {
      return
    }

    socket.onAny((event: string) => {
      if (socket.listeners(event).length === 0) {
        logger.warn({ event }, 'missing handler for socket event')
      }
    })
  }
}
