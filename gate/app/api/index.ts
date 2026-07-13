import express, { Request, Response } from 'express'
import crypto from 'crypto'
import mongoose from 'mongoose'

import { App } from '../app'
import { SettingsService } from '../settings.service'
import { createGamesClient, GamesClient } from '../services/games-client'
import { createMatchTokenOriginChecker, MatchTokenOriginChecker } from '../services/cors-origins'
import { exchangeHandoffForMatchToken } from '../services/auth-exchange'
import { issueGuestToken } from '../services/tokens.service'
import logger from '../logger'

/**
 * REST bramki (2d). Dwa endpointy publiczne bez sesji socketowej:
 *  - POST /auth/match-token  — wymiana kodu handoff na token meczu (sekcja B).
 *  - POST /rooms/join-guest  — wejście gościa z linku pokoju (sekcja A).
 *
 * Klient gate→games budowany LENIWIE (env czytany przy pierwszym wywołaniu).
 */
export class Api {
  private gamesClient: GamesClient | null = null
  private originChecker: MatchTokenOriginChecker | null = null

  private getGamesClient(): GamesClient {
    if (!this.gamesClient) {
      const settings = SettingsService()
      this.gamesClient = createGamesClient({ baseUrl: settings.gamesUrl, internalSecret: settings.internalSecret })
    }
    return this.gamesClient
  }

  /**
   * Bramkarz CORS dla /auth/match-token (4d): WEB_URL LUB origin uiUrl gry
   * published (cache 60 s). Kolekcję `games` pisze serwis games — gate czyta
   * ją surowym sterownikiem (jak initial-load subskrypcji), bez modelu gate.
   */
  private getOriginChecker(): MatchTokenOriginChecker {
    if (!this.originChecker) {
      this.originChecker = createMatchTokenOriginChecker({
        webUrl: SettingsService().webUrl,
        loadPublishedUiUrls: async () => {
          const docs = await mongoose.connection
            .collection('games')
            .find(
              { status: 'published', uiUrl: { $type: 'string', $nin: [null, ''] } },
              { projection: { uiUrl: 1 } },
            )
            .limit(500)
            .toArray()
          return docs
            .map(d => (d as { uiUrl?: unknown }).uiUrl)
            .filter((u): u is string => typeof u === 'string' && u.length > 0)
        },
      })
    }
    return this.originChecker
  }

  private getRoomModel() {
    return App.models.find(m => m.name === 'rooms')?.model
  }

  init() {
    // CORS dla REST bramki. Aplikacja gry (/game/rps) i wejście gościa wołają
    // /auth/match-token oraz /rooms/join-guest z originu web (inny port), więc
    // przeglądarka robi preflight OPTIONS i wymaga nagłówków CORS. socket.io ma
    // własny CORS; REST dostaje go tutaj.
    //
    // /auth/match-token (4d): origin dozwolony gdy WEB_URL LUB origin uiUrl gry
    // published (cache 60 s). Niedozwolony origin => BRAK nagłówka ACAO —
    // przeglądarka utnie odpowiedź (dotyczy też preflightu OPTIONS).
    // /rooms/join-guest i pozostałe ścieżki: bez zmian (odbijamy origin — dev;
    // w prod ograniczyć).
    App.app.use(async (req: Request, res: Response, next) => {
      const origin = req.headers.origin
      res.header('Vary', 'Origin')
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.header('Access-Control-Allow-Headers', 'Content-Type')
      if (req.path === '/auth/match-token') {
        try {
          if (origin && await this.getOriginChecker().isAllowed(origin)) {
            res.header('Access-Control-Allow-Origin', origin)
          }
        } catch (err) {
          // Awaria sprawdzenia = traktuj jak niedozwolony (brak ACAO), nie 500.
          logger.error({ err }, 'match-token CORS check failed')
        }
      } else {
        res.header('Access-Control-Allow-Origin', origin || SettingsService().webUrl)
      }
      if (req.method === 'OPTIONS') {
        res.sendStatus(204)
        return
      }
      next()
    })

    App.app.use(express.json())

    App.app.get('/api/collections/:collection', (_req: Request, res: Response) => {
      res.status(501).json({ message: 'Not implemented' })
    })

    // Wymiana handoff → token meczu.
    App.app.post('/auth/match-token', async (req: Request, res: Response) => {
      try {
        const settings = SettingsService()
        const result = await exchangeHandoffForMatchToken(
          { jwtSecret: settings.jwtSecret, getMatch: (id) => this.getGamesClient().getMatch(id) },
          req.body?.code,
        )
        if (!result.ok) {
          res.status(result.status).json({ message: result.message })
          return
        }
        res.json({
          token: result.token,
          matchId: result.matchId,
          playerId: result.playerId,
          gameId: result.gameId,
          expiresAt: result.expiresAt,
        })
      } catch (err) {
        logger.error({ err }, 'match-token exchange failed')
        res.status(500).json({ message: 'internal error' })
      }
    })

    // Wejście gościa z linku pokoju.
    App.app.post('/rooms/join-guest', async (req: Request, res: Response) => {
      try {
        const { code, nick } = req.body ?? {}
        if (typeof code !== 'string' || !code) {
          res.status(400).json({ message: 'code required' })
          return
        }

        const RoomModel = this.getRoomModel()
        if (!RoomModel) {
          res.status(500).json({ message: 'rooms unavailable' })
          return
        }

        const room = await RoomModel.findOne({ code: code.toUpperCase() })
        if (!room) {
          res.status(404).json({ message: 'room not found' })
          return
        }
        if ((room as any).status !== 'open') {
          res.status(409).json({ message: 'room is not open' })
          return
        }

        const guestId = 'g_' + crypto.randomBytes(9).toString('hex')
        const guestNick = typeof nick === 'string' && nick.trim() ? nick.trim() : 'Guest'

        await RoomModel.updateOne(
          { _id: room._id, 'members.id': { $ne: guestId } },
          { $push: { members: { id: guestId, kind: 'guest', nick: guestNick } }, $set: { updatedAt: Date.now() } },
        )

        // Mecz powstaje już przy zakładaniu gry (Etap 3B) — gościa trzeba dopisać
        // do MECZU (guestIds), inaczej handoff mówi „not a member of this match".
        // Analogicznie do rooms:join dla zalogowanych. Pełny slot → pokój `matched`.
        const matchId = (room as any).matchId
        if (matchId) {
          const joinResult = await this.getGamesClient().joinMatch(String(matchId), guestId, 'guest', guestNick)
          if (!joinResult.ok) {
            // Wycofaj membera-gościa, by pokój nie trzymał kogoś spoza meczu.
            await RoomModel.updateOne({ _id: room._id }, { $pull: { members: { id: guestId } }, $set: { updatedAt: Date.now() } })
            logger.warn({ roomId: String(room._id), matchId: String(matchId), status: joinResult.status }, 'guest join-match failed')
            res.status(409).json({ message: joinResult.error || 'could not join match' })
            return
          }
          if (joinResult.data?.full) {
            await RoomModel.updateOne({ _id: room._id }, { $set: { status: 'matched', updatedAt: Date.now() } })
          }
        }

        const settings = SettingsService()
        const token = issueGuestToken(settings.jwtSecret, { guestId, roomId: String(room._id) })

        logger.info({ roomId: String(room._id), guestId }, 'guest joined room')
        res.json({ token, roomId: String(room._id), guestId, gameId: (room as any).gameId })
      } catch (err) {
        logger.error({ err }, 'rooms join-guest failed')
        res.status(500).json({ message: 'internal error' })
      }
    })
  }
}
