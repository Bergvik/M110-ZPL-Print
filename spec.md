# ZPL → Bitmap → Phomemo M110 (Android Web App) — Functional Spec

## 1) Purpose
Build a **client-side** JavaScript web app that:
- Accepts **raw ZPL** as text input
- Renders it locally to a **bitmap at 203 DPI (≈ 8 dpmm)**
- Converts to **1-bit monochrome**
- Prints to a **Phomemo M110** over **Web Bluetooth (BLE)**
- Uses the working connectivity part from https://github.com/transcriptionstream/phomymo

This is a deterministic execution pipeline:
**ZPL in → bitmap → printer**

## 2) Non-Goals
- No visual designer / drag-and-drop editor
- No cloud services
- No database
- No accounts
- No saving/loading label projects (no storage logic)

## 3) Target Environment & Constraints
- Platform: **Android**
- Browser: **Chrome / Chromium with Web Bluetooth**
- Printer: **Phomemo M110 (BLE)**
- Print resolution: **203 DPI (≈ 8 dpmm)**
- Max printable width: **384 px (≈ 48 mm)**

**Hard constraint**
- If rendered label width **> 384 px**, **block printing** and show a clear error.

## 4) Label Size Handling (20–48 mm width)
The app must support printing labels from **20 mm to 48 mm width** (inclusive).

### 4.1 Units & Conversion
- `dpmm = 8` (fixed)
- `pxWidth  = round(widthMm  * 8)`
- `pxHeight = round(heightMm * 8)`

### 4.2 Validation
- Reject width if:
  - `widthMm < 20` or `widthMm > 48`, OR
  - `pxWidth > 384`
- Height can be any positive value supported by the rendering pipeline and printer feed (no artificial cap in UI unless required by implementation).

### 4.3 Presets + Custom
Provide:
- Preset label sizes (examples; editable list is fine):
  - 40×30 mm
  - 30×15 mm
- Custom width/height inputs (mm)

## 5) User Flow (Only This)
1. User opens the web app in Chrome (Android)
2. User taps **Connect Printer**
3. User selects **label size** (preset or custom)
4. User pastes **ZPL**
5. App renders **preview automatically**
6. User taps **Print**
7. Label prints

That’s it.

## 6) Core Functional Requirements

### 6.1 ZPL Input
- Accept raw ZPL text (no parsing assumptions beyond the renderer)
- ZPL input must **not be lost** if rendering/printing fails

### 6.2 Rendering (Preview Must Match Print)
- Render ZPL locally using a **browser-compatible ZPL rendering library**
- Render target must use:
  - `dpmm = 8` (203 DPI)
  - Canvas/image output sized exactly to the chosen label dimensions (pxWidth/pxHeight)
- **No rescaling after render**
- Preview must match printed output **1:1** (same raster pipeline)

### 6.3 Bitmap Pipeline
- Render ZPL → canvas/image
- Convert to **1-bit monochrome**
- Feed the exact same 1-bit raster used for print into the preview (or preview the pre-threshold canvas plus an optional “Printed view” toggle, but print must always use the deterministic 1-bit pipeline)

## 7) Bluetooth & Printing

### 7.1 Connectivity (Web Bluetooth)
- Use **Web Bluetooth**
- Connection must be initiated by a **manual user gesture** (tap)
- No auto-reconnect requirement

### 7.2 Transport & Printer Protocol
- Convert 1-bit bitmap into the **raster/command format required by the M110**
- Send over BLE in **MTU-safe chunks**
- Must surface printer connection + print progress states

**Implementation requirement**
- Reuse the **connection, upload, and printer info** code from `transcriptionstream/phomymo` (specifically the web Bluetooth + raster printing path). The project documents a browser-based BLE printing flow and a pipeline that converts canvas output into 1-bit raster and sends commands over Web Bluetooth. :contentReference[oaicite:0]{index=0}

### 7.3 Print Controls
- Print a single label
- Optional: number of copies (client-side loop)

## 8) UI Requirements (Mobile-First, Minimal)
The UI must be optimized for **Android Chrome**, with large touch targets.

Required components:
- **Connect Printer** button
- Connection status indicator: **Connected / Not connected**
- Label size selector:
  - Presets dropdown
  - Custom width/height (mm)
- ZPL text input (multi-line)
- Auto-rendered preview (canvas/image)
- **Print** button
- Print status indicator: **Printing / Done / Error**

No additional “PC-centric” layout, panels, or designer tools.

## 9) Errors & Guarantees
Show clear, actionable errors for:
- Web Bluetooth unsupported
- Printer not connected
- ZPL render fails
- Label width exceeds printer limit (> 384 px)
- BLE transmission fails

Guarantees:
- ZPL text is never lost on error
- All processing stays local in the browser
