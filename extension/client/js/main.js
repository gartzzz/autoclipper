/**
 * AutoClipper - Main Entry Point
 * Initializes the CEP panel and connects to Premiere Pro
 */

// CSInterface instance
let csInterface = null;

/**
 * Debug Logger - logs to both console and UI panel
 */
const DebugLogger = {
    _logsContainer: null,
    _maxLogs: 100,

    init() {
        this._logsContainer = document.getElementById('debug-logs');
        const toggleBtn = document.getElementById('debug-toggle');
        const closeBtn = document.getElementById('debug-close');
        const clearBtn = document.getElementById('debug-clear');
        const panel = document.getElementById('debug-panel');

        toggleBtn?.addEventListener('click', () => {
            panel?.classList.toggle('hidden');
            toggleBtn.classList.toggle('active', !panel?.classList.contains('hidden'));
        });

        closeBtn?.addEventListener('click', () => {
            panel?.classList.add('hidden');
            toggleBtn?.classList.remove('active');
        });

        clearBtn?.addEventListener('click', () => this.clear());

        // Override console methods to capture logs
        this._hookConsole();
    },

    _hookConsole() {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;

        console.log = (...args) => {
            originalLog.apply(console, args);
            this.log('info', args.join(' '));
        };

        console.warn = (...args) => {
            originalWarn.apply(console, args);
            this.log('warn', args.join(' '));
        };

        console.error = (...args) => {
            originalError.apply(console, args);
            this.log('error', args.join(' '));
        };
    },

    log(level, message) {
        if (!this._logsContainer) return;

        const entry = document.createElement('div');
        entry.className = `debug-log ${level}`;

        const time = new Date().toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        entry.innerHTML = `<span class="timestamp">${time}</span>${this._escapeHtml(message)}`;

        this._logsContainer.appendChild(entry);

        // Remove old logs if too many
        while (this._logsContainer.children.length > this._maxLogs) {
            this._logsContainer.removeChild(this._logsContainer.firstChild);
        }

        // Auto-scroll to bottom
        this._logsContainer.scrollTop = this._logsContainer.scrollHeight;
    },

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    clear() {
        if (this._logsContainer) {
            this._logsContainer.innerHTML = '';
        }
    },

    success(message) {
        this.log('success', message);
    }
};

/**
 * Initialize the extension
 */
