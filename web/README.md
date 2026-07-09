# new-hydra-web

Active development frontend for the Hydra monorepo. This is the next iteration of `web/` — new features land here and will eventually replace `web/`.

**Tech**: Vue 3, Vite, Pinia, Vue Router, TypeScript, FontAwesome, floating-vue

**Dev port**: `5173`

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_GATE_URL` | `wss://localhost:4114` | WebSocket URL for the gate service |

Copy `.env.example` → `.env`. This is the only variable required.

> The gate uses a self-signed certificate. If the WebSocket connection is blocked, visit `https://localhost:4114` in your browser and accept the certificate warning once.

---

## Pages

### Home (`/`)

Landing page. Shows a sidebar with messages and a main content area.

![Home page](../docs/screenshots/01-home.png)

### Controls (`/controls`)

Live showcase of all UI components. Use this page to explore and test the component library.

Includes toggles for **dark mode**, **top/vertical menu layout**, and **progress bar**.

Sections:
- **Transitions** — UiGeneralTransition, Roll3dUp/Down animations
- **UiLoaders** — Spinner variants (tiny, big; fast, slow)
- **UiMessages** — Info, success, warning, and error messages (with closable option)
- **Inputs** — UiInput, UiTextarea, UiNumber with validation states
- **Buttons** — Simple, accent, icon, and loading-state buttons
- **Checkboxes** — Normal and accent styles, disabled states
- **Radios** — Grouped radio buttons with conditional logic
- **Switches** — UiSwitch with enabled/disabled states
- **Popups** — Modal dialog with UiForm slots

![Controls page](../docs/screenshots/02-controls.png)

### Typography (`/typo`)

Typography and text styling showcase. Covers links (regular/accent/quoted), paragraphs, lists, headers (H1–H4), and dividers.

Also demonstrates UiPopup and the progress bar toggle.

![Typography page](../docs/screenshots/03-typography.png)

### Settings (`/settings`)

Settings page — placeholder, pending feature implementation.

---

## UI components

Located in `src/controls/`:

| Component | Description |
|---|---|
| `UiButton` | Action button with loading state and icon support |
| `UiInput` | Text input with label and disabled state |
| `UiTextarea` | Multi-line input with optional auto-height |
| `UiCheckbox` | Checkbox with accent styling |
| `UiRadio` | Radio button for grouped selections |
| `UiNumber` | Numeric input with precision control |
| `UiSwitch` | Toggle switch |
| `UiMessage` | Alert banner (info, success, warning, error) |
| `UiProgress` | Progress bar |
| `UiPopup` | Modal dialog |
| `UiLoader` | Loading spinner (multiple sizes/speeds) |
| `UiForm` | Form container with error and button slots |

---

## Running

### Dev

```bash
cd new
npm run dev
```

Open `http://localhost:5173`.

### Build

```bash
npm run build
```

Output goes to `dist/`.

### Docker

Multi-stage Dockerfile: Vite builds the app, then nginx serves `dist/`. Included in the root `docker-compose.yml`.

```bash
docker compose up --build
```
