# hydra-image

Photo gallery microservice for the Hydra monorepo. Handles image uploads, thumbnail generation, and photo organization via tags and collections.

**Tech**: Node.js, Express, Sharp, Multer, MongoDB (Mongoose), Pino

**Port**: `5179` (HTTP)

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `IMAGE_PORT` | `5179` | Port the server listens on |
| `IMAGE_ADDRESS` | `localhost` | Bind address |
| `IMAGE_WEB_PROTOCOL` | `http` | Protocol (`http` or `https`) |
| `IMAGE_DB_HOST` | `localhost` | MongoDB host |
| `IMAGE_DB_PORT` | `27017` | MongoDB port |
| `IMAGE_DB_NAME` | `hydra` | MongoDB database name |
| `IMAGE_DB_PARAMS` | `?directConnection=true` | MongoDB connection params |
| `IMAGE_DB_PREFIX` | `PG` | Prefix used in logging |
| `IMAGE_THUMB_EXTENSION` | `png` | Thumbnail file format |
| `IMAGE_THUMB_WIDTH` | `200` | Thumbnail width (px) |
| `IMAGE_THUMB_HEIGHT` | `200` | Thumbnail height (px) |
| `IMAGE_PREVIEW_EXTENSION` | `png` | Preview file format |
| `IMAGE_PREVIEW_WIDTH` | `300` | Preview width (px) |
| `IMAGE_PREVIEW_HEIGHT` | `300` | Preview height (px) |
| `IMAGE_DEFAULT_PAGE_SIZE` | `100` | Default `limit` for `GET /photos` |
| `IMAGE_UPLOADS_PATH` | `./uploads` | Directory where originals and thumbs are stored |

Copy `.env.example` → `.env` and adjust as needed.

---

## REST API

Base path: `/api`

### Photos

| Method | Path | Description |
|---|---|---|
| `GET` | `/photos` | List photos. Supports query params: `phrase` (search), `tag`, `collection`, `deleted` (show soft-deleted), `page`, `limit`, `full` (include file data) |
| `POST` | `/photos` | Upload a photo. Multipart form with field `image` (file) + optional `title`, `description`, `tags[]`, `collections[]` |
| `GET` | `/photos/:id` | Serve the original photo file |
| `GET` | `/photos/:id/meta` | Return photo metadata (dimensions, file size, tags, collections, etc.) |
| `PUT` | `/photos/:id` | Update photo title, description, tags, or collections |
| `DELETE` | `/photos/:id` | Soft-delete (sets `isDeleted: true`). Add `?force=1` to hard-delete |
| `POST` | `/photos/batch/update` | Bulk-update tags or collections across multiple photos |

### Tags

| Method | Path | Description |
|---|---|---|
| `GET` | `/tags` | List all tags with usage counts |
| `POST` | `/tags` | Create a tag |
| `DELETE` | `/tags/:id` | Delete a tag |

### Collections

| Method | Path | Description |
|---|---|---|
| `GET` | `/collections` | List all collections with usage counts |
| `POST` | `/collections` | Create a collection |
| `DELETE` | `/collections/:id` | Delete a collection |

### Thumbnails

| Method | Path | Description |
|---|---|---|
| `GET` | `/thumbs/:id` | Serve the thumbnail for a photo |

### Version

| Method | Path | Description |
|---|---|---|
| `GET` | `/version` | Return API version info |

---

## Upload flow

1. `POST /api/photos` receives a multipart request with the image file.
2. **Multer** saves the original to `IMAGE_UPLOADS_PATH/`.
3. **Sharp** generates a thumbnail (`IMAGE_THUMB_WIDTH × IMAGE_THUMB_HEIGHT`) saved to `IMAGE_UPLOADS_PATH/thumbs/`.
4. **Sharp** generates a preview (`IMAGE_PREVIEW_WIDTH × IMAGE_PREVIEW_HEIGHT`) saved alongside the thumbnail.
5. A photo document is written to MongoDB with paths, dimensions, MIME type, file size, tags, and collections.

---

## Running

### Dev (nodemon, auto-reload)

```bash
cd image
npm run dev
```

### Docker

Included in the root `docker-compose.yml` — started with `docker compose up`.

### Tests

```bash
npm test
```

Runs 17 Vitest tests (offline, no live database required).