function init() {
    // Initialize Debug Logger first
    DebugLogger.init();

    // Initialize CSInterface if available (running in Premiere)
    if (typeof CSInterface !== 'undefined') {
        csInterface = new CSInterface();

        // Set up theme
        updateTheme();
        csInterface.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, updateTheme);

        // Get paths
        const extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
        const hostPath = (extensionPath + '/host/index.jsx').replace(/\\/g, '/');
        console.log('[AutoClipper] Extension path:', extensionPath);
        console.log('[AutoClipper] Host script path:', hostPath);

        // STEP 1: Test basic ExtendScript connectivity
        console.log('[AutoClipper] Step 1: Testing ExtendScript engine...');
        csInterface.evalScript('1+1', (basicResult) => {
            console.log('[AutoClipper] Basic eval (1+1):', basicResult);

            if (basicResult === 'EvalScript error.' || basicResult === undefined) {
                console.error('[AutoClipper] CRITICAL: ExtendScript engine not responding!');
                console.error('[AutoClipper] This usually means:');
                console.error('  1. Premiere needs restart');
                console.error('  2. Another extension crashed the engine');
                console.error('  3. CEP debug mode issue - check PlayerDebugMode registry');
                showEngineError();
                return;
            }

            // STEP 2: Check if script already loaded (from ScriptPath in manifest)
            console.log('[AutoClipper] Step 2: Checking if already loaded...');
            csInterface.evalScript('typeof _autoClipperLoaded', (preCheck) => {
                console.log('[AutoClipper] _autoClipperLoaded type:', preCheck);

                if (preCheck === 'boolean') {
                    console.log('[AutoClipper] ✓ Script was auto-loaded by CEP');
                    verifyAndReport();
                    return;
                }

                // STEP 3: Try loading manually
                console.log('[AutoClipper] Step 3: Loading script manually...');
                loadScriptManually(hostPath);
            });
        });

        function loadScriptManually(path) {
            // Try $.evalFile first
            csInterface.evalScript(`$.evalFile("${path}")`, (result) => {
                console.log('[AutoClipper] $.evalFile result:', result);

                csInterface.evalScript('typeof _autoClipperLoaded', (loadCheck) => {
                    if (loadCheck === 'boolean') {
                        console.log('[AutoClipper] ✓ Script loaded via $.evalFile');
                        verifyAndReport();
                        return;
                    }

                    // Try File read + eval
                    console.log('[AutoClipper] $.evalFile failed, trying File.read...');
                    const script = `
                        (function() {
                            try {
                                var f = new File("${path}");
                                if (!f.exists) return "FILE_NOT_FOUND:" + f.fsName;
                                f.encoding = "UTF-8";
                                f.open("r");
                                var content = f.read();
                                f.close();
                                if (!content) return "FILE_EMPTY";
                                eval(content);
                                return typeof _autoClipperLoaded === 'boolean' ? "LOADED" : "EVAL_OK_BUT_NO_MARKER";
                            } catch(e) {
                                return "ERROR:" + e.message + " LINE:" + e.line;
                            }
                        })()
                    `;
                    csInterface.evalScript(script, (fileResult) => {
                        console.log('[AutoClipper] File.read result:', fileResult);

                        if (fileResult === 'LOADED') {
                            console.log('[AutoClipper] ✓ Script loaded via File.read');
                            verifyAndReport();
                        } else if (fileResult && fileResult.startsWith('FILE_NOT_FOUND')) {
                            console.error('[AutoClipper] ✗ File not found at path');
                            console.error('[AutoClipper] Path:', fileResult.split(':')[1]);
                        } else if (fileResult && fileResult.startsWith('ERROR')) {
                            console.error('[AutoClipper] ✗ JSX syntax error:');
                            console.error('[AutoClipper]', fileResult);
                        } else {
                            console.error('[AutoClipper] ✗ Unknown load failure:', fileResult);
                            verifyAndReport(); // Try anyway
                        }
                    });
                });
            });
        }

        function verifyAndReport() {
            // Run diagnostic
            csInterface.evalScript('acDiagnose()', (diagResult) => {
                console.log('[AutoClipper] Diagnostics:', diagResult);

                try {
                    const diag = JSON.parse(diagResult);
                    console.log('[AutoClipper] ExtendScript version:', diag.extendScriptVersion);
                    console.log('[AutoClipper] App:', diag.appName, diag.appVersion);
                    console.log('[AutoClipper] Has project:', diag.hasProject);
                } catch (e) {
                    console.log('[AutoClipper] Could not parse diagnostics');
                }
            });

            // Verify main functions
            csInterface.evalScript('typeof createSequenceFromClip', (typeResult) => {
                console.log('[AutoClipper] createSequenceFromClip type:', typeResult);

                if (typeResult === 'function') {
                    console.log('[AutoClipper] ✓ All functions loaded successfully!');
                    csInterface.evalScript('testExtendScript()', (testResult) => {
                        console.log('[AutoClipper] Test:', testResult);
                    });
                } else {
                    console.error('[AutoClipper] ✗ Functions not available');
                    console.error('[AutoClipper] Check ESTK console for syntax errors');
                }
            });
        }

        function showEngineError() {
            const statusEl = document.getElementById('jsx-status');
            if (statusEl) {
                statusEl.textContent = '✗ ExtendScript engine not responding';
                statusEl.style.color = '#f87171';
            }
        }

        console.log('AutoClipper initialized in Premiere Pro');

        // Listen for panel close to cleanup
        csInterface.addEventListener('com.adobe.csxs.events.WindowVisibilityChanged', function(event) {
            if (event.data === 'false') {
                handlePanelClose();
            }
        });

    } else {
        console.log('AutoClipper running in standalone mode (for development)');
    }

    // Also handle browser unload
    window.addEventListener('beforeunload', handlePanelClose);

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

/**
 * Handle panel close - cleanup resources
 */
function handlePanelClose() {
    console.log('[AutoClipper] Panel closing, cleaning up...');

    // Stop model status polling regardless of backend
    UIController.stopModelStatusPolling();

    // Clean up keep-warm if active
    if (UIController._isKeepWarmActive) {
        if (UIController._keepWarmInterval) {
            clearInterval(UIController._keepWarmInterval);
            UIController._keepWarmInterval = null;
        }
        UIController._isKeepWarmActive = false;

        // Only unload if we were actually using Ollama
        if (UIController.currentBackend === 'ollama') {
            OllamaClient.unloadModel();
            console.log('[AutoClipper] Model unloaded from GPU');
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
