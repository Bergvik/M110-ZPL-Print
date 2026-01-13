/**
 * ZPL Renderer - Converts ZPL code to canvas bitmap
 * 
 * This is a basic ZPL interpreter supporting common commands.
 * For production use, consider using a full ZPL library or API.
 */

import { DPMM } from './utils.js';

// Font definitions (approximate sizes for ZPL fonts)
const FONTS = {
    '0': { name: 'Arial', style: 'normal' },
    'A': { name: 'Arial', style: 'normal' },
    'B': { name: 'Arial', style: 'normal' },
    'C': { name: 'Arial', style: 'normal' },
    'D': { name: 'Arial', style: 'normal' },
    'E': { name: 'Arial', style: 'normal' },
    'F': { name: 'Arial', style: 'normal' },
    'G': { name: 'Arial', style: 'normal' },
    'H': { name: 'Arial', style: 'normal' },
};

// Rotation mapping
const ROTATIONS = {
    'N': 0,    // Normal
    'R': 90,   // Rotated 90° clockwise
    'I': 180,  // Inverted (180°)
    'B': 270   // Bottom-up (270°)
};

/**
 * ZPL Renderer class
 */
export class ZPLRenderer {
    constructor() {
        this.reset();
    }
    
    /**
     * Reset renderer state
     */
    reset() {
        this.x = 0;
        this.y = 0;
        this.font = '0';
        this.fontHeight = 30;
        this.fontWidth = 30;
        this.rotation = 'N';
        this.fieldReversePrint = false;
        this.barcodeHeight = 100;
        this.barcodeModuleWidth = 2;
        this.barcodeWideToNarrow = 3;
        this.labelWidth = 320;
        this.labelHeight = 240;
    }
    
    /**
     * Render ZPL to canvas
     * @param {string} zpl - ZPL code
     * @param {number} widthPx - Label width in pixels
     * @param {number} heightPx - Label height in pixels
     * @returns {{ canvas: HTMLCanvasElement, errors: string[] }}
     */
    render(zpl, widthPx, heightPx) {
        this.reset();
        this.labelWidth = widthPx;
        this.labelHeight = heightPx;
        
        const canvas = document.createElement('canvas');
        canvas.width = widthPx;
        canvas.height = heightPx;
        
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, widthPx, heightPx);
        ctx.fillStyle = '#000000';
        
        const errors = [];
        const commands = this.parseZPL(zpl);
        
        for (const cmd of commands) {
            try {
                this.executeCommand(ctx, cmd);
            } catch (e) {
                errors.push(`Error in ${cmd.command}: ${e.message}`);
            }
        }
        
