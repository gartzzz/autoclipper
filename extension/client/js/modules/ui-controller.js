/**
 * UI Controller Module
 * Manages state transitions and UI updates for AutoClipper panel
 */

// Tier enforcement disabled — everything is free for now. Re-enable when Stripe is ready.
const FREE_CLIP_LIMIT = Infinity;

const UIController = {
    // Current state
    currentState: 'setup',

    // Data
    segments: [],
    viralClips: [],
    approvedClips: [],
    currentClipIndex: 0,

    // DOM elements (cached on init)
    elements: {},

    // AbortController for cancelling in-flight analysis
    _analysisController: null,

    /**
     * Escape HTML to prevent XSS from LLM-generated content
     */
    _escHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    },

    /**
     * Initialize the UI controller
     */
    init() {
        this.cacheElements();
        this.bindEvents();
        this.bindKeyboardShortcuts();

        // Update auth UI
        this.updateAuthUI();

        // Check if configured
        if (!this.isBackendConfigured()) {
            this.setState('settings');
        } else {
            this.setState('setup');
        }
    },

    /**
     * Check if backend is configured
     */
    isBackendConfigured() {
        return OpenRouterClient.hasApiKey();
    },

    /**
     * Get AI client
     */
    getAIClient() {
        return OpenRouterClient;
    },

    /**
     * Cache DOM elements for performance
     */
    cacheElements() {
        this.elements = {
            // States
            setupState: document.getElementById('setup-state'),
            reviewState: document.getElementById('review-state'),
            generateState: document.getElementById('generate-state'),
            analyzingState: document.getElementById('analyzing-state'),
            generatingState: document.getElementById('generating-state'),
            errorState: document.getElementById('error-state'),
            settingsState: document.getElementById('settings-state'),

            // Setup
            transcriptInput: document.getElementById('transcript-input'),
            transcriptDrop: document.getElementById('transcript-drop'),
            importSrtBtn: document.getElementById('import-srt-btn'),
            transcriptInfo: document.getElementById('transcript-info'),
            wordCount: document.getElementById('word-count'),
            analyzeBtn: document.getElementById('analyze-btn'),
            settingsBtn: document.getElementById('settings-btn'),

            // Review
            clipCounter: document.getElementById('clip-counter'),
            clipTitle: document.getElementById('clip-title'),
            clipPreview: document.getElementById('clip-preview'),
            clipTranscript: document.getElementById('clip-transcript'),
            clipTimecode: document.getElementById('clip-timecode'),
            clipScore: document.getElementById('clip-score'),
            rejectBtn: document.getElementById('reject-btn'),
            replayBtn: document.getElementById('replay-btn'),
            skipBtn: document.getElementById('skip-btn'),
            approveBtn: document.getElementById('approve-btn'),
            progressDots: document.getElementById('progress-dots'),
            clipSegments: document.getElementById('clip-segments'),
            backToSetup: document.getElementById('back-to-setup'),

            // Generate
            approvedCount: document.getElementById('approved-count'),
            approvedList: document.getElementById('approved-list'),
            subtitlePreset: document.getElementById('subtitle-preset'),
            generateBtn: document.getElementById('generate-btn'),
            countdown: document.getElementById('countdown'),
            countdownNum: document.getElementById('countdown-num'),
            backToReview: document.getElementById('back-to-review'),

            // Analyzing
            analysisStatus: document.getElementById('analysis-status'),
            analysisProgress: document.getElementById('analysis-progress-fill'),
            momentsFound: document.getElementById('moments-found'),
            cancelAnalysis: document.getElementById('cancel-analysis'),
            thinkingPreview: document.getElementById('thinking-preview'),
            thinkingText: document.getElementById('thinking-text'),
            tokensCount: document.getElementById('tokens-count'),

            // Generating
            generationProgress: document.getElementById('generation-progress-fill'),
            generationStatus: document.getElementById('generation-status'),
            generationList: document.getElementById('generation-list'),

            // Error
            errorMessage: document.getElementById('error-message'),
            errorDetails: document.getElementById('error-details'),
            errorRaw: document.getElementById('error-raw'),
            retryBtn: document.getElementById('retry-btn'),
            fallbackBtn: document.getElementById('fallback-btn'),
            closeError: document.getElementById('close-error'),
            showDetailsBtn: document.getElementById('show-details-btn'),

            // Settings
            apiKeyInput: document.getElementById('api-key-input'),
            saveKeyBtn: document.getElementById('save-key-btn'),
            keyStatus: document.getElementById('key-status'),
            backFromSettings: document.getElementById('back-from-settings'),
            getKeyLink: document.getElementById('get-key-link')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        const { elements } = this;

        // Transcript input
        elements.transcriptInput.addEventListener('input', () => this.onTranscriptChange());
        elements.transcriptInput.addEventListener('paste', (e) => this.onTranscriptPaste(e));

        // Import SRT from file dialog
        elements.importSrtBtn.addEventListener('click', () => this.importSRT());

        // Drag and drop
        elements.transcriptDrop.addEventListener('dragover', (e) => {
            e.preventDefault();
            elements.transcriptDrop.classList.add('drag-over');
        });
        elements.transcriptDrop.addEventListener('dragleave', () => {
            elements.transcriptDrop.classList.remove('drag-over');
        });
        elements.transcriptDrop.addEventListener('drop', (e) => this.onFileDrop(e));

        // Settings button
        elements.settingsBtn.addEventListener('click', () => this.setState('settings'));

        // Analyze button
        elements.analyzeBtn.addEventListener('click', () => this.startAnalysis());

        // Review actions
        elements.rejectBtn.addEventListener('click', () => this.rejectClip());
        elements.approveBtn.addEventListener('click', () => this.approveClip());
        elements.replayBtn.addEventListener('click', () => this.replayClip());
        elements.skipBtn.addEventListener('click', () => this.skipClip());
        elements.backToSetup.addEventListener('click', () => this.setState('setup'));

        // Generate actions
        elements.generateBtn.addEventListener('click', () => this.startGeneration());
        elements.backToReview.addEventListener('click', () => this.goBackToReview());

        // Error actions
        elements.retryBtn.addEventListener('click', () => this.startAnalysis());
        elements.fallbackBtn.addEventListener('click', () => this.setState('settings'));
        elements.closeError.addEventListener('click', () => this.setState('setup'));
        elements.showDetailsBtn.addEventListener('click', () => this.toggleErrorDetails());

        // Cancel analysis
        elements.cancelAnalysis.addEventListener('click', () => this.cancelAnalysis());

        // Progress dots — delegated click handler (avoids listener leak on re-render)
        elements.progressDots.addEventListener('click', (e) => {
            const dot = e.target.closest('.dot');
            if (dot) {
                const index = parseInt(dot.dataset.index);
                if (!isNaN(index)) this.goToClip(index);
            }
        });

        // Settings actions
        elements.saveKeyBtn.addEventListener('click', () => this.saveSettings());
        elements.backFromSettings.addEventListener('click', () => {
            if (this.isBackendConfigured()) {
                this.setState('setup');
            } else {
                // Surface a clear inline message rather than silently doing nothing
                const keyStatus = this.elements.keyStatus;
                keyStatus.innerHTML = '<span style="color: var(--warning);">Guarda una configuracion valida antes de continuar.</span>';
                keyStatus.classList.remove('hidden');
                // Briefly shake the save button to direct attention
                this.elements.saveKeyBtn.style.outline = '2px solid var(--warning)';
                setTimeout(() => {
                    this.elements.saveKeyBtn.style.outline = '';
                }, 1500);
            }
        });
        elements.getKeyLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.openExternalLink('https://openrouter.ai/keys');
        });

        // Enter key in API key input
        elements.apiKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveSettings();
            }
        });

        // Export help - open AutoClipper bin
        document.getElementById('open-bin-btn')?.addEventListener('click', () => {
            if (typeof csInterface !== 'undefined') {
                csInterface.evalScript('revealAutoClipperBin()');
            }
        });

        // Auth events
        document.getElementById('auth-login-btn')?.addEventListener('click', () => this.handleLogin());
        document.getElementById('auth-signup-btn')?.addEventListener('click', () => this.handleSignup());
        document.getElementById('auth-logout-btn')?.addEventListener('click', () => this.handleLogout());
        document.getElementById('auth-password')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });

        // Upgrade buttons
        document.getElementById('upgrade-btn')?.addEventListener('click', () => this.openUpgrade());
        document.getElementById('upgrade-banner-btn')?.addEventListener('click', () => this.openUpgrade());
        document.getElementById('upgrade-banner-login')?.addEventListener('click', () => this.setState('settings'));
        document.getElementById('upgrade-banner-dismiss')?.addEventListener('click', () => this.hideUpgradeBanner());
        document.getElementById('refresh-plan-btn')?.addEventListener('click', () => this.refreshPlanStatus());

        // Free-tier notice login shortcut on Setup screen
        document.getElementById('free-tier-login-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.setState('settings');
        });
    },

    /**
     * Open external link
     */
    openExternalLink(url) {
        if (typeof csInterface !== 'undefined') {
            csInterface.openURLInDefaultBrowser(url);
        } else {
            window.open(url, '_blank');
        }
    },

    /**
     * Save settings for current backend
     */
    async saveSettings() {
        const { elements } = this;
        const key = elements.apiKeyInput.value.trim();

        if (!key) {
            return;
        }

        if (!key.startsWith('sk-or-')) {
            elements.keyStatus.innerHTML = '<span style="color: var(--danger);">Key invalida (debe empezar con sk-or-)</span>';
            elements.keyStatus.classList.remove('hidden');
            return;
        }

        OpenRouterClient.setApiKey(key);

        // Test the key
        elements.saveKeyBtn.textContent = 'Verificando...';
        elements.saveKeyBtn.disabled = true;

        const health = await OpenRouterClient.checkHealth();

        elements.saveKeyBtn.textContent = 'Guardar';
        elements.saveKeyBtn.disabled = false;

        if (health.ok) {
            elements.keyStatus.innerHTML = `<span class="check-icon">&#10003;</span> <span>${health.message}</span>`;
            elements.keyStatus.classList.remove('hidden');
            setTimeout(() => this.setState('setup'), 1000);
        } else {
            elements.keyStatus.innerHTML = `<span style="color: var(--danger);">${health.message}</span>`;
            elements.keyStatus.classList.remove('hidden');
        }
    },

    /**
     * Bind keyboard shortcuts
     */
    bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (this.currentState !== 'review') return;

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.rejectClip();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.approveClip();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.goToPreviousClip();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.goToNextClip();
                    break;
                case 's':
                case 'S':
                    e.preventDefault();
                    this.skipClip();
                    break;
                case ' ':
                    e.preventDefault();
                    this.replayClip();
                    break;
            }
        });
    },

    /**
     * Set current UI state
     * @param {string} state - State name
     */
    setState(state) {
        // Hide all states
        document.querySelectorAll('.state').forEach(el => el.classList.remove('active'));

        // Show requested state
        const stateEl = document.getElementById(`${state}-state`);
        if (stateEl) {
            stateEl.classList.add('active');
        }

        this.currentState = state;

        // Load current settings
        if (state === 'settings') {
            // Load OpenRouter key
            const currentKey = OpenRouterClient.getApiKey();
            if (currentKey) {
                this.elements.apiKeyInput.value = currentKey;
            }

            // Clear status
            this.elements.keyStatus.classList.add('hidden');

            // Show a one-time welcome hint for users who have no backend configured yet
            const isFirstSetup = !this.isBackendConfigured();
            let onboardingBanner = document.getElementById('settings-onboarding-banner');
            if (!onboardingBanner) {
                onboardingBanner = document.createElement('div');
                onboardingBanner.id = 'settings-onboarding-banner';
                onboardingBanner.style.cssText = [
                    'padding: 10px 12px',
                    'margin-bottom: 16px',
                    'background: rgba(10,132,255,0.12)',
                    'border: 1px solid rgba(10,132,255,0.4)',
                    'border-radius: var(--radius)',
                    'font-size: 11px',
                    'color: var(--text-primary)',
                    'line-height: 1.5'
                ].join(';');
                onboardingBanner.innerHTML = [
                    '<strong>Bienvenido a AutoClipper.</strong><br>',
                    'Para analizar transcripciones necesitas una API key de OpenRouter (gratis). ',
                    'Pegala abajo y pulsa Guardar.'
                ].join('');
                const content = document.querySelector('#settings-state .content');
                if (content) content.insertBefore(onboardingBanner, content.firstChild);
            }
            onboardingBanner.style.display = isFirstSetup ? 'block' : 'none';

            // Update auth section
            this.updateAuthUI();
        }
    },

    /**
     * Handle transcript text change
     */
    onTranscriptChange() {
        const text = this.elements.transcriptInput.value;

        if (text.trim()) {
            this.segments = SRTParser.parse(text);
            const wordCount = SRTParser.countWords(this.segments);

            this.elements.wordCount.textContent = `${wordCount.toLocaleString()} palabras detectadas`;
            this.elements.transcriptInfo.classList.remove('hidden');
            this.elements.analyzeBtn.disabled = false;
        } else {
            this.segments = [];
            this.elements.transcriptInfo.classList.add('hidden');
            this.elements.analyzeBtn.disabled = true;
        }
    },

    /**
     * Handle paste event
     * @param {ClipboardEvent} e
     */
    onTranscriptPaste(e) {
        // Let the paste happen, then process
        setTimeout(() => this.onTranscriptChange(), 0);
    },

    /**
     * Handle file drop
     * @param {DragEvent} e
     */
    onFileDrop(e) {
        e.preventDefault();
        this.elements.transcriptDrop.classList.remove('drag-over');

        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.srt') || file.name.endsWith('.vtt') || file.name.endsWith('.txt'))) {
            const reader = new FileReader();
            reader.onload = (event) => {
                this.elements.transcriptInput.value = event.target.result;
                this.onTranscriptChange();
            };
            reader.readAsText(file);
        }
    },

    /**
     * Import SRT/VTT/TXT file via native file dialog
     */
    importSRT() {
        if (typeof csInterface === 'undefined') {
            console.warn('[AutoClipper] File import only works inside Premiere Pro');
            return;
        }

        csInterface.evalScript('openSRTDialog()', (filePath) => {
            if (!filePath || filePath === 'EvalScript error.') return;

            try {
                const result = window.cep.fs.readFile(filePath);
                if (result.err !== 0) {
                    console.error('[AutoClipper] Failed to read file:', result.err);
                    return;
                }
                this.elements.transcriptInput.value = result.data;
                this.onTranscriptChange();
            } catch (err) {
                console.error('[AutoClipper] importSRT error:', err);
            }
        });
    },

    // Store last error for details view
    _lastError: null,

    // Cancellation flag — set true when user cancels, checked before any post-analysis state change
    _analysisCancelled: false,

    /**
     * Start analysis
     */
    async startAnalysis() {
        // Check configuration first
        if (!this.isBackendConfigured()) {
            this.setState('settings');
            return;
        }

        // Abort any in-flight analysis
        if (this._analysisController) {
            this._analysisController.abort();
        }
        this._analysisController = new AbortController();

        this._analysisCancelled = false;
        this.viralClips = [];
        this.approvedClips = [];
        this.currentClipIndex = 0;
        this.setState('analyzing');
        this.elements.analysisProgress.style.width = '0%';
        this.elements.momentsFound.textContent = '0 momentos encontrados';
        this.elements.momentsFound.style.color = ''; // Reset warning color
        this.elements.analysisStatus.textContent = 'Conectando con IA...';
        this.elements.thinkingPreview.classList.add('hidden');
        this.elements.thinkingText.textContent = '';
        this.elements.tokensCount.textContent = '';
        this._contextInfoShown = false;

        const client = this.getAIClient();
        const signal = this._analysisController.signal;

        try {
            // Analyze transcript
            this.viralClips = await client.analyzeTranscript(
                this.segments,
                {},
                (progress) => {
                    // Update progress bar
                    if (progress.progress !== undefined) {
                        this.elements.analysisProgress.style.width = `${progress.progress}%`;
                    }

                    // Update status message
                    if (progress.message) {
                        this.elements.analysisStatus.textContent = progress.message;
                    }

                    // Update moments found
                    if (progress.momentsFound !== undefined) {
                        this.elements.momentsFound.textContent =
                            `${progress.momentsFound} momentos encontrados`;
                    }

                    // Show thinking preview (for reasoning models like DeepSeek R1)
                    if (progress.thinking) {
                        this.elements.thinkingPreview.classList.remove('hidden');
                        this.elements.thinkingText.textContent = progress.thinking;
                        // Auto-scroll to bottom
                        this.elements.thinkingPreview.scrollTop = this.elements.thinkingPreview.scrollHeight;
                    }

                    // Show tokens count and speed
                    if (progress.tokensReceived !== undefined) {
                        let tokenInfo = `${progress.tokensReceived} tokens`;
                        if (progress.tokensPerSec) {
                            tokenInfo += ` (${progress.tokensPerSec} t/s)`;
                        }
                        this.elements.tokensCount.textContent = tokenInfo;
                    }

                    // Show context info (first time only)
                    if (progress.contextInfo && !this._contextInfoShown) {
                        this._contextInfoShown = true;
                        console.log('[AutoClipper]', progress.contextInfo);
                    }

                    // Show context truncation warning if present
                    if (progress.warning) {
                        this.elements.momentsFound.textContent = progress.warning;
                        this.elements.momentsFound.style.color = '#f39c12';
                    }
                },
                signal
            );

            // User cancelled while the request was in flight — discard result silently
            if (this._analysisCancelled) return;

            if (this.viralClips.length === 0) {
                throw new Error('No se encontraron momentos virales');
            }

            // Initialize review state
            this.approvedClips = [];
            this.currentClipIndex = 0;
            this.updateReviewUI();
            this.setState('review');

        } catch (error) {
            // Don't show error if the user already cancelled and moved on
            if (this._analysisCancelled || error.name === 'AbortError') return;

            this._lastError = error;
            this.elements.errorMessage.textContent = error.message;

            // Prepare error details
            if (error.rawResponse) {
                this.elements.errorRaw.textContent = error.rawResponse.substring(0, 2000) +
                    (error.rawResponse.length > 2000 ? '\n\n... (truncado)' : '');
                this.elements.showDetailsBtn.classList.remove('hidden');
            } else {
                this.elements.showDetailsBtn.classList.add('hidden');
            }

            // Hide details by default
            this.elements.errorDetails.classList.add('hidden');

            this.setState('error');
        }
    },

    /**
     * Toggle error details visibility
     */
    toggleErrorDetails() {
        const isHidden = this.elements.errorDetails.classList.contains('hidden');
        this.elements.errorDetails.classList.toggle('hidden', !isHidden);
        this.elements.showDetailsBtn.textContent = isHidden
            ? 'Ocultar respuesta'
            : 'Ver respuesta del modelo';
    },

    /**
     * Cancel ongoing analysis
     */
    cancelAnalysis() {
        // Abort the fetch request
        if (this._analysisController) {
            this._analysisController.abort();
            this._analysisController = null;
        }
        // Signal the in-flight promise to discard its result if it resolves later
        this._analysisCancelled = true;
        this.setState('setup');

        // Show a brief confirmation that cancel was acknowledged, since the
        // transcript is still loaded and ready to re-analyze
        const info = this.elements.transcriptInfo;
        if (info && !info.classList.contains('hidden')) {
            const wordCountEl = this.elements.wordCount;
            const original = wordCountEl.textContent;
            wordCountEl.textContent = 'Analisis cancelado — transcripcion lista.';
            setTimeout(() => { wordCountEl.textContent = original; }, 2500);
        }
    },

    /**
     * Update review UI for current clip
     */
    updateReviewUI() {
        const clip = this.viralClips[this.currentClipIndex];
        if (!clip) return;

        const total = this.viralClips.length;
        const current = this.currentClipIndex + 1;

        // Add star for high potential clips (>=75)
        const isHighPotential = clip.viralScore >= 75;
        const starPrefix = isHighPotential ? '⭐ ' : '';

        // Show approved count for free users
        const isFree = typeof AuthClient !== 'undefined' && !AuthClient.isPro();
        const approvedCount = this.viralClips.filter(c => c.approved).length;
        const limitInfo = isFree ? ` (${approvedCount}/${FREE_CLIP_LIMIT} aprobados)` : '';
        this.elements.clipCounter.textContent = `[Clip ${current}/${total}]${limitInfo}`;
        this.elements.clipTitle.textContent = starPrefix + (clip.suggestedTitle || `Momento ${current}`);
        this.elements.clipTranscript.textContent = `"${clip.text || '...'}"`;
        this.elements.clipTimecode.textContent =
            `${SRTParser.formatTime(clip.startTime)} - ${SRTParser.formatTime(clip.endTime)}`;
        this.elements.clipScore.textContent = `${clip.viralScore || 0}%`;

        // Show multi-segment info if applicable
        if (clip.segments && clip.segments.length > 1) {
            const reorderedLabel = clip.isReordered ? ' · reordenado' : '';
            let segHTML = `<div class="segments-header">${clip.segments.length} segmentos${reorderedLabel}</div>`;
            segHTML += '<ol class="segments-list">';
            clip.segments.forEach((seg) => {
                segHTML += `<li><span class="seg-time">${SRTParser.formatTime(seg.startTime)} - ${SRTParser.formatTime(seg.endTime)}</span></li>`;
            });
            segHTML += '</ol>';
            this.elements.clipSegments.innerHTML = segHTML;
            this.elements.clipSegments.classList.remove('hidden');
        } else {
            this.elements.clipSegments.classList.add('hidden');
        }

        // Update progress dots
        this.updateProgressDots();
    },

    /**
     * Update progress dots (clickable for navigation)
     */
    updateProgressDots() {
        const dots = this.viralClips.map((clip, i) => {
            let className = 'dot';
            if (i === this.currentClipIndex) {
                className += ' current';
            } else if (clip.approved) {
                className += ' approved';
            } else if (clip.rejected) {
                className += ' rejected';
            } else if (clip.skipped) {
                className += ' skipped';
            }
            return `<div class="${className}" data-index="${i}" title="Clip ${i + 1}"></div>`;
        }).join('');

        this.elements.progressDots.innerHTML = dots;
    },

    /**
     * Reject current clip and move to next
     */
    rejectClip() {
        this.viralClips[this.currentClipIndex].rejected = true;
        this.viralClips[this.currentClipIndex].approved = false;
        this.viralClips[this.currentClipIndex].skipped = false;
        this.nextClip();
    },

    /**
     * Approve current clip and move to next
     */
    approveClip() {
        // Free tier clip limit
        if (typeof AuthClient !== 'undefined' && !AuthClient.isPro()) {
            const currentApproved = this.viralClips.filter(c => c.approved).length;
            if (!this.viralClips[this.currentClipIndex].approved && currentApproved >= FREE_CLIP_LIMIT) {
                this.showUpgradeBanner();
                return;
            }
        }

        this.viralClips[this.currentClipIndex].approved = true;
        this.viralClips[this.currentClipIndex].rejected = false;
        this.viralClips[this.currentClipIndex].skipped = false;
        this.hideUpgradeBanner();
        this.nextClip();
    },

    /**
     * Skip current clip (no decision) and move to next
     */
    skipClip() {
        this.viralClips[this.currentClipIndex].skipped = true;
        this.viralClips[this.currentClipIndex].approved = false;
        this.viralClips[this.currentClipIndex].rejected = false;
        this.nextClip();
    },

    /**
     * Navigate to previous clip without making a decision
     */
    goToPreviousClip() {
        if (this.currentClipIndex > 0) {
            this.currentClipIndex--;
            this.updateReviewUI();
            this.replayClip();
        }
    },

    /**
     * Navigate to next clip without making a decision
     */
    goToNextClip() {
        if (this.currentClipIndex < this.viralClips.length - 1) {
            this.currentClipIndex++;
            this.updateReviewUI();
            this.replayClip();
        }
    },

    /**
     * Jump to a specific clip by index
     */
    goToClip(index) {
        if (index >= 0 && index < this.viralClips.length) {
            this.currentClipIndex = index;
            this.updateReviewUI();
            this.replayClip();
        }
    },

    /**
     * Move to next clip or finish review
     */
    nextClip() {
        if (this.currentClipIndex < this.viralClips.length - 1) {
            this.currentClipIndex++;
            this.updateReviewUI();
        } else {
            this.finishReview();
        }
    },

    /**
     * Replay current clip in Premiere monitor
     */
    replayClip() {
        const clip = this.viralClips[this.currentClipIndex];
        if (!clip) return;

        // Check if host script is loaded
        if (typeof isHostScriptLoaded === 'function' && !isHostScriptLoaded()) {
            console.warn('[AutoClipper] Cannot replay: host script not loaded');
            this.addDebugLog('Replay bloqueado: ExtendScript no cargado');
            return;
        }

        // Call ExtendScript to set playhead and play
        const start = parseFloat(clip.startTime);
        const end = parseFloat(clip.endTime);
        if (!isFinite(start) || !isFinite(end)) {
            console.warn('[AutoClipper] Invalid clip times:', clip.startTime, clip.endTime);
            return;
        }
        if (typeof csInterface !== 'undefined') {
            csInterface.evalScript(`playClipRange(${start}, ${end})`, (result) => {
                console.log('[AutoClipper] playClipRange result:', result);
                this.addDebugLog(`playClipRange: ${result}`);
            });
        }
    },

    /**
     * Add message to debug log
     */
    addDebugLog(message) {
        const logEl = document.getElementById('debug-log');
        if (logEl) {
            const time = new Date().toLocaleTimeString();
            logEl.textContent = `[${time}] ${message}\n` + logEl.textContent;
            // Keep only last 20 lines
            const lines = logEl.textContent.split('\n').slice(0, 20);
            logEl.textContent = lines.join('\n');
        }
    },

    /**
     * Show error when host script fails to load
     */
    showHostScriptError(path) {
        // Add error banner at top
        const banner = document.createElement('div');
        banner.className = 'host-error-banner';
        banner.innerHTML = `ExtendScript no cargado. Funciones de Premiere deshabilitadas.`;
        document.body.insertBefore(banner, document.body.firstChild);

        // Update debug panel
        this.addDebugLog(`ERROR: No se pudo cargar ${path}`);
    },

    /**
     * Finish review and show generate state
     */
    finishReview() {
        this.approvedClips = this.viralClips.filter(clip => clip.approved);

        // Enforce free tier limit (safety net)
        if (typeof AuthClient !== 'undefined' && !AuthClient.isPro() && this.approvedClips.length > FREE_CLIP_LIMIT) {
            this.approvedClips = this.approvedClips.slice(0, FREE_CLIP_LIMIT);
        }

        const skippedCount = this.viralClips.filter(clip => clip.skipped).length;
        const rejectedCount = this.viralClips.filter(clip => clip.rejected).length;

        if (this.approvedClips.length === 0) {
            // Stay in review, show an inline warning — do NOT reset the clip index
            // so the user stays where they were when they triggered finishReview
            this.showReviewWarning(
                skippedCount > 0
                    ? `Aprueba al menos un clip para continuar. (${skippedCount} sin revisar — usa ↑↓ para navegar)`
                    : 'Aprueba al menos un clip para continuar.'
            );
            return;
        }

        this.updateGenerateUI();
        this.setState('generate');
    },

    /**
     * Update generate state UI
     */
    updateGenerateUI() {
        this.elements.approvedCount.textContent =
            `${this.approvedClips.length} clips aprobados`;

        const listHTML = this.approvedClips.map(clip => {
            const isHighPotential = clip.viralScore >= 75;
            const starPrefix = isHighPotential ? '⭐ ' : '';
            return `
            <div class="approved-item">
                <span class="check">&#10003;</span>
                <span class="title">${starPrefix}${this._escHtml(clip.suggestedTitle || 'Clip')}</span>
                <span class="preset-badge">&#9889;</span>
            </div>
        `;
        }).join('');

        this.elements.approvedList.innerHTML = listHTML;
    },

    /**
     * Go back to review from generate.
     * Preserve the current clip index so the user lands on the last clip
     * they were viewing rather than being reset to the start.
     */
    goBackToReview() {
        // Do not reset currentClipIndex — the user should land where they left off
        this.updateReviewUI();
        this.setState('review');
    },

    /**
     * Start generating sequences
     */
    async startGeneration() {
        // Check if host script is loaded
        if (typeof isHostScriptLoaded === 'function' && !isHostScriptLoaded()) {
            this.addDebugLog('Generacion bloqueada: ExtendScript no cargado');
            this._lastError = new Error('ExtendScript no esta cargado. Cierra y vuelve a abrir el panel de AutoClipper en Premiere.');
            this.elements.errorMessage.textContent = this._lastError.message;
            this.elements.errorDetails.classList.add('hidden');
            this.elements.showDetailsBtn.classList.add('hidden');
            this.setState('error');
            return;
        }

        this.setState('generating');
        this.elements.generationProgress.style.width = '0%';

        const VALID_PRESETS = ['viral_yellow', 'minimal_white', 'none'];
        const rawPreset = this.elements.subtitlePreset.value;
        const preset = VALID_PRESETS.includes(rawPreset) ? rawPreset : 'none';
        const total = this.approvedClips.length;

        // Initial list - all pending
        this.elements.generationList.innerHTML = this.approvedClips.map((clip, i) => `
            <div class="generation-item" id="gen-item-${i}">
                <span class="status-icon pending">○</span>
                <div>
                    <div class="title">${this._escHtml(clip.suggestedTitle || `Clip ${i + 1}`)}</div>
                    <div class="subtitle">Esperando...</div>
                </div>
            </div>
        `).join('');

        // Mark all as working
        for (let i = 0; i < total; i++) {
            const item = document.getElementById(`gen-item-${i}`);
            item.querySelector('.status-icon').textContent = '⟳';
            item.querySelector('.status-icon').className = 'status-icon working';
            item.querySelector('.subtitle').textContent = 'Procesando...';
        }

        this.elements.generationStatus.textContent = `Creando ${total} secuencias...`;
        this.elements.generationProgress.style.width = '50%';

        try {
            if (typeof csInterface !== 'undefined' && csInterface !== null) {
                // Call batch function - creates ALL sequences in one call
                const clipsJSON = JSON.stringify(this.approvedClips);
                const script = `createSequencesBatch(${JSON.stringify(clipsJSON)}, "${preset}")`;
                console.log('[AutoClipper] Calling batch ExtendScript');

                const result = await new Promise((resolve, reject) => {
                    csInterface.evalScript(script, (result) => {
                        console.log('[AutoClipper] Batch result:', result);
                        if (result === 'EvalScript error.' || result === 'undefined') {
                            reject(new Error('ExtendScript function not found'));
                        } else {
                            resolve(result);
                        }
                    });
                });

                // Parse batch results
                const batchResult = JSON.parse(result);
                console.log('[AutoClipper] Batch parsed:', batchResult);

                if (!batchResult.success && batchResult.error) {
                    throw new Error(batchResult.error);
                }

                // Update UI with individual results
                batchResult.results.forEach((res, i) => {
                    const item = document.getElementById(`gen-item-${i}`);
                    if (res.success) {
                        item.querySelector('.status-icon').textContent = '✓';
                        item.querySelector('.status-icon').className = 'status-icon done';
                        item.querySelector('.subtitle').textContent = 'Completado';
                    } else {
                        item.querySelector('.status-icon').textContent = '✗';
                        item.querySelector('.status-icon').className = 'status-icon error';
                        item.querySelector('.subtitle').textContent = res.error || 'Error';
                    }
                });

                this.elements.generationProgress.style.width = '100%';
                this.elements.generationStatus.textContent =
                    `¡${batchResult.created}/${batchResult.total} secuencias creadas!`;

            } else {
                // Simulate for testing
                console.log('[AutoClipper] Running in standalone mode - simulating');
                await new Promise(r => setTimeout(r, 2000));

                for (let i = 0; i < total; i++) {
                    const item = document.getElementById(`gen-item-${i}`);
                    item.querySelector('.status-icon').textContent = '✓';
                    item.querySelector('.status-icon').className = 'status-icon done';
                    item.querySelector('.subtitle').textContent = 'Completado';
                }

                this.elements.generationProgress.style.width = '100%';
                this.elements.generationStatus.textContent = '¡Generacion completada!';
            }

        } catch (error) {
            console.error('[AutoClipper] Batch error:', error);
            this.addDebugLog('Batch error: ' + error.message);

            // Mark all as error
            for (let i = 0; i < total; i++) {
                const item = document.getElementById(`gen-item-${i}`);
                if (item.querySelector('.status-icon').className.includes('working')) {
                    item.querySelector('.status-icon').textContent = '✗';
                    item.querySelector('.status-icon').className = 'status-icon error';
                    item.querySelector('.subtitle').textContent = error.message || 'Error';
                }
            }

            this.elements.generationStatus.textContent = 'Error: ' + error.message;
        }

        // Show export help
        const exportHelp = document.getElementById('export-help');
        if (exportHelp) {
            exportHelp.classList.remove('hidden');
        }
    },

    // ─── Auth & Upgrade Methods ─────────────────────────────────────────

    /**
     * Update auth UI based on current session
     */
    updateAuthUI() {
        if (typeof AuthClient === 'undefined') return;

        const authForm = document.getElementById('auth-form');
        const accountInfo = document.getElementById('account-info');
        const planBadge = document.getElementById('plan-badge');
        const upgradeBtn = document.getElementById('upgrade-btn');
        const freeTierNotice = document.getElementById('free-tier-notice');

        // Hide upgrade/tier UI — no Pro tier yet
        upgradeBtn?.classList.add('hidden');
        freeTierNotice?.classList.add('hidden');
        planBadge?.classList.add('hidden');

        if (AuthClient.isLoggedIn()) {
            authForm?.classList.add('hidden');
            accountInfo?.classList.remove('hidden');

            const emailEl = document.getElementById('account-email');
            if (emailEl) emailEl.textContent = AuthClient.getUser()?.email || '';
        } else {
            authForm?.classList.remove('hidden');
            accountInfo?.classList.add('hidden');
        }
    },

    /**
     * Handle login
     */
    async handleLogin() {
        const email = document.getElementById('auth-email')?.value.trim();
        const password = document.getElementById('auth-password')?.value;
        const statusEl = document.getElementById('auth-status');
        const statusText = document.getElementById('auth-status-text');
        const btn = document.getElementById('auth-login-btn');

        if (!email || !password) return;

        btn.textContent = 'Conectando...';
        btn.disabled = true;

        const result = await AuthClient.signIn(email, password);

        btn.textContent = 'Iniciar sesion';
        btn.disabled = false;

        if (result.ok) {
            await AuthClient.getProfile();
            this.updateAuthUI();
            statusEl?.classList.add('hidden');
        } else {
            if (statusText) { statusText.textContent = result.error; statusText.style.color = 'var(--danger)'; }
            statusEl?.classList.remove('hidden');
        }
    },

    /**
     * Handle signup
     */
    async handleSignup() {
        const email = document.getElementById('auth-email')?.value.trim();
        const password = document.getElementById('auth-password')?.value;
        const referralCode = document.getElementById('auth-referral')?.value.trim();
        const statusEl = document.getElementById('auth-status');
        const statusText = document.getElementById('auth-status-text');
        const btn = document.getElementById('auth-signup-btn');

        if (!email || !password) return;
        if (password.length < 6) {
            if (statusText) { statusText.textContent = 'La contrasena debe tener al menos 6 caracteres'; statusText.style.color = 'var(--danger)'; }
            statusEl?.classList.remove('hidden');
            return;
        }

        btn.textContent = 'Creando...';
        btn.disabled = true;

        const result = await AuthClient.signUp(email, password, referralCode);

        btn.textContent = 'Registrarse';
        btn.disabled = false;

        if (result.ok) {
            // Auto-login after signup
            const loginResult = await AuthClient.signIn(email, password);
            if (loginResult.ok) {
                await AuthClient.getProfile();
                this.updateAuthUI();
                statusEl?.classList.add('hidden');
            } else {
                // Signup succeeded but auto-login failed (e.g. email confirmation required)
                if (statusText) { statusText.textContent = 'Registro exitoso. Revisa tu correo para confirmar.'; statusText.style.color = 'var(--success, #22c55e)'; }
                statusEl?.classList.remove('hidden');
            }
        } else {
            if (statusText) { statusText.textContent = result.error; statusText.style.color = 'var(--danger)'; }
            statusEl?.classList.remove('hidden');
        }
    },

    /**
     * Handle logout
     */
    async handleLogout() {
        await AuthClient.signOut();
        this.updateAuthUI();
    },

    /**
     * Refresh plan status (for users who just paid)
     */
    async refreshPlanStatus() {
        if (typeof AuthClient === 'undefined' || !AuthClient.isLoggedIn()) return;

        const btn = document.getElementById('refresh-plan-btn');
        if (btn) { btn.textContent = 'Verificando...'; btn.disabled = true; }

        await AuthClient.getProfile();
        this.updateAuthUI();

        if (btn) { btn.textContent = 'Actualizar estado del plan'; btn.disabled = false; }
    },

    /**
     * Open Stripe checkout
     */
    openUpgrade() {
        if (typeof AuthClient === 'undefined') return;

        if (!AuthClient.isLoggedIn()) {
            this.setState('settings');
            return;
        }

        const url = AuthClient.getCheckoutUrl('monthly');
        this.openExternalLink(url);
    },

    /**
     * Show upgrade banner in review state
     */
    showUpgradeBanner() {
        const banner = document.getElementById('upgrade-banner');
        if (banner) banner.classList.remove('hidden');
    },

    /**
     * Hide upgrade banner
     */
    hideUpgradeBanner() {
        const banner = document.getElementById('upgrade-banner');
        if (banner) banner.classList.add('hidden');
    },

    /**
     * Show an inline warning message in the review state without blocking the UI.
     * The message auto-dismisses after 4 seconds.
     * @param {string} message
     */
    showReviewWarning(message) {
        let warningEl = document.getElementById('review-warning-bar');
        if (!warningEl) {
            warningEl = document.createElement('div');
            warningEl.id = 'review-warning-bar';
            warningEl.style.cssText = [
                'padding: 8px 12px',
                'margin: 0 0 12px 0',
                'background: rgba(255,187,51,0.15)',
                'border: 1px solid var(--warning)',
                'border-radius: var(--radius)',
                'font-size: 11px',
                'color: var(--warning)',
                'line-height: 1.4',
                'transition: opacity 0.3s'
            ].join(';');

            // Insert above the action buttons
            const actionButtons = document.querySelector('.action-buttons');
            if (actionButtons) {
                actionButtons.parentNode.insertBefore(warningEl, actionButtons);
            }
        }

        warningEl.textContent = message;
        warningEl.style.opacity = '1';
        warningEl.style.display = 'block';

        clearTimeout(this._reviewWarningTimer);
        this._reviewWarningTimer = setTimeout(() => {
            warningEl.style.opacity = '0';
            setTimeout(() => { warningEl.style.display = 'none'; }, 300);
        }, 4000);
    }
};

// Export for use in CEP
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIController;
}
