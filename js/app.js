/**
 * ZPL Label Printer - Main Application
 * 
 * Coordinates ZPL rendering, preview display, and printing.
 */

import * as bluetooth from './bluetooth.js';
import * as printer from './printer.js';
import { zplRenderer } from './zpl-renderer.js';
import {
    mmToPixels,
    validateLabelSize,
    toMonochromeBitmap,
    debounce,
    isWebBluetoothSupported,
    MAX_WIDTH_PX
} from './utils.js';

// ===========================================
// DOM Elements
// ===========================================

const elements = {
    // Connection
    connectBtn: document.getElementById('connectBtn'),
    connectBtnText: document.getElementById('connectBtnText'),
    connectionStatus: document.getElementById('connectionStatus'),
    
    // Label size
    presetSelect: document.getElementById('presetSelect'),
    widthInput: document.getElementById('widthInput'),
    heightInput: document.getElementById('heightInput'),
    customSizeInputs: document.getElementById('customSizeInputs'),
    sizeInfo: document.getElementById('sizeInfo'),
    
    // ZPL
    zplInput: document.getElementById('zplInput'),
    clearZplBtn: document.getElementById('clearZplBtn'),
    pasteZplBtn: document.getElementById('pasteZplBtn'),
    
    // Preview
    previewContainer: document.getElementById('previewContainer'),
    previewPlaceholder: document.getElementById('previewPlaceholder'),
    previewCanvas: document.getElementById('previewCanvas'),
    previewError: document.getElementById('previewError'),
    
    // Print
    copiesInput: document.getElementById('copiesInput'),
    printBtn: document.getElementById('printBtn'),
    printStatus: document.getElementById('printStatus'),
    
    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    toastClose: document.getElementById('toastClose')
};

// ===========================================
// State
// ===========================================

const state = {
    labelWidth: 40,
    labelHeight: 30,
    zpl: '',
    currentBitmap: null,
    isPrinting: false
};

// Label presets (mm)
const PRESETS = {
    '40x30': { width: 40, height: 30 },
    '30x15': { width: 30, height: 15 },
    '50x30': { width: 50, height: 30 },
    '40x20': { width: 40, height: 20 }
};

// ===========================================
// Initialization
// ===========================================

function init() {
    // Check Web Bluetooth support
    if (!isWebBluetoothSupported()) {
        showToast('Web Bluetooth is not supported in this browser. Please use Chrome on Android.', 'error');
        elements.connectBtn.disabled = true;
        return;
    }
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize UI
    updateSizeInfo();
    updatePrintButton();
    
    // Set up Bluetooth event handlers
    bluetooth.addEventListener('connected', handleConnected);
    bluetooth.addEventListener('disconnected', handleDisconnected);
    bluetooth.addEventListener('error', handleBluetoothError);
    
    console.log('ZPL Label Printer initialized');
}

function setupEventListeners() {
    // Connect button
    elements.connectBtn.addEventListener('click', handleConnect);
    
    // Label size
    elements.presetSelect.addEventListener('change', handlePresetChange);
    elements.widthInput.addEventListener('input', handleSizeInputChange);
    elements.heightInput.addEventListener('input', handleSizeInputChange);
    
    // ZPL input with debounced preview
    elements.zplInput.addEventListener('input', debounce(handleZplInput, 300));
    elements.clearZplBtn.addEventListener('click', handleClearZpl);
    elements.pasteZplBtn.addEventListener('click', handlePasteZpl);
    
    // Print
    elements.printBtn.addEventListener('click', handlePrint);
    
    // Toast
    elements.toastClose.addEventListener('click', hideToast);
}

// ===========================================
// Connection Handlers
// ===========================================

async function handleConnect() {
    if (bluetooth.getConnectionStatus()) {
        bluetooth.disconnect();
        return;
    }
    
    elements.connectBtn.disabled = true;
    elements.connectBtnText.textContent = 'Connecting...';
    
    try {
        await bluetooth.connect();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        elements.connectBtn.disabled = false;
    }
}

function handleConnected(event) {
    elements.connectionStatus.classList.add('connected');
    elements.connectionStatus.querySelector('.status-text').textContent = 
        event.name || 'Connected';
    elements.connectBtnText.textContent = 'Disconnect';
    updatePrintButton();
    showToast(`Connected to ${event.name}`, 'success');
}

function handleDisconnected() {
    elements.connectionStatus.classList.remove('connected');
    elements.connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
    elements.connectBtnText.textContent = 'Connect Printer';
    updatePrintButton();
}

function handleBluetoothError(event) {
    showToast(event.message, 'error');
}

// ===========================================
// Label Size Handlers
// ===========================================

function handlePresetChange() {
    const preset = elements.presetSelect.value;
    
    if (preset === 'custom') {
        elements.customSizeInputs.style.display = 'flex';
    } else {
        elements.customSizeInputs.style.display = 'none';
        
        if (PRESETS[preset]) {
            state.labelWidth = PRESETS[preset].width;
            state.labelHeight = PRESETS[preset].height;
            elements.widthInput.value = state.labelWidth;
            elements.heightInput.value = state.labelHeight;
        }
    }
    
    updateSizeInfo();
    renderPreview();
}

function handleSizeInputChange() {
    state.labelWidth = parseFloat(elements.widthInput.value) || 40;
    state.labelHeight = parseFloat(elements.heightInput.value) || 30;
    
    updateSizeInfo();
    renderPreview();
}

function updateSizeInfo() {
    const validation = validateLabelSize(state.labelWidth, state.labelHeight);
    const sizePixels = elements.sizeInfo.querySelector('.size-pixels');
    
    if (validation.valid) {
        sizePixels.textContent = `${validation.widthPx} × ${validation.heightPx} px`;
        sizePixels.style.color = '';
    } else {
        sizePixels.textContent = validation.error;
        sizePixels.style.color = 'var(--error)';
    }
}

