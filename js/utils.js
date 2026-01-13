/**
 * Utility functions for the ZPL Label Printer app
 */

// Constants
export const DPMM = 8; // 203 DPI ≈ 8 dots per mm
export const MAX_WIDTH_PX = 384; // Max printable width in pixels
export const MIN_WIDTH_MM = 20;
export const MAX_WIDTH_MM = 48;

/**
 * Convert millimeters to pixels at 8 dpmm (203 DPI)
 * @param {number} mm - Size in millimeters
 * @returns {number} Size in pixels
 */
export function mmToPixels(mm) {
    return Math.round(mm * DPMM);
}

/**
 * Convert pixels to millimeters at 8 dpmm (203 DPI)
 * @param {number} px - Size in pixels
 * @returns {number} Size in millimeters
 */
export function pixelsToMm(px) {
    return px / DPMM;
}

/**
 * Validate label dimensions
 * @param {number} widthMm - Width in millimeters
 * @param {number} heightMm - Height in millimeters
 * @returns {{ valid: boolean, error?: string, widthPx?: number, heightPx?: number }}
 */
export function validateLabelSize(widthMm, heightMm) {
    if (widthMm < MIN_WIDTH_MM) {
        return { valid: false, error: `Width must be at least ${MIN_WIDTH_MM}mm` };
    }
    
    if (widthMm > MAX_WIDTH_MM) {
        return { valid: false, error: `Width cannot exceed ${MAX_WIDTH_MM}mm` };
    }
    
    if (heightMm <= 0) {
        return { valid: false, error: 'Height must be greater than 0' };
    }
    
    const widthPx = mmToPixels(widthMm);
    const heightPx = mmToPixels(heightMm);
    
    if (widthPx > MAX_WIDTH_PX) {
        return { valid: false, error: `Width exceeds maximum printable width (${MAX_WIDTH_PX}px)` };
    }
    
    return { valid: true, widthPx, heightPx };
}

/**
 * Convert canvas image data to 1-bit monochrome bitmap
 * Uses Floyd-Steinberg dithering for better quality
 * @param {ImageData} imageData - Canvas image data
 * @param {boolean} dither - Whether to apply dithering
 * @returns {Uint8Array} 1-bit packed bitmap (8 pixels per byte)
 */
export function toMonochromeBitmap(imageData, dither = true) {
    const { width, height, data } = imageData;
    
    // Convert to grayscale first
    const grayscale = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        // Luminance formula
        grayscale[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
    
    // Apply Floyd-Steinberg dithering if enabled
    if (dither) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const oldPixel = grayscale[idx];
                const newPixel = oldPixel < 128 ? 0 : 255;
                grayscale[idx] = newPixel;
                const error = oldPixel - newPixel;
                
                if (x + 1 < width) {
                    grayscale[idx + 1] += error * 7 / 16;
                }
                if (y + 1 < height) {
                    if (x > 0) {
                        grayscale[(y + 1) * width + (x - 1)] += error * 3 / 16;
                    }
                    grayscale[(y + 1) * width + x] += error * 5 / 16;
                    if (x + 1 < width) {
                        grayscale[(y + 1) * width + (x + 1)] += error * 1 / 16;
                    }
                }
            }
        }
    }
    
    // Pack into 1-bit bitmap (MSB first, 0 = black, 1 = white)
    const rowBytes = Math.ceil(width / 8);
    const bitmap = new Uint8Array(rowBytes * height);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const byteIdx = y * rowBytes + Math.floor(x / 8);
            const bitIdx = 7 - (x % 8);
            
            // White pixel = 1, Black pixel = 0
            if (grayscale[idx] >= 128) {
                bitmap[byteIdx] |= (1 << bitIdx);
            }
        }
    }
    
    return bitmap;
}

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce a function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Check if Web Bluetooth is supported
 * @returns {boolean}
 */
export function isWebBluetoothSupported() {
    return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
}