        return { canvas, errors };
    }
    
    /**
     * Parse ZPL into commands
     * @param {string} zpl - ZPL code
     * @returns {Array<{ command: string, params: string }>}
     */
    parseZPL(zpl) {
        const commands = [];
        // Match ^XX or ~XX commands with their parameters
        const regex = /[\^~]([A-Z]{1,2})([^^\~]*)/gi;
        let match;
        
        while ((match = regex.exec(zpl)) !== null) {
            commands.push({
                command: match[1].toUpperCase(),
                params: match[2].trim()
            });
        }
        
        return commands;
    }
    
    /**
     * Execute a single ZPL command
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {{ command: string, params: string }} cmd - Command object
     */
    executeCommand(ctx, cmd) {
        switch (cmd.command) {
            case 'XA': // Start format
                break;
                
            case 'XZ': // End format
                break;
                
            case 'FO': // Field Origin
                this.handleFieldOrigin(cmd.params);
                break;
                
            case 'FD': // Field Data
                this.handleFieldData(ctx, cmd.params);
                break;
                
            case 'FS': // Field Separator
                break;
                
            case 'A': // Scalable/Bitmapped Font
            case 'A0': // Font A0 (specifically)
                this.handleFont(cmd.params);
                break;
                
            case 'CF': // Change Alphanumeric Default Font
                this.handleChangeFont(cmd.params);
                break;
                
            case 'FB': // Field Block
                this.handleFieldBlock(cmd.params);
                break;
                
            case 'GB': // Graphic Box
                this.handleGraphicBox(ctx, cmd.params);
                break;
                
            case 'GF': // Graphic Field
                this.handleGraphicField(ctx, cmd.params);
                break;
                
            case 'BY': // Bar Code Field Default
                this.handleBarcodeDefaults(cmd.params);
                break;
                
            case 'BC': // Code 128 Bar Code
                this.handleBarcode128(ctx, cmd.params);
                break;
                
            case 'BQ': // QR Code
                this.handleQRCode(ctx, cmd.params);
                break;
                
            case 'FR': // Field Reverse Print
                this.fieldReversePrint = true;
                break;
                
            case 'LH': // Label Home
                this.handleLabelHome(cmd.params);
                break;
                
            case 'LL': // Label Length
                // Handled by label size selector
                break;
                
            case 'PW': // Print Width
                // Handled by label size selector
                break;
                
            case 'FW': // Field Orientation
                this.handleFieldOrientation(cmd.params);
                break;
                
            default:
                // Unknown command - ignore
                console.log(`Unknown ZPL command: ^${cmd.command}`);
        }
    }
    
    /**
     * Handle ^FO (Field Origin) command
     */
    handleFieldOrigin(params) {
        const parts = params.split(',');
        this.x = parseInt(parts[0]) || 0;
        this.y = parseInt(parts[1]) || 0;
        this.fieldReversePrint = false;
    }
    
    /**
     * Handle ^A (Font) command
     */
    handleFont(params) {
        // Format: ^Afo,h,w or ^A0N,h,w
        const match = params.match(/^([A-Z0-9])?([NRIB])?(?:,(\d+))?(?:,(\d+))?/i);
        if (match) {
            if (match[1]) this.font = match[1];
            if (match[2]) this.rotation = match[2].toUpperCase();
            if (match[3]) this.fontHeight = parseInt(match[3]);
            if (match[4]) this.fontWidth = parseInt(match[4]) || this.fontHeight;
        }
    }
    
    /**
     * Handle ^CF (Change Font) command
     */
    handleChangeFont(params) {
        const parts = params.split(',');
        if (parts[0]) this.font = parts[0];
        if (parts[1]) this.fontHeight = parseInt(parts[1]);
        if (parts[2]) this.fontWidth = parseInt(parts[2]);
    }
    
    /**
     * Handle ^FD (Field Data) command - render text
     */
    handleFieldData(ctx, params) {
        const text = params.replace(/\\&/g, '&').replace(/\\\\/g, '\\');
        
        ctx.save();
        
        // Set font
        const fontDef = FONTS[this.font] || FONTS['0'];
        ctx.font = `${fontDef.style} ${this.fontHeight}px ${fontDef.name}`;
        ctx.textBaseline = 'top';
        
        // Apply rotation
        const angle = ROTATIONS[this.rotation] || 0;
        if (angle !== 0) {
            ctx.translate(this.x, this.y);
            ctx.rotate((angle * Math.PI) / 180);
            ctx.translate(-this.x, -this.y);
        }
        
        // Draw text
        if (this.fieldReversePrint) {
            const metrics = ctx.measureText(text);
            const width = metrics.width;
            const height = this.fontHeight;
            ctx.fillStyle = '#000000';
            ctx.fillRect(this.x - 2, this.y - 2, width + 4, height + 4);
            ctx.fillStyle = '#ffffff';
        } else {
            ctx.fillStyle = '#000000';
        }
        
        ctx.fillText(text, this.x, this.y);
        ctx.restore();
        
        this.fieldReversePrint = false;
    }
    
    /**
     * Handle ^FB (Field Block) command
     */
    handleFieldBlock(params) {
        // For now, just store block width - full implementation would handle wrapping
        const parts = params.split(',');
        this.blockWidth = parseInt(parts[0]) || this.labelWidth;
    }
    
    /**
     * Handle ^GB (Graphic Box) command
     */
    handleGraphicBox(ctx, params) {
        const parts = params.split(',');
        const width = parseInt(parts[0]) || 1;
        const height = parseInt(parts[1]) || 1;
        const thickness = parseInt(parts[2]) || 1;
        const color = (parts[3] || 'B').toUpperCase();
        const rounding = parseInt(parts[4]) || 0;
        
        ctx.save();
        ctx.strokeStyle = color === 'W' ? '#ffffff' : '#000000';
        ctx.fillStyle = color === 'W' ? '#ffffff' : '#000000';
        ctx.lineWidth = thickness;
        
        if (rounding > 0) {
            const radius = Math.min(rounding, width / 2, height / 2);
            this.roundRect(ctx, this.x, this.y, width, height, radius);
            if (thickness >= Math.min(width, height) / 2) {
                ctx.fill();
            } else {
                ctx.stroke();
            }
        } else {
            if (thickness >= Math.min(width, height) / 2) {
                ctx.fillRect(this.x, this.y, width, height);
            } else {
                ctx.strokeRect(
                    this.x + thickness / 2,
                    this.y + thickness / 2,
                    width - thickness,
                    height - thickness
                );
            }
        }
        
        ctx.restore();
    }
    
    /**
     * Draw rounded rectangle
     */
    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
    
    /**
     * Handle ^GF (Graphic Field) command
     */
    handleGraphicField(ctx, params) {
        // Format: ^GFa,b,c,d,data
        const match = params.match(/^([ABH]),(\d+),(\d+),(\d+),(.+)/is);
        if (!match) return;
        
        const format = match[1].toUpperCase();
        const totalBytes = parseInt(match[2]);
        const rowBytes = parseInt(match[4]);
        const data = match[5];
        
        const height = Math.ceil(totalBytes / rowBytes);
        const width = rowBytes * 8;
        
        let bytes;
        if (format === 'A') {
            // ASCII hex
            bytes = this.hexToBytes(data);
        } else if (format === 'B') {
            // Binary
            bytes = new Uint8Array(data.split('').map(c => c.charCodeAt(0)));
        } else if (format === 'H') {
            // Hex with compression
            bytes = this.decodeCompressedHex(data, totalBytes);
        }
        
        if (!bytes) return;
        
        // Draw bitmap
        const imageData = ctx.createImageData(width, height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const byteIdx = y * rowBytes + Math.floor(x / 8);
                const bitIdx = 7 - (x % 8);
                const isBlack = byteIdx < bytes.length && !((bytes[byteIdx] >> bitIdx) & 1);
                
                const pixelIdx = (y * width + x) * 4;
                const color = isBlack ? 0 : 255;
                imageData.data[pixelIdx] = color;
                imageData.data[pixelIdx + 1] = color;
                imageData.data[pixelIdx + 2] = color;
                imageData.data[pixelIdx + 3] = 255;
            }
        }
        
        ctx.putImageData(imageData, this.x, this.y);
    }
    
    /**
     * Convert hex string to bytes
     */
    hexToBytes(hex) {
        const clean = hex.replace(/\s/g, '');
        const bytes = new Uint8Array(clean.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
        }
        return bytes;
    }
    
    /**
     * Decode compressed hex (ZPL compression)
     */
    decodeCompressedHex(data, totalBytes) {
        // Basic implementation - handles common compression
        const bytes = new Uint8Array(totalBytes);
        let byteIdx = 0;
        let i = 0;
        
        while (i < data.length && byteIdx < totalBytes) {
            const char = data[i];
            
            if (char >= 'G' && char <= 'Y') {
                // Repeat count (G=1, H=2, ..., Y=19)
                const count = char.charCodeAt(0) - 'F'.charCodeAt(0);
                const hexChar = data[i + 1] || '0';
                const nibble = parseInt(hexChar, 16);
                const byte = (nibble << 4) | nibble;
                for (let j = 0; j < count && byteIdx < totalBytes; j++) {
                    bytes[byteIdx++] = byte;
                }
                i += 2;
            } else if (char >= 'g' && char <= 'z') {
                // Repeat count * 20
                const count = (char.charCodeAt(0) - 'f'.charCodeAt(0)) * 20;
                const hexChar = data[i + 1] || '0';
                const nibble = parseInt(hexChar, 16);
                const byte = (nibble << 4) | nibble;
                for (let j = 0; j < count && byteIdx < totalBytes; j++) {
                    bytes[byteIdx++] = byte;
                }
                i += 2;
            } else if (/[0-9A-Fa-f]/.test(char)) {
                // Regular hex pair
                const hex = data.substr(i, 2);
                bytes[byteIdx++] = parseInt(hex, 16) || 0;
                i += 2;
            } else {
                i++;
            }
        }
        
        return bytes;
    }
    
    /**
     * Handle ^BY (Barcode Defaults) command
     */
    handleBarcodeDefaults(params) {
        const parts = params.split(',');
        if (parts[0]) this.barcodeModuleWidth = parseInt(parts[0]);
        if (parts[1]) this.barcodeWideToNarrow = parseFloat(parts[1]);
        if (parts[2]) this.barcodeHeight = parseInt(parts[2]);
    }
    
    /**
     * Handle ^BC (Code 128 Barcode) command
     */
    handleBarcode128(ctx, params) {
        const parts = params.split(',');
        const orientation = parts[0] || 'N';
        const height = parseInt(parts[1]) || this.barcodeHeight;
        const printText = (parts[2] || 'Y').toUpperCase() === 'Y';
        const textAbove = (parts[3] || 'N').toUpperCase() === 'Y';
        
        // Get the data from the next FD command - for now use placeholder
        // This is handled by the field data following the barcode command
        this.pendingBarcode = {
            type: '128',
            orientation,
            height,
            printText,
            textAbove,
            x: this.x,
            y: this.y
        };
    }
    
    /**
     * Handle ^BQ (QR Code) command
     */
    handleQRCode(ctx, params) {
        const parts = params.split(',');
        const orientation = parts[0] || 'N';
        const model = parseInt(parts[1]) || 2;
        const magnification = parseInt(parts[2]) || 3;
        
        this.pendingBarcode = {
            type: 'QR',
            orientation,
            model,
            magnification,
            x: this.x,
            y: this.y
        };
    }
    
    /**
     * Handle ^LH (Label Home) command
     */
    handleLabelHome(params) {
        const parts = params.split(',');
        this.labelHomeX = parseInt(parts[0]) || 0;
        this.labelHomeY = parseInt(parts[1]) || 0;
    }
    
    /**
     * Handle ^FW (Field Orientation) command
     */
    handleFieldOrientation(params) {
        if (params.length > 0) {
            this.rotation = params[0].toUpperCase();
        }
    }
    
    /**
     * Draw a simple Code 128 barcode (simplified)
     */
    drawBarcode128(ctx, data, x, y, height, moduleWidth, printText) {
        // Simplified Code 128 rendering
        // In production, use a proper barcode library
        
        const patterns = this.getCode128Patterns(data);
        let currentX = x;
        
        ctx.fillStyle = '#000000';
        
        for (const pattern of patterns) {
            for (let i = 0; i < pattern.length; i++) {
                if (pattern[i] === '1') {
                    ctx.fillRect(currentX, y, moduleWidth, height);
                }
                currentX += moduleWidth;
            }
        }
        
        if (printText) {
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(data, x + (currentX - x) / 2, y + height + 12);
        }
    }
    
    /**
     * Get Code 128 patterns (simplified - subset B only)
     */
    getCode128Patterns(data) {
        // Start Code B pattern
        const patterns = ['11010010000'];
        
        // Character patterns for Code 128B (simplified subset)
        const code128B = {
            ' ': '11011001100', '!': '11001101100', '"': '11001100110',
            '#': '10010011000', '$': '10010001100', '%': '10001001100',
            '&': '10011001000', "'": '10011000100', '(': '10001100100',
            ')': '11001001000', '*': '11001000100', '+': '11000100100',
            ',': '10110011100', '-': '10011011100', '.': '10011001110',
            '/': '10111001100', '0': '10011101100', '1': '10011100110',
            '2': '11001110010', '3': '11001011100', '4': '11001001110',
            '5': '11011100100', '6': '11001110100', '7': '11101101110',
            '8': '11101001100', '9': '11100101100', ':': '11100100110',
            ';': '11101100100', '<': '11100110100', '=': '11100110010',
            '>': '11011011000', '?': '11011000110', '@': '11000110110',
            'A': '10100011000', 'B': '10001011000', 'C': '10001000110',
            'D': '10110001000', 'E': '10001101000', 'F': '10001100010',
            'G': '11010001000', 'H': '11000101000', 'I': '11000100010',
            'J': '10110111000', 'K': '10110001110', 'L': '10001101110',
            'M': '10111011000', 'N': '10111000110', 'O': '10001110110',
            'P': '11101110110', 'Q': '11010001110', 'R': '11000101110',
            'S': '11011101000', 'T': '11011100010', 'U': '11011101110',
            'V': '11101011000', 'W': '11101000110', 'X': '11100010110',
            'Y': '11101101000', 'Z': '11101100010'
        };
        
        for (const char of data) {
            if (code128B[char]) {
                patterns.push(code128B[char]);
            }
        }
        
        // Stop pattern
        patterns.push('1100011101011');
        
        return patterns;
    }
}

// Export singleton instance
export const zplRenderer = new ZPLRenderer();
