# Field Reports — React Native Engineering Technical Submission

A resilient, offline-first mobile reporting application built for inspectors working in remote, harsh environments where 2G connections and frequent dropped sockets are normal.

---

## Table of Contents
1. [Architecture & System Overview](#architecture--system-overview)
2. [Delivery Guarantees & Resilience](#delivery-guarantees--resilience)
3. [Image Pipeline & The 5 MB Ceiling](#image-pipeline--the-5-mb-ceiling)
4. [Backend & Interactive Chaos Simulator](#backend--interactive-chaos-simulator)
5. [How to Run](#how-to-run)
6. [How to Make It Fail (Testing Scenarios)](#how-to-make-it-fail-testing-scenarios)
7. [Engineering Decisions & Rationale](#engineering-decisions--rationale)
8. [What I Knowingly Left Out (Scope Discipline)](#what-i-knowingly-left-out-scope-discipline)
9. [What I Would Do With Another Day](#what-i-would-do-with-another-day)
10. [Test Suite & Headless Verification](#test-suite--headless-verification)

---

## Architecture & System Overview

The core requirement of this brief is that **upload logic must be exercisable without rendering a screen**. The codebase is cleanly decoupled into layered services:

```
src/
├── types/                 # Domain models (Report, ReportImage, QueueState, ChaosConfig)
├── constants/             # Centralized limits, retry policies, backoff formulas, timeouts
├── services/
│   ├── apiClient.ts       # Network transport with transient vs fatal error classification
│   ├── fileSystem.ts      # Persistent app disk storage (survives OS cache sweeps)
│   ├── imagePipeline.ts   # Progressive compression engine (< 5MB guaranteed)
│   ├── network.ts         # NetInfo connectivity & cellular generation monitoring
│   ├── storage.ts         # AsyncStorage metadata layer for persistent queue & drafts
│   └── uploadQueue.ts     # Headless UploadQueueEngine (EventEmitter, state recovery, workers)
├── hooks/                 # Reactive hooks for UI subscribers (useQueue, useNetworkStatus, useServerReports)
├── components/            # Reusable components (Header, ReportCard, ImageThumbnail, ProgressBar, ResetModal)
└── screens/               # Screens (ComposeScreen, OutboxScreen, ReviewScreen, SettingsScreen)
```

---

## Delivery Guarantees & Resilience

### 1. Nothing is Lost (Survives Force-Quit & OS Cache Sweeps)
- **Persistent Image Copying**: Camera capture and gallery pickers commonly store photos in Android’s temporary cache (`/cache`), which the operating system sweeps under memory pressure. When an image is captured or selected, `src/services/fileSystem.ts` **immediately copies it into persistent app document storage** (`field_reports_storage/<id>.jpg`).
- **Crash Recovery**: When the app starts, `UploadQueueEngine.initialize()` scans persistent storage. Any report left in `'processing'` or `'uploading'` state due to an app kill is automatically reverted to `'queued'` and scheduled for immediate processing.
- **Draft Autosaving**: Inspector input is autosaved to disk continuously so an unexpected shutdown while composing loses nothing.

### 2. Nothing Lands Twice (Strict Idempotency)
- Every report is minted with a globally unique UUID (`rep_<timestamp>_<rand>`) at creation.
- Every individual image is minted with a unique UUID (`img_<timestamp>_<rand>`).
- When sending to the backend, the server checks if the report ID or image ID already exists in storage. If it was already received (e.g., connection died while client waited for response), the server acknowledges with HTTP 200 without creating duplicates.

### 3. Progress on a Bad Link (Atomic Per-Image Incremental Delivery)
- Monolithic uploads (sending 5 photos in one 20 MB request) almost never land on a 2G network that keeps dying.
- We implemented **two-phase incremental delivery**:
  1. `POST /api/reports`: Registers metadata and expected image IDs idempotently.
  2. `POST /api/reports/:id/images`: Uploads each image individually.
  3. State is persisted to disk after **every single image upload**. If a connection drops after image 3 of 5, when connectivity returns the engine **only uploads images 4 and 5**. Images 1, 2, and 3 are never re-transmitted!

### 4. Resilient Retries (Exponential Backoff with Jitter)
- Transient errors (socket resets, network dropped, timeouts, HTTP 500, HTTP 503, HTTP 429) trigger automatic retries with exponential backoff and randomized jitter:
  $$\text{delay} = \min(\text{MAX\_DELAY}, \text{BASE} \times 2^{\text{retry}-1}) \times (1 \pm \text{jitter})$$
- Fatal client errors (HTTP 400 Bad Request, unrecoverable payload rejections) are marked terminal and are **never endlessly retried**.

---

## Image Pipeline & The 5 MB Ceiling

The brief specifies:
> *"5 MB per image: A hard ceiling at the destination. The app never sends one over it. Originals are huge: An 18 MB photo straight off the camera is a legitimate selection, not an error. It has to arrive, and it has to still be worth looking at."*

### How it works (`src/services/imagePipeline.ts`):
1. **Target Downscaling**: Large camera photos (12–24 MP) are scaled to a maximum dimension of 2048px with high JPEG quality (82%). For architectural and site inspections, 2048px preserves sharp text on labels, structural hairline cracks, and surface detail while reducing an 18 MB photo to ~600 KB – 1.1 MB.
2. **Progressive Compression Loop**: If after pass 1 an exceptionally complex image is still over 4.5 MB, the pipeline executes a progressive reduction pass (lowering quality by 15% and dimensions by 20%) until guaranteed `< 5.0 MB`.
3. **Hard Destination Guard**: `apiClient.ts` explicitly asserts `compressedSize <= 5 * 1024 * 1024` before initiating a network request. The app will never transmit a file over 5 MB.
4. **Non-blocking**: Compression executes in the background worker queue and does not freeze the UI or the main JS thread.

---

## Backend & Interactive Chaos Simulator

The backend is built in Node.js / Express with Multer and is completely self-contained in `server/`.

### Interactive Chaos Web Dashboard (`http://localhost:3001/dashboard`)
Open `http://localhost:3001` or `http://localhost:3001/dashboard` in your browser while testing. The dashboard provides:
- **Simulate 2G Latency Slider (0 – 6000ms)**: Throttles requests to simulate remote cellular connectivity.
- **Drop Connection Slider (0 – 100%)**: Abruptly destroys incoming TCP sockets mid-flight with no HTTP response.
- **Simulated 500 Failure Slider (0 – 100%)**: Returns HTTP 500 Internal Server Error.
- **Black Hole Mode Toggle**: Requests never respond, testing client-side timeouts.
- **Enforce 5 MB Ceiling Toggle**: Server returns strict HTTP 413 Payload Too Large if any file exceeds 5 MB.
- **Live Activity Log**: Streaming real-time request logs.
- **Server Confirmed Reports**: Real-time gallery of reports and images stored on the server.
- **Start Over / Reset Server Button**: One-click server disk wipe.

---

## How to Run

### Prerequisites
- Node.js >= 20
- Android SDK (API 34/35) & JDK 17
- Android Emulator or physical Android device connected via USB

### 1. Start the Failure-Simulating Backend
In the project root directory:
```bash
npm run server
```
Server starts on `http://localhost:3001`.
You can view the live dashboard in your browser at `http://localhost:3001/dashboard`.

### 2. Start Metro Bundler
In a second terminal:
```bash
npm start
```

### 3. Run on Android
In a third terminal:
```bash
npm run android
```

> **Note for Android Emulator**: The app is pre-configured to reach the backend at `http://10.0.2.2:3001` (Android emulator's alias for host machine `localhost`).  
> **Note for Physical Device**: Open the app's **Settings** tab, update the Server URL to your computer's LAN IP (e.g. `http://192.168.1.50:3001`), and tap **Test Ping**.

---

## How to Make It Fail (Testing Scenarios)

### Scenario A: The Main Evaluation Scenario
1. Open the app on Android.
2. Turn **Airplane Mode ON** (network disconnected).
3. In **Compose**, draft a report with a description and 3 photos. Tap **Submit Report**.
4. Notice:
   - Work is instantly saved.
   - Status badge shows: `Saved to device • Queued for delivery`.
   - Banner warns: `Network Disconnected: Uploads safely paused on device`.
5. Compose 2 more reports, one of them with 5 camera photos.
6. **Force-quit the app** (swipe away from Android recent apps).
7. Reopen the app.
8. Notice: All 3 reports and all photos are intact in the **Outbox** tab with status restored to queued.
9. On your computer in the Chaos Dashboard, set **Latency to 1800ms** (2G simulation) and **Drop Connection Rate to 30%**.
10. Turn **Airplane Mode OFF**.
11. Watch the Outbox: The engine automatically resumes, uploads images incrementally, retries dropped sockets with exponential backoff, and transitions every report to `✓ Confirmed On Server`.
12. Tap the **Review** tab: Pull-to-refresh to fetch all reports directly from `GET /api/reports` with server-hosted image thumbnails.

### Scenario B: Refuse & Grant Permissions from Settings
1. Tap **Take Photo** and select **Deny** on the Android permission dialog.
2. An informative banner appears with an **Open Device Settings** button.
3. Tap **Open Device Settings**, grant camera permission in Android Settings, and press Back to return to the app.
4. Without restarting the app, tap **Take Photo** again: Camera opens immediately.

### Scenario C: Start Over (Deliberate Reset)
1. Open **Settings** tab -> tap **04 Start Over (Reset All)**.
2. The modal explicitly details the blast radius:
   - Local outbox and queue records deleted.
   - Local persistent image storage purged.
   - Active draft cleared.
   - Optional checkbox to also wipe server storage.
3. Tap **Execute Reset**: Outbox and local disk are wiped clean.

---

## Engineering Decisions & Rationale

| Decision | Rationale |
| :--- | :--- |
| **Two-phase incremental upload** | Monolithic multipart uploads (e.g. 5 photos at once) fail catastrophically on 2G when a connection drops at 90%. Per-image delivery guarantees that progress on a bad link is never thrown away. |
| **Persistent Document Directory Copying** | Android cleans the `/cache` directory under memory pressure or on force-close. Copying immediately to `DocumentDirectoryPath` ensures that "nothing is lost to a force-quit". |
| **Progressive 2048px compression** | An 18 MB camera original straight off a modern phone would take 4+ minutes to upload on 2G. Downscaling to 2048px @ 82% quality yields crisp inspection detail (~800 KB) while guaranteeing the file is well below the 5 MB ceiling. |
| **Headless UploadQueueEngine** | As requested in the brief, the upload engine is implemented as a pure TypeScript class independent of React components. It can be instantiated and tested in unit tests and scripts. |
| **Honest UI Copy** | The UI never conflates local state with server delivery. Items waiting for the network say `Saved to device • Queued for delivery`, while delivered items say `✓ Confirmed On Server`. |

---

## What I Knowingly Left Out (Scope Discipline)

Per the brief’s instructions on scope discipline:
- **No User Login / Authentication**: Inspector runs in single-tenant local mode.
- **No Push Notifications**: Status changes are reflected in real-time in the Outbox.
- **No Map / GPS Geolocation**: Photos and descriptions are the sole deliverables.
- **No Post-upload Editing**: Reports are immutable once landed on the server.
- **No Video Capture**: Strict focus on 1–5 photo reports.

---

## What I Would Do With Another Day
1. **Background Service via WorkManager**: While React Native handles backgrounding gracefully, integrating Android `WorkManager` via a headless native module would allow uploads to proceed even when the OS completely terminates the app process overnight.
2. **Chunked Resumable Upload (TUS Protocol)**: For multi-megabyte single files over truly degraded 2G (< 50 kbps), implementing byte-level offset resumption (TUS) so individual image bytes resume from partial offsets.
3. **EXIF Inspection Metadata Preservation**: Extracting camera EXIF metadata (timestamp, focal length) before JPEG compression and attaching it to the report metadata payload.

---

## Test Suite & Headless Verification

Unit tests exercise the `UploadQueueEngine` headless logic without rendering any UI screens:
```bash
npm test -- __tests__/UploadQueueEngine.test.ts
```

All 5 core delivery guarantee tests pass:
1. `Enqueues report into persistent queue and notifies subscribers`
2. `Progress on a bad link: Skips already-uploaded images on retry`
3. `Survives a kill / crash: Recovers in-flight processing reports back to queued on initialize`
4. `Handles transient errors with exponential backoff & retry schedule`
5. `Terminal fatal errors (e.g. 400 Bad Request) are NOT endlessly retried`
