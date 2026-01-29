/**
 * AutoClipper - Main Entry Point
 * Initializes the CEP panel and connects to Premiere Pro
 */

// CSInterface instance
let csInterface = null;

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

        // Load host script
        const extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
        csInterface.evalScript(`$.evalFile("${extensionPath}/host/index.jsx")`);

        console.log('AutoClipper initialized in Premiere Pro');
    } else {
        console.log('AutoClipper running in standalone mode (for development)');
    }

    // Initialize UI controller
    UIController.init();

    // Check server connection
    checkServerConnection();
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
 * Check connection to AutoClipper server
 */
async function checkServerConnection() {
    const health = await OllamaClient.checkHealth();

    if (!health.ok) {
        console.warn('AutoClipper server not running:', health.message);
        // Could show a warning in the UI
    } else {
        console.log('AutoClipper server connected');
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
