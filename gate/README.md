# hydra-gate

WebSocket/API gateway for the Hydra monorepo. Handles user authentication, real-time subscriptions, and routes socket events to MongoDB.

**Tech**: Node.js, Express, Socket.io, MongoDB (Mongoose), Pino, bcrypt

**Port**: `4114` (HTTPS + WSS, self-signed cert)

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `GATE_PORT` | `4114` | Port the server listens on |
| `WEB_URL` | `http://localhost:5173` | Frontend URL — gate redirects `/` here |
| `MONGODB_URI` | `mongodb://localhost:27017/hydra?directConnection=true` | MongoDB connection string |
| `REDIS_URL` | *(empty)* | Redis URL — optional, unused in current build |
| `CERT_KEY_PATH` | `../cfg/cert/key.pem` | Path to TLS private key |
| `CERT_PATH` | `../cfg/cert/cert.pem` | Path to TLS certificate |

Copy `.env.example` → `.env` and adjust as needed. Running `cd cfg && npm run setup` does this automatically with localhost defaults.

---

## WebSocket API

Connect to `wss://localhost:4114` (or the configured host/port) using Socket.io.

> **Note**: The gate uses a self-signed certificate. If the browser blocks the WebSocket connection, visit `https://localhost:4114` once and accept the certificate warning.

### Events — client → server

| Event | Payload | Response event(s) | Notes |
|---|---|---|---|
| `register` | `{ email, username, password }` | `register-complete` \| `register-stopped` | Fails if email or username already exists |
| `login` | `{ email, password }` | `login-complete` \| `login-stopped` | `email` field also accepts a username |
| `logout` | *(none)* | `logout-complete` | Clears token from DB, removes all subscriptions |
| `subscribe` | `{ tickets: [{ collection, filter }] }` | *(none)* | Requires authenticated user |
| `unsubscribe` | `{ collections: string[] }` | *(none)* | Pass empty array to remove all subscriptions |
| `disconnect` | *(socket closed)* | *(none)* | Automatically cleans up subscriptions |

### Response payloads

**`login-complete`**
```json
{
  "_id": "...",
  "username": "alice",
  "email": "alice@example.com",
  "profile": { "display": "alice", "type": "regular", "status": "" },
  "permissions": [],
  "token": "..."
}
```

**`login-stopped` / `register-stopped`**
```json
{ "message": "incorect credentials" }
```

**`register-complete`** — full user document returned on success.

**`logout-complete`**
```json
{ "_id": "..." }
```

---

## Subscription system

Authenticated clients can subscribe to named MongoDB collections with an optional filter. The gate watches MongoDB change streams and pushes matching changes back to subscribers.

```js
socket.emit('subscribe', {
  tickets: [
    { collection: 'photos', filter: { tags: 'nature' } }
  ]
})
```

When a matching document changes, clients receive a `{collection}-updated` event (e.g., `photos-updated`).

---

## Running

### Dev (nodemon, auto-reload on `.ts` changes)

```bash
cd gate
npm run start
```

You should see a Pino log line: `"server listening"` with `"port":4114`.

### Docker

Included in the root `docker-compose.yml` — started with `docker compose up`.

### Tests

```bash
npm test
```

Runs 23 Vitest tests (offline, no live database required).
