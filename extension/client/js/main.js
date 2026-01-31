/**
 * AutoClipper - Main Entry Point
 * Initializes the CEP panel and connects to Premiere Pro
 */

// CSInterface instance
let csInterface = null;

// Global state for ExtendScript
let hostScriptLoaded = false;
let hostScriptPath = '';

/**
 * Initialize the extension
 */
function init() {
    // Initialize CSInterface if available (running in Premiere)
    if (typeof CSInterface !== 'undefined') {
        csInterface = new CSInterface();

        // Set up theme
        updateTheme();
        csInterface.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, updateTheme);

        // Load host script with robust path handling
        loadHostScript();

        console.log('AutoClipper initialized in Premiere Pro');
    } else {
        console.log('AutoClipper running in standalone mode (for development)');
        hostScriptLoaded = false;
    }

    // Initialize UI controller
    UIController.init();

    // Check server connection
    checkServerConnection();
}

/**
 * Load ExtendScript host with multiple fallback methods
 */
function loadHostScript() {
    const extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
    hostScriptPath = extensionPath + '/host/index.jsx';

    console.log('[AutoClipper] Extension path:', extensionPath);
    console.log('[AutoClipper] Host script path:', hostScriptPath);

    // Try multiple methods to load the script
    tryLoadMethod1();
}

/**
 * Method 1: Forward slashes (works on most systems)
 */
function tryLoadMethod1() {
    const pathForward = hostScriptPath.replace(/\\/g, '/');
    console.log('[AutoClipper] Method 1 - Forward slashes:', pathForward);

    csInterface.evalScript(`$.evalFile("${pathForward}")`, (result) => {
        console.log('[AutoClipper] Method 1 result:', result);
        verifyScriptLoaded((loaded) => {
            if (loaded) {
                console.log('[AutoClipper] ✓ Method 1 succeeded');
                onHostScriptLoaded();
            } else {
                console.log('[AutoClipper] Method 1 failed, trying Method 2...');
                tryLoadMethod2();
            }
        });
    });
}

/**
 * Method 2: Double backslashes (Windows escape)
 */
function tryLoadMethod2() {
    const pathEscaped = hostScriptPath.replace(/\\/g, '\\\\');
    console.log('[AutoClipper] Method 2 - Escaped backslashes:', pathEscaped);

    csInterface.evalScript(`$.evalFile("${pathEscaped}")`, (result) => {
        console.log('[AutoClipper] Method 2 result:', result);
        verifyScriptLoaded((loaded) => {
            if (loaded) {
                console.log('[AutoClipper] ✓ Method 2 succeeded');
                onHostScriptLoaded();
            } else {
                console.log('[AutoClipper] Method 2 failed, trying Method 3...');
                tryLoadMethod3();
            }
        });
    });
}

/**
 * Method 3: File URI protocol
 */
function tryLoadMethod3() {
    // Convert to file:// URI
    let fileUri = 'file:///' + hostScriptPath.replace(/\\/g, '/');
    // Encode special characters but not slashes
    fileUri = fileUri.replace(/ /g, '%20');
    console.log('[AutoClipper] Method 3 - File URI:', fileUri);

    csInterface.evalScript(`$.evalFile("${fileUri}")`, (result) => {
        console.log('[AutoClipper] Method 3 result:', result);
        verifyScriptLoaded((loaded) => {
            if (loaded) {
                console.log('[AutoClipper] ✓ Method 3 succeeded');
                onHostScriptLoaded();
            } else {
                console.log('[AutoClipper] All methods failed');
                onHostScriptFailed();
            }
        });
    });
}

/**
 * Verify script is actually loaded by calling test function
 */
function verifyScriptLoaded(callback) {
    csInterface.evalScript('testExtendScript()', (result) => {
        const loaded = result && result.includes && result.includes('ExtendScript OK');
        callback(loaded);
    });
}

/**
 * Called when host script loads successfully
 */
function onHostScriptLoaded() {
    hostScriptLoaded = true;
    console.log('[AutoClipper] ✓ ExtendScript loaded and verified');
    updateDebugStatus(true, 'Cargado');

    // Enable QE DOM for playback control
    csInterface.evalScript('app.enableQE()', (result) => {
        console.log('[AutoClipper] QE DOM enabled:', result);
    });
}

