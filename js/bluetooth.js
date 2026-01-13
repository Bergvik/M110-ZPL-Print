/**
 * Web Bluetooth connection manager for Phomemo M110 printer
 * 
 * Based on the protocol used by transcriptionstream/phomymo
 */

// Phomemo printer Bluetooth UUIDs (various models use different UUIDs)
const SERVICE_UUIDS = [
    '0000ff00-0000-1000-8000-00805f9b34fb',  // M110, M120, M02 series
    '0000ae30-0000-1000-8000-00805f9b34fb',  // Some M110 variants
    '0000fee7-0000-1000-8000-00805f9b34fb',  // M02 Pro, some newer models
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',  // Generic serial service
];

// Write characteristic UUIDs to try (in order)
const WRITE_CHAR_UUIDS = [
    '0000ff02-0000-1000-8000-00805f9b34fb',  // Primary
    '0000ae01-0000-1000-8000-00805f9b34fb',  // Alt 1
    '0000ae10-0000-1000-8000-00805f9b34fb',  // Alt 2 (some D-series)
    '49535343-8841-43f4-a8d4-ecbe34729bb3',  // Generic serial TX
];

// Connection state
let device = null;
let server = null;
let writeCharacteristic = null;
let isConnected = false;

// Event callbacks
const listeners = {
    connected: [],
    disconnected: [],
    error: []
};

/**
 * Add event listener
 * @param {'connected'|'disconnected'|'error'} event 
 * @param {Function} callback 
 */
export function addEventListener(event, callback) {
    if (listeners[event]) {
        listeners[event].push(callback);
    }
}

/**
 * Remove event listener
 * @param {'connected'|'disconnected'|'error'} event 
 * @param {Function} callback 
 */
export function removeEventListener(event, callback) {
    if (listeners[event]) {
        listeners[event] = listeners[event].filter(cb => cb !== callback);
    }
}

/**
 * Emit event to listeners
 * @param {'connected'|'disconnected'|'error'} event 
 * @param {*} data 
 */
function emit(event, data) {
    if (listeners[event]) {
        listeners[event].forEach(cb => cb(data));
    }
}

/**
 * Check if currently connected to a printer
 * @returns {boolean}
 */
export function getConnectionStatus() {
    return isConnected && device?.gatt?.connected;
}

/**
 * Get connected device name
 * @returns {string|null}
 */
export function getDeviceName() {
    return device?.name || null;
}

/**
 * Request a Bluetooth device with name filters first, then fall back to acceptAllDevices
 * This mimics the phomymo behavior where some printers have non-standard names
 * @returns {Promise<BluetoothDevice>}
 */
async function requestDevice() {
    // First try with name filters (faster if printer has standard name)
    console.log('Showing device picker...');
    try {
        return await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'M110' },
                { namePrefix: 'M120' },
                { namePrefix: 'M220' },
                { namePrefix: 'M02' },
                { namePrefix: 'M03' },
                { namePrefix: 'M04' },
                { namePrefix: 'Phomemo' },
                { namePrefix: 'D30' },
                { namePrefix: 'D35' },
                { namePrefix: 'Q30' },
                { services: [SERVICE_UUIDS[0]] }
            ],
            optionalServices: SERVICE_UUIDS
        });
    } catch (e) {
        // If user cancelled or no devices found, try acceptAllDevices
        // Phomemo printers often have serial numbers as names (e.g., Q199E47B0605189)
        console.log('Name filter failed, trying acceptAllDevices:', e.message);
        
        return await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: SERVICE_UUIDS
        });
    }
}

/**
 * Connect to a Phomemo M110 printer
 * Must be called from a user gesture (click/tap)
 * @returns {Promise<boolean>}
 */
