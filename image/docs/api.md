# API Documentation

This document provides information about the Hydra Image API endpoints, request/response formats, and usage examples.

## Base URL

The API is accessible at: `http://localhost:5179`

## Authentication

Currently, the API does not require authentication.

## Endpoints

### Photos

#### Get all photos

```
GET /api/photos
```

Query parameters:
- `page`: Page number (default: 1)
- `limit`: Number of items per page (default: 100)
- `sort`: Sort field (e.g., `createdAt`)
- `order`: Sort order (`asc` or `desc`)

#### Get a specific photo

```
GET /api/photos/:id
```

#### Upload a photo

```
POST /api/photos
```

Request body (multipart/form-data):
- `image`: The image file to upload

#### Delete a photo

```
DELETE /api/photos/:id
```

### Collections

#### Get all collections

```
GET /api/collections
```

#### Get a specific collection

```
GET /api/collections/:id
```

#### Create a collection

```
POST /api/collections
```

Request body (JSON):
```json
{
  "name": "Collection Name",
  "description": "Collection Description"
}
```

#### Update a collection

```
PUT /api/collections/:id
```

#### Delete a collection

```
DELETE /api/collections/:id
```

### Tags

#### Get all tags

```
GET /api/tags
```

#### Get a specific tag

```
GET /api/tags/:id
```

#### Create a tag

```
POST /api/tags
```

Request body (JSON):
```json
{
  "name": "Tag Name"
}
```

#### Update a tag

```
PUT /api/tags/:id
```

#### Delete a tag

```
DELETE /api/tags/:id
```

### Thumbnails

#### Get a thumbnail

```
GET /api/thumbs/:id
```

## Error Handling

The API returns appropriate HTTP status codes and error messages in case of failures.

Common error codes:
- `400`: Bad Request
- `404`: Not Found
- `500`: Internal Server Error

Error response format:
```json
{
  "error": "Error message"
}