/**
 * Called when host script fails to load
 */
function onHostScriptFailed() {
    hostScriptLoaded = false;
    console.error('[AutoClipper] ✗ ExtendScript failed to load');
    console.error('[AutoClipper] Attempted path:', hostScriptPath);
    updateDebugStatus(false, 'Error: No se pudo cargar');

    // Show error to user
    if (typeof UIController !== 'undefined' && UIController.showHostScriptError) {
        UIController.showHostScriptError(hostScriptPath);
    }
}

/**
 * Update debug panel status
 */
function updateDebugStatus(loaded, message) {
    const statusEl = document.getElementById('jsx-status');
    const pathEl = document.getElementById('jsx-path');
    const indicatorEl = document.getElementById('debug-status');

    if (statusEl) {
        statusEl.textContent = loaded ? '✓ ' + message : '✗ ' + message;
        statusEl.style.color = loaded ? '#4ade80' : '#f87171';
    }
    if (pathEl) {
        pathEl.textContent = hostScriptPath;
        pathEl.style.fontSize = '10px';
        pathEl.style.wordBreak = 'break-all';
    }
    if (indicatorEl) {
        indicatorEl.style.color = loaded ? '#4ade80' : '#f87171';
    }
}

/**
 * Check if host script is loaded (for other modules to use)
 */
function isHostScriptLoaded() {
    return hostScriptLoaded;
}

/**
 * Update panel theme to match Premiere
 */
function updateTheme() {
    if (!csInterface) return;

    const hostEnv = csInterface.getHostEnvironment();
    const skinInfo = hostEnv.appSkinInfo;

    // Update CSS custom properties based on Premiere theme
    const root = document.documentElement;
    const bgColor = skinInfo.panelBackgroundColor.color;

    // Determine if dark or light theme
    const brightness = (bgColor.red + bgColor.green + bgColor.blue) / 3;

    if (brightness < 128) {
        // Dark theme
        root.style.setProperty('--bg-primary', toHex(bgColor));
        root.style.setProperty('--bg-secondary', lighten(bgColor, 10));
        root.style.setProperty('--bg-tertiary', lighten(bgColor, 20));
    } else {
        // Light theme (rare but possible)
        root.style.setProperty('--bg-primary', toHex(bgColor));
        root.style.setProperty('--bg-secondary', darken(bgColor, 5));
        root.style.setProperty('--bg-tertiary', darken(bgColor, 10));
    }
}

/**
 * Convert color object to hex
 */
function toHex(color) {
    const r = Math.round(color.red).toString(16).padStart(2, '0');
    const g = Math.round(color.green).toString(16).padStart(2, '0');
    const b = Math.round(color.blue).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
}

/**
 * Lighten a color
 */
function lighten(color, amount) {
    return toHex({
        red: Math.min(255, color.red + amount),
        green: Math.min(255, color.green + amount),
        blue: Math.min(255, color.blue + amount)
    });
}

/**
 * Darken a color
 */
function darken(color, amount) {
    return toHex({
        red: Math.max(0, color.red - amount),
        green: Math.max(0, color.green - amount),
        blue: Math.max(0, color.blue - amount)
    });
}

/**
 * Check connection to AI backend
 */
async function checkServerConnection() {
    // Get the configured backend from UIController
    const backend = UIController.currentBackend || 'openrouter';
    const client = backend === 'ollama' ? OllamaClient : OpenRouterClient;

    const health = await client.checkHealth();

    if (!health.ok) {
        console.warn('AI backend not ready:', health.message);
    } else {
        console.log('AI backend connected:', health.message);
    }
}

/**
 * Evaluate ExtendScript function
 * @param {string} script - Script to evaluate
 * @returns {Promise<string>} - Result
 */
function evalScript(script) {
    return new Promise((resolve, reject) => {
        if (!csInterface) {
            reject(new Error('Not running in Premiere Pro'));
            return;
        }

        csInterface.evalScript(script, (result) => {
            if (result === 'EvalScript error.') {
                reject(new Error('ExtendScript error'));
            } else {
                resolve(result);
            }
        });
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
