/**
 * Phomemo M110 Printer Protocol Implementation
 * 
 * Handles bitmap conversion and printer command generation.
 * Based on ESC/POS-like protocol used by Phomemo printers.
 */

import * as bluetooth from './bluetooth.js';
import { sleep } from './utils.js';

// Printer constants
const MAX_WIDTH = 384; // Maximum print width in pixels
const CHUNK_DELAY = 30; // Delay between data chunks (ms)
const LINE_DELAY = 5; // Delay between print lines (ms)

/**
 * Printer command bytes
 */
const CMD = {
    // ESC/POS-like commands
    ESC: 0x1B,
    GS: 0x1D,
    
    // Initialize printer
    INIT: [0x1B, 0x40],
    
    // Set line spacing
    LINE_SPACING: [0x1B, 0x33],
    
    // Print and feed by dots (ESC J n) - feeds n dots
    FEED_DOTS: [0x1B, 0x4A],
    
    // Set print density (0-15)
    DENSITY: [0x1F, 0x11, 0x02],
    
    // Start raster print mode
    RASTER_MODE: [0x1D, 0x76, 0x30, 0x00],
    
    // Feed paper by lines (ESC d n) - less precise
    FEED_LINES: [0x1B, 0x64],
    
    // Cut paper (if supported)
    CUT: [0x1D, 0x56, 0x00]
};

// Default feed after print in mm (at 8 dpmm = dots)
const DEFAULT_FEED_MM = 4;

/**
 * Build initialization command sequence
 * @returns {Uint8Array}
 */
function buildInitCommand() {
    return new Uint8Array([
        ...CMD.INIT,           // Initialize
        ...CMD.LINE_SPACING, 0 // Set line spacing to 0
    ]);
}

/**
 * Build raster print command header
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @returns {Uint8Array}
 */
function buildRasterHeader(width, height) {
    const widthBytes = Math.ceil(width / 8);
    
    // GS v 0 - Print raster bit image
    // Format: GS v 0 m xL xH yL yH [data]
    // m = 0 (normal), 1 (double width), 2 (double height), 3 (both)
    return new Uint8Array([
        0x1D, 0x76, 0x30, 0x00,
        widthBytes & 0xFF,
        (widthBytes >> 8) & 0xFF,
        height & 0xFF,
        (height >> 8) & 0xFF
    ]);
}

/**
 * Build paper feed command (by dots for precision)
 * @param {number} dots - Number of dots to feed (8 dots ≈ 1mm at 203 DPI)
 * @returns {Uint8Array}
 */
function buildFeedCommand(dots = 32) {
    // ESC J n - Feed n dots (more precise than ESC d which feeds lines)
    return new Uint8Array([...CMD.FEED_DOTS, Math.min(dots, 255)]);
}

/**
 * Convert mm to dots at 8 dpmm (203 DPI)
 * @param {number} mm - Distance in millimeters
 * @returns {number} Distance in dots
 */
function mmToDots(mm) {
    return Math.round(mm * 8);
}

/**
 * Convert 1-bit bitmap to printer format
 * Inverts colors (printer expects 1=black, 0=white)
 * @param {Uint8Array} bitmap - 1-bit packed bitmap (MSB first)
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @returns {Uint8Array}
 */
function convertBitmapForPrinter(bitmap, width, height) {
    const rowBytes = Math.ceil(width / 8);
    const result = new Uint8Array(bitmap.length);
    
    // Invert all bytes (printer uses 1=black, our bitmap uses 0=black)
    for (let i = 0; i < bitmap.length; i++) {
        result[i] = bitmap[i] ^ 0xFF;
    }
    
    return result;
}

/**
 * Print a 1-bit monochrome bitmap
 * @param {Uint8Array} bitmap - 1-bit packed bitmap
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {Function} [onProgress] - Progress callback (0-1)
 * @returns {Promise<void>}
 */
export async function printBitmap(bitmap, width, height, onProgress) {
    if (!bluetooth.getConnectionStatus()) {
        throw new Error('Printer not connected');
    }
    
    if (width > MAX_WIDTH) {
        throw new Error(`Image width (${width}px) exceeds maximum (${MAX_WIDTH}px)`);
    }
    
    const rowBytes = Math.ceil(width / 8);
    const printerData = convertBitmapForPrinter(bitmap, width, height);
    
    try {
        // Initialize printer
        if (onProgress) onProgress(0);
        await bluetooth.write(buildInitCommand());
        await sleep(50);
        
        // Send raster header
        const header = buildRasterHeader(width, height);
        await bluetooth.write(header);
        await sleep(20);
        
        // Send image data in rows
        const ROWS_PER_CHUNK = 8; // Send multiple rows at once for efficiency
        const totalChunks = Math.ceil(height / ROWS_PER_CHUNK);
        
        for (let chunk = 0; chunk < totalChunks; chunk++) {
            const startRow = chunk * ROWS_PER_CHUNK;
            const endRow = Math.min(startRow + ROWS_PER_CHUNK, height);
            const startByte = startRow * rowBytes;
            const endByte = endRow * rowBytes;
            
            const chunkData = printerData.slice(startByte, endByte);
            await bluetooth.write(chunkData, 100, CHUNK_DELAY);
            
            if (onProgress) {
                onProgress((chunk + 1) / totalChunks * 0.9);
            }
        }
        
        // Feed paper after print (small amount to clear print head)
        await sleep(100);
        await bluetooth.write(buildFeedCommand(mmToDots(DEFAULT_FEED_MM)));
        
        if (onProgress) onProgress(1);
        
    } catch (error) {
        throw new Error(`Print failed: ${error.message}`);
    }
}

/**
 * Print multiple copies of a bitmap
 * @param {Uint8Array} bitmap - 1-bit packed bitmap
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {number} copies - Number of copies to print
 * @param {Function} [onProgress] - Progress callback (currentCopy, totalCopies, printProgress)
 * @returns {Promise<void>}
 */
export async function printMultiple(bitmap, width, height, copies, onProgress) {
    for (let i = 0; i < copies; i++) {
        await printBitmap(bitmap, width, height, (progress) => {
            if (onProgress) {
                onProgress(i + 1, copies, progress);
            }
        });
        
        // Delay between copies
        if (i < copies - 1) {
            await sleep(500);
        }
    }
}

/**
 * Feed paper without printing
 * @param {number} mm - Distance to feed in mm (default 5mm)
 * @returns {Promise<void>}
 */
export async function feedPaper(mm = 5) {
    if (!bluetooth.getConnectionStatus()) {
        throw new Error('Printer not connected');
    }
    
    await bluetooth.write(buildFeedCommand(mmToDots(mm)));
}

/**
 * Send test print (simple pattern)
 * @returns {Promise<void>}
 */
export async function printTest() {
    if (!bluetooth.getConnectionStatus()) {
        throw new Error('Printer not connected');
    }
    
    // Create a simple test pattern
    const width = 384;
    const height = 50;
    const rowBytes = Math.ceil(width / 8);
    const bitmap = new Uint8Array(rowBytes * height);
    
    // Draw a border and diagonal pattern
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const byteIdx = y * rowBytes + Math.floor(x / 8);
            const bitIdx = 7 - (x % 8);
            
            // Border
            if (y < 2 || y >= height - 2 || x < 2 || x >= width - 2) {
                // Black pixel (0 in our format)
                continue;
            }
            
            // Diagonal pattern
            if ((x + y) % 8 < 4) {
                bitmap[byteIdx] |= (1 << bitIdx); // White
            }
        }
    }
    
    await printBitmap(bitmap, width, height);
}
