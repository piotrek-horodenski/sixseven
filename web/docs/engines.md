# Engines & Clusters

This document describes the engine and cluster management module in Hydra — how Unreal Engine instances and their logical groupings are displayed, controlled, and monitored in the frontend.

---

## Overview

Engines represent individual Unreal Engine instances running on physical or virtual machines. Clusters are logical groupings of engines that act as a single unit (typically one engine per camera in a multi-camera setup).

The module lives under the `/engines` route and is gated by the `manage-engines` permission.

---

## Data Model

### IEngine

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | Unique identifier |
| `alias` | string | Display name |
| `address` | string | IP address or hostname |
| `port` | number | Guard/health-check port (default 30011) |
| `rePort` | number | Remote Control API port (default 30010) |
| `cameraNumber` | number | Preferred camera (0 = no preference) |
| `status` | 0 \| 1 \| 2 | Engine state: 0=New, 1=Active, 2=Inactive |
| `since` | number | Epoch ms when current status was entered |
| `lastAttempt` | number | Epoch ms of most recent poll attempt |
| `assignedProject` | string | Project name reported by the engine |
| `assignedProjectId` | string | MongoDB `_id` of assigned project |
| `initialized` | boolean | True after first successful project initialization |
| `locked` | boolean | Engine is locked to a project |
| `info` | IEngineInfo? | Detailed status from engine's `/status` endpoint |
| `errorCount` | number? | Cumulative error counter |
| `logs` | { log: string }? | Latest engine log content |
| `loadingLogs` | boolean? | True while logs are being fetched |

### IEngineInfo

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Detailed state: Ok, Busy, Idle, Deploying, Starting, Unknown, MultipleRunning, NotResponding, Died |
| `project` | { id: string }? | Project currently reported by the engine |

### IEngineError

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | Unique identifier |
| `engineId` | string | Engine this error belongs to |
| `timestamp` | number | Epoch ms when the error occurred |
| `data` | string | Error message/stack trace |

### ICluster

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | Unique identifier |
| `alias` | string | Display name |
| `engines` | string[] | Ordered array of engine `_id` references |

---

## Engine Status Display

The engine status indicator uses a color-coded dot with two layers:

### Base status (status field: 0, 1, 2)

| Status | Color | Animation |
|--------|-------|-----------|
| New (0) | Orange | None |
| Active (1) | Green | None |
| Inactive (2) | Red | Blink |

### Extended status (info.status, only when base status is Active)

| Info Status | Color | Animation | Meaning |
|-------------|-------|-----------|---------|
| Ok | Green | None | Engine running normally |
| Busy | Green | None | Engine processing a command |
| Idle | Orange | None | Engine active but no project loaded |
| Deploying | Orange | Blink | Project deployment in progress |
| Starting | Dark orange | None | Engine starting up |
| MultipleRunning | Orange | None | Multiple UE instances detected |
| Unknown | Red | Blink | Status could not be determined |
| NotResponding | Red | Blink | Engine reachable but not responding properly |
| Died | Red | Blink | Engine process crashed |

When the engine is active and has an `info.status`, the extended status replaces the base "Active" label in both the engine card and detail panel.

---

## Routes

| Path | Name | Description |
|------|------|-------------|
| `/engines` | — | Redirects to `/engines/clusters` |
| `/engines/list` | `engines` | Engine list view |
| `/engines/list/:id` | `engine-detail` | Engine list with detail aside panel |
| `/engines/clusters` | `clusters` | Cluster list view |
| `/engines/clusters/:id` | `cluster-detail` | Cluster list with detail intro |
| `/engines/logs/:id` | `engine-logs` | Engine log viewer (full page) |
| `/engines/errors/:id` | `engine-errors` | Engine error list (full page) |

---

## Components

### EngineCard
Displays an engine in the list view with status dot, alias, address, ports, camera, extended status label, project assignment, and lock indicator. Actions are accessed via a dropdown menu (ellipsis icon):