export async function connect() {
    try {
        // Request device - first try with filters, then fallback to acceptAllDevices
        device = await requestDevice();

        if (!device) {
            throw new Error('No device selected');
        }

        console.log('Selected:', device.name);

        // Listen for disconnection
        device.addEventListener('gattserverdisconnected', handleDisconnect);

        // Connect to GATT server
        console.log('Connecting GATT...');
        server = await device.gatt.connect();

        // Try each service UUID until one works
        let service = null;
        console.log('Getting service...');
        
        for (const serviceUuid of SERVICE_UUIDS) {
            try {
                service = await server.getPrimaryService(serviceUuid);
                console.log(`Found service: ${serviceUuid}`);
                break;
            } catch (e) {
                // Service not found, try next
            }
        }
        
        if (!service) {
            throw new Error('Printer service not found. Make sure this is a compatible Phomemo printer.');
        }

        // Try each write characteristic UUID until one works
        console.log('Getting characteristics...');
        
        for (const charUuid of WRITE_CHAR_UUIDS) {
            try {
                writeCharacteristic = await service.getCharacteristic(charUuid);
                console.log(`Found characteristic: ${charUuid}`);
                break;
            } catch (e) {
                // Characteristic not found, try next
            }
        }
        
        if (!writeCharacteristic) {
            throw new Error('Write characteristic not found. Printer may not be compatible.');
        }

        isConnected = true;
        console.log(`Connected to ${device.name}`);
        emit('connected', { name: device.name });

        return true;

    } catch (error) {
        console.error('Bluetooth connection error:', error);
        isConnected = false;
        writeCharacteristic = null;
        
        let message = error.message;
        if (error.name === 'NotFoundError') {
            message = 'No printer found. Make sure it\'s powered on and in range.';
        } else if (error.name === 'SecurityError') {
            message = 'Bluetooth permission denied.';
        } else if (error.name === 'NotSupportedError') {
            message = 'Web Bluetooth is not supported on this browser.';
        }
        
        emit('error', { message });
        throw new Error(message);
    }
}

/**
 * Disconnect from the printer
 */
export function disconnect() {
    if (device?.gatt?.connected) {
        device.gatt.disconnect();
    }
    handleDisconnect();
}

/**
 * Handle disconnection event
 */
function handleDisconnect() {
    isConnected = false;
    writeCharacteristic = null;
    console.log('Printer disconnected');
    emit('disconnected', {});
}

/**
 * Write data to the printer
 * Handles MTU chunking automatically
 * @param {Uint8Array} data - Data to write
 * @param {number} [chunkSize=100] - Maximum bytes per write (MTU safe)
 * @param {number} [delayMs=20] - Delay between chunks in ms
 * @returns {Promise<void>}
 */
export async function write(data, chunkSize = 100, delayMs = 20) {
    if (!writeCharacteristic) {
        throw new Error('Not connected to printer');
    }

    const totalChunks = Math.ceil(data.length / chunkSize);
    if (totalChunks > 1) {
        console.log(`[BLE >>>] Writing ${data.length} bytes in ${totalChunks} chunks (${chunkSize} bytes/chunk)`);
    }

    // Send in chunks to respect BLE MTU
    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
        
        try {
            await writeCharacteristic.writeValueWithoutResponse(chunk);
            if (totalChunks > 1 && (i === 0 || i + chunkSize >= data.length)) {
                console.log(`[BLE >>>] Chunk ${Math.floor(i/chunkSize) + 1}/${totalChunks}: ${chunk.length} bytes`);
            }
        } catch (error) {
            console.warn(`[BLE >>>] writeValueWithoutResponse failed, trying with response:`, error.message);
            // Try with response if without response fails
            try {
                await writeCharacteristic.writeValue(chunk);
            } catch (e2) {
                console.error(`[BLE >>>] Write failed at byte ${i}:`, e2);
                throw new Error(`Write failed at byte ${i}: ${e2.message}`);
            }
        }

        // Small delay between chunks for printer processing
        if (i + chunkSize < data.length && delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    
    if (totalChunks > 1) {
        console.log(`[BLE >>>] ✓ All ${totalChunks} chunks sent`);
    }
}

/**
 * Check if write characteristic supports writeValueWithoutResponse
 * @returns {boolean}
 */
export function supportsWriteWithoutResponse() {
    return writeCharacteristic?.properties?.writeWithoutResponse ?? false;
}
