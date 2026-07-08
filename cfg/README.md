# hydra-cfg

Config distribution tool for the Hydra monorepo. Reads `settings.base.json`, substitutes placeholder tokens, and writes `.env` files into each service directory.

---

## Running

### First-time setup

```bash
cd cfg
npm install
npm run setup
```

This installs Node.js dependencies for all services and writes `.env` files for each one using localhost defaults. No manual editing needed for local development.

### Regenerate after settings change

```bash
cd cfg
npm start
```

---

## `settings.base.json` keys

| Key | Default | Description |
|---|---|---|
| `lang` | `en` | Application language |
| `gateIp` | `localhost` | Gate server host |
| `gatePort` | `4114` | Gate server port |
| `webIp` | `localhost` | Frontend host |
| `webPort` | `5173` | Frontend port |
| `webProtocol` | `http` | Frontend protocol (`http` or `https`) |
| `dbIp` | `localhost` | MongoDB host |
| `dbPort` | `27017` | MongoDB port |
| `dbName` | `hydra` | MongoDB database name |
| `dbParams` | `?directConnection=true` | MongoDB connection params |
| `redis` | *(empty)* | Redis URL (optional) |
| `certKey` | `../cfg/cert/key.pem` | Path to TLS private key |
| `cert` | `../cfg/cert/cert.pem` | Path to TLS certificate |
| `gate` | *(composite)* | WebSocket URL — built from `gateIp` + `gatePort` |
| `web` | *(composite)* | Frontend URL — built from `webProtocol` + `webIp` + `webPort` |
| `mongodb` | *(composite)* | Full MongoDB URI — built from `dbIp`, `dbPort`, `dbName`, `dbParams` |

Edit `settings.base.json` with your values, then run `npm start` to regenerate all `.env` files.

A `settings.json` file (gitignored) can hold local overrides that take precedence over `settings.base.json`.

---

## TLS certificates

Place certificates at:

```
cfg/cert/cert.pem   # Certificate
cfg/cert/key.pem    # Private key
```

Self-signed certificates work fine for local development. The gate service uses these for HTTPS/WSS. See [`docs/instructions/how-to-start-it-locally.md`](../docs/instructions/how-to-start-it-locally.md) for guidance.

---

## Known limitation

The cfg tool writes `.env` files for `gate/`, `web/`, and `image/`.