- **Wake up** — triggers an immediate poll of this engine
- **Show logs** — opens the log viewer in a new tab
- **Show errors** — opens the error viewer in a new tab
- **Unlock engine** — shown only when engine is locked with no assigned project
- **Edit** — opens the edit popup
- **Delete** — opens delete confirmation

### EngineDetailPanel
Side panel shown when selecting an engine from the list. Displays full engine info in a table format plus action buttons: Wake Up, Unlock (conditional), Logs, Errors.

### EngineLogsView
Full-page monospace log viewer. Polls the backend every 10 seconds via `engines:show-logs`. Auto-scrolls to bottom when the user is already scrolled to the end. Shows a loading indicator while logs are being fetched.

### EngineErrorsView
Full-page error list showing all recorded errors for an engine, sorted newest first. Each error shows a relative timestamp and the error data in a monospace font. Subscribes to the `engine-errors` collection filtered by engine ID. Includes a "Clear" button to clear all errors.

### ClustersView
Cluster management page. Each cluster is rendered as a ClusterCard.

### ClusterCard
Expandable card showing cluster alias, status aggregation, and engine count. When expanded, shows member engines with status indicators, reorder buttons (up/down), and a remove button. Unclustered engines can be added via a dropdown select.

Cluster status aggregation:
- All engines active → Green
- All engines inactive → Red
- Mixed or no engines → Orange/Warning

---

## Store (useEnginesStore)

### State
- `engines` — reactive array of all engines
- `clusters` — reactive array of all clusters
- `engineErrors` — reactive array of errors for the currently-subscribed engine
- `searchPhrase` — filter text for list views

### Subscriptions
The store subscribes to `engines` and `clusters` collections via WebSocket on init. Real-time updates arrive through `collection-init`, `collection-add`, `collection-update`, `collection-delete` events.

Error subscriptions are per-engine and managed separately via `subscribeErrors(engineId)` / `unsubscribeErrors()`.

### Actions

| Action | Socket Event | Description |
|--------|-------------|-------------|
| `createEngine(data)` | `engines:create` | Add a new engine |
| `updateEngine(data)` | `engines:update` | Edit engine alias/camera |
| `deleteEngine(_id)` | `engines:delete` | Remove an engine |
| `wakeUpEngine(_id)` | `engines:wake-up` | Trigger immediate poll |
| `unlockEngine(_id)` | `engines:unlock` | Unlock a locked engine |
| `showLogs(_id)` | `engines:show-logs` | Request log fetch from engine |
| `clearEngineErrors(_id)` | `engines:clear-errors` | Clear error history |
| `createCluster(data)` | `clusters:create` | Add a new cluster |
| `updateCluster(data)` | `clusters:update` | Edit cluster alias/engines |
| `deleteCluster(_id)` | `clusters:delete` | Remove a cluster |

---

## File Structure

```
src/
├── modules/engines/
│   ├── EnginesView.vue          # Engine list page
│   ├── EngineCard.vue           # Engine list item with dropdown menu
│   ├── EngineDetailPanel.vue    # Engine detail aside panel
│   ├── EngineEditPopup.vue      # Add/edit engine popup
│   ├── EngineDeleteConfirm.vue  # Delete confirmation popup
│   ├── EngineLogsView.vue       # Full-page log viewer
│   ├── EngineErrorsView.vue     # Full-page error list
│   ├── EnginesSubmenu.vue       # Engines/Clusters tab navigation
│   ├── EnginesSidebar.vue       # Engine list sidebar (clusters view)
│   ├── ClustersView.vue         # Cluster list page
│   ├── ClusterCard.vue          # Cluster expandable card
│   ├── ClusterEditPopup.vue     # Add/edit cluster popup
│   └── ClusterIntro.vue         # Cluster name editor (intro slot)
├── stores/engines/
│   ├── engines.store.ts         # Pinia store
│   └── engines.model.ts         # TypeScript interfaces and constants
├── router/routes/
│   └── engines.route.ts         # Route definitions
└── styles/modules/
    └── engines.scss             # All engine/cluster styles
```
