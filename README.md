# ZPL Label Printer for Phomemo M110

A client-side web application that renders ZPL (Zebra Programming Language) labels and prints them to a Phomemo M110 thermal label printer via Web Bluetooth.

## Features

- **ZPL Rendering**: Renders ZPL code locally in the browser to a bitmap
- **1-bit Monochrome**: Converts to 1-bit monochrome with Floyd-Steinberg dithering
- **Web Bluetooth**: Connects to Phomemo M110 (and compatible) printers via BLE
- **Mobile-First**: Optimized for Android Chrome with large touch targets
- **No Cloud**: All processing happens locally in your browser

## Requirements

- **Browser**: Chrome or Chromium-based browser with Web Bluetooth support
- **Platform**: Android recommended (Web Bluetooth works best on Android)
- **Printer**: Phomemo M110, M120, M220, or compatible thermal label printer
- **Labels**: 20-48mm width labels (max 384px at 203 DPI)

## Usage

### 1. Open the App

Serve the files using any local web server:

```bash
# Using Python
python -m http.server 8080

# Using Node.js (npx)
npx serve .

# Using PHP
php -S localhost:8080
```

Then open `http://localhost:8080` in Chrome.

### 2. Connect Your Printer

1. Turn on your Phomemo M110 printer
2. Tap **Connect Printer** in the app
3. Select your printer from the Bluetooth device list

### 3. Select Label Size

Choose from presets or enter custom dimensions:
- 40 × 30 mm (default)
- 30 × 15 mm
- 50 × 30 mm
- 40 × 20 mm
- Custom (20-48mm width)

### 4. Enter ZPL Code

Paste your ZPL code in the text area. The preview updates automatically.

Example ZPL:
```zpl
^XA
^FO50,30^A0N,40,40^FDHello World^FS
^FO50,80^GB200,3,3^FS
^FO50,100^A0N,25,25^FDPhomemo M110^FS
^XZ
```

### 5. Print

Tap **Print Label** to send the label to your printer.

## Supported ZPL Commands

The built-in ZPL renderer supports common commands:

| Command | Description |
|---------|-------------|
| `^XA` | Start format |
| `^XZ` | End format |
| `^FO` | Field origin (x,y position) |
| `^FD` | Field data (text content) |
| `^FS` | Field separator |
| `^A`, `^A0` | Font selection |
| `^CF` | Change default font |
| `^GB` | Graphic box (rectangles) |
| `^GF` | Graphic field (bitmap data) |
| `^BY` | Barcode defaults |
| `^BC` | Code 128 barcode |
| `^FR` | Field reverse print |
| `^LH` | Label home position |
| `^FW` | Field orientation |

For complex labels with barcodes or advanced features, consider using an external ZPL rendering service for the preview.

## Technical Details

### Resolution

- **DPI**: 203 (≈ 8 dots per mm)
- **Max Width**: 384 pixels (48mm)
- **Conversion**: `pixels = mm × 8`

### Bluetooth Protocol

The app uses Web Bluetooth to communicate with the printer:
- Service UUID: `0000ff00-0000-1000-8000-00805f9b34fb`
- Write Characteristic: `0000ff02-0000-1000-8000-00805f9b34fb`

Data is sent in MTU-safe chunks with appropriate delays.

### Bitmap Format

- 1-bit packed bitmap (MSB first)
- 8 pixels per byte
- Floyd-Steinberg dithering for grayscale conversion
- Inverted for printer protocol (1=black, 0=white in output)

## Project Structure

```
M110 Print/
├── index.html          # Main HTML file
├── css/
│   └── styles.css      # Mobile-first styles
├── js/
│   ├── app.js          # Main application logic
│   ├── bluetooth.js    # Web Bluetooth connection
│   ├── printer.js      # Phomemo printer protocol
│   ├── zpl-renderer.js # ZPL to canvas rendering
│   └── utils.js        # Utility functions
├── README.md           # This file
└── spec.md             # Functional specification
```

## Browser Compatibility

| Browser | Platform | Support |
|---------|----------|---------|
| Chrome | Android | ✅ Full support |
| Chrome | Windows/Mac/Linux | ⚠️ Requires flag or origin trial |
| Edge | Windows | ⚠️ Experimental |
| Safari | iOS/macOS | ❌ Not supported |
| Firefox | All | ❌ Not supported |

## Troubleshooting

### "Web Bluetooth is not supported"

- Use Chrome or a Chromium-based browser
- On desktop, enable `chrome://flags/#enable-web-bluetooth`

### Printer not found

- Ensure the printer is powered on and not connected to another device
- Try moving closer to the printer
- Restart the printer and refresh the page

### Print quality issues

- Check label alignment in the printer
- Ensure labels match the selected size
- Try adjusting the ZPL positioning

### Connection drops during print

- Keep the phone/tablet close to the printer
- Avoid switching apps during printing
- Try printing smaller labels first

## License

MIT License - Feel free to modify and use as needed.

## Credits

Inspired by [transcriptionstream/phomymo](https://github.com/transcriptionstream/phomymo) for the Bluetooth printing protocol.