// ===========================================
// ZPL Handlers
// ===========================================

function handleZplInput() {
    state.zpl = elements.zplInput.value;
    renderPreview();
}

function handleClearZpl() {
    elements.zplInput.value = '';
    state.zpl = '';
    state.currentBitmap = null;
    hidePreview();
    updatePrintButton();
}

async function handlePasteZpl() {
    try {
        const text = await navigator.clipboard.readText();
        elements.zplInput.value = text;
        state.zpl = text;
        renderPreview();
    } catch (error) {
        showToast('Unable to paste from clipboard', 'error');
    }
}

// ===========================================
// Preview Rendering
// ===========================================

function renderPreview() {
    const zpl = state.zpl.trim();
    
    // Hide previous errors
    hidePreviewError();
    
    if (!zpl) {
        hidePreview();
        state.currentBitmap = null;
        updatePrintButton();
        return;
    }
    
    // Validate label size
    const validation = validateLabelSize(state.labelWidth, state.labelHeight);
    if (!validation.valid) {
        showPreviewError(validation.error);
        state.currentBitmap = null;
        updatePrintButton();
        return;
    }
    
    try {
        // Render ZPL to canvas
        const { canvas, errors } = zplRenderer.render(zpl, validation.widthPx, validation.heightPx);
        
        if (errors.length > 0) {
            console.warn('ZPL render warnings:', errors);
        }
        
        // Get image data and convert to monochrome
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        state.currentBitmap = {
            data: toMonochromeBitmap(imageData, true),
            width: canvas.width,
            height: canvas.height
        };
        
        // Show preview (display the rendered canvas, not the 1-bit version for better viewing)
        showPreview(canvas);
        updatePrintButton();
        
    } catch (error) {
        console.error('ZPL render error:', error);
        showPreviewError(`Render failed: ${error.message}`);
        state.currentBitmap = null;
        updatePrintButton();
    }
}

function showPreview(canvas) {
    // Copy rendered content to preview canvas
    elements.previewCanvas.width = canvas.width;
    elements.previewCanvas.height = canvas.height;
    
    const ctx = elements.previewCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    
    elements.previewPlaceholder.classList.add('hidden');
    elements.previewCanvas.classList.add('visible');
}

function hidePreview() {
    elements.previewPlaceholder.classList.remove('hidden');
    elements.previewCanvas.classList.remove('visible');
}

function showPreviewError(message) {
    elements.previewError.textContent = message;
    elements.previewError.classList.add('visible');
}

function hidePreviewError() {
    elements.previewError.classList.remove('visible');
    elements.previewError.textContent = '';
}

// ===========================================
// Print Handlers
// ===========================================

function updatePrintButton() {
    const canPrint = bluetooth.getConnectionStatus() && 
                     state.currentBitmap !== null && 
                     !state.isPrinting;
    elements.printBtn.disabled = !canPrint;
}

async function handlePrint() {
    if (!state.currentBitmap) {
        showToast('Nothing to print. Enter ZPL code first.', 'error');
        return;
    }
    
    if (!bluetooth.getConnectionStatus()) {
        showToast('Printer not connected.', 'error');
        return;
    }
    
    const copies = Math.max(1, parseInt(elements.copiesInput.value) || 1);
    
    state.isPrinting = true;
    updatePrintButton();
    elements.printBtn.classList.add('printing');
    
    try {
        if (copies === 1) {
            updatePrintStatus('Printing...', 'printing');
            
            await printer.printBitmap(
                state.currentBitmap.data,
                state.currentBitmap.width,
                state.currentBitmap.height,
                (progress) => {
                    const percent = Math.round(progress * 100);
                    updatePrintStatus(`Printing... ${percent}%`, 'printing');
                }
            );
            
            updatePrintStatus('Done!', 'success');
            showToast('Label printed successfully!', 'success');
        } else {
            await printer.printMultiple(
                state.currentBitmap.data,
                state.currentBitmap.width,
                state.currentBitmap.height,
                copies,
                (current, total, progress) => {
                    const percent = Math.round(progress * 100);
                    updatePrintStatus(`Printing ${current}/${total}... ${percent}%`, 'printing');
                }
            );
            
            updatePrintStatus(`Done! (${copies} copies)`, 'success');
            showToast(`${copies} labels printed successfully!`, 'success');
        }
        
    } catch (error) {
        console.error('Print error:', error);
        updatePrintStatus('Print failed', 'error');
        showToast(error.message, 'error');
    } finally {
        state.isPrinting = false;
        updatePrintButton();
        elements.printBtn.classList.remove('printing');
        
        // Clear status after delay
        setTimeout(() => {
            if (!state.isPrinting) {
                updatePrintStatus('', '');
            }
        }, 3000);
    }
}

function updatePrintStatus(text, type) {
    elements.printStatus.textContent = text;
    elements.printStatus.className = 'print-status';
    if (type) {
        elements.printStatus.classList.add(type);
    }
}

// ===========================================
// Toast Notifications
// ===========================================

let toastTimeout = null;

function showToast(message, type = 'error') {
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    
    elements.toastMessage.textContent = message;
    elements.toast.className = 'toast visible';
    if (type === 'success') {
        elements.toast.classList.add('success');
    }
    
    toastTimeout = setTimeout(hideToast, 5000);
}

function hideToast() {
    elements.toast.classList.remove('visible');
    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }
}

// ===========================================
// Start Application
// ===========================================

document.addEventListener('DOMContentLoaded', init);
