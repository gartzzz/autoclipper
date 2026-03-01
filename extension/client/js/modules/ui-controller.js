/**
 * UI Controller Module
 * Manages state transitions and UI updates for AutoClipper panel
 */

const UIController = {
    // Current state
    currentState: 'setup',

    // Backend: 'openrouter' or 'ollama'
    currentBackend: 'openrouter',

    // Data
    segments: [],
    viralClips: [],
    approvedClips: [],
    currentClipIndex: 0,

    // Model status (Ollama)
    _isKeepWarmActive: false,
    _keepWarmInterval: null,
    _modelCheckInterval: null,

    // DOM elements (cached on init)
    elements: {},

    /**
     * Initialize the UI controller
     */
    init() {
        this.cacheElements();
        this.bindEvents();
        this.bindKeyboardShortcuts();
        this.loadBackendPreference();

        // Check if configured based on backend
        if (!this.isBackendConfigured()) {
            this.setState('settings');
        } else {
            this.setState('setup');
        }
    },

    /**
     * Check if current backend is configured
     */
    isBackendConfigured() {
        if (this.currentBackend === 'ollama') {
            return OllamaClient.isConfigured();
        } else {
            return OpenRouterClient.hasApiKey();
        }
    },

    /**
     * Get current AI client based on selected backend
     */
    getAIClient() {
        return this.currentBackend === 'ollama' ? OllamaClient : OpenRouterClient;
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
            getKeyLink: document.getElementById('get-key-link'),

            // Backend selector
            backendOpenrouter: document.getElementById('backend-openrouter'),
            backendOllama: document.getElementById('backend-ollama'),
            openrouterConfig: document.getElementById('openrouter-config'),
            ollamaConfig: document.getElementById('ollama-config'),
            ollamaUrlInput: document.getElementById('ollama-url-input'),
            ollamaModelSelect: document.getElementById('ollama-model-select'),
            refreshModelsBtn: document.getElementById('refresh-models-btn'),

            // Model status indicator (Ollama only)
            modelStatus: document.getElementById('model-status'),
            modelStatusDot: document.getElementById('model-status-dot'),
            modelStatusText: document.getElementById('model-status-text'),
            modelPowerBtn: document.getElementById('model-power-btn')
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

        // Settings actions
        elements.saveKeyBtn.addEventListener('click', () => this.saveSettings());
        elements.backFromSettings.addEventListener('click', () => {
            if (this.isBackendConfigured()) {
                this.setState('setup');
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

        // Backend selector
        elements.backendOpenrouter.addEventListener('click', () => this.selectBackend('openrouter'));
        elements.backendOllama.addEventListener('click', () => this.selectBackend('ollama'));

        // Ollama controls
        elements.refreshModelsBtn.addEventListener('click', () => this.refreshOllamaModels());
        elements.ollamaModelSelect.addEventListener('change', (e) => {
            OllamaClient.setModel(e.target.value);
        });

        // Model power button (keep warm / unload)
        elements.modelPowerBtn?.addEventListener('click', () => this.toggleKeepWarm());

        // Export help - open AutoClipper bin
        document.getElementById('open-bin-btn')?.addEventListener('click', () => {
            if (typeof csInterface !== 'undefined') {
                csInterface.evalScript('revealAutoClipperBin()');
            }
        });
    },

    /**
     * Select backend
     */
    selectBackend(backend) {
        const { elements } = this;
        this.currentBackend = backend;

        // Update buttons
        elements.backendOpenrouter.classList.toggle('active', backend === 'openrouter');
        elements.backendOllama.classList.toggle('active', backend === 'ollama');

        // Show/hide config panels
        elements.openrouterConfig.classList.toggle('hidden', backend !== 'openrouter');
        elements.ollamaConfig.classList.toggle('hidden', backend !== 'ollama');

        // Show/hide model status indicator (Ollama only)
        if (backend === 'ollama') {
            elements.modelStatus?.classList.remove('hidden');
            this.startModelStatusPolling();
        } else {
            elements.modelStatus?.classList.add('hidden');
            this.stopModelStatusPolling();
        }

        // Save preference
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('autoclipper_backend', backend);
        }

        // If switching to Ollama, auto-detect models
        if (backend === 'ollama') {
            this.refreshOllamaModels();
        }
    },

    /**
     * Load saved backend preference
     */
    loadBackendPreference() {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('autoclipper_backend');
            if (saved === 'ollama') {
                this.selectBackend('ollama');
                // Load saved Ollama settings
                const savedUrl = OllamaClient.getBaseUrl();
                const savedModel = OllamaClient.getModel();
                if (savedUrl) this.elements.ollamaUrlInput.value = savedUrl;
                if (savedModel) {
                    // Will be selected after model list loads
                }
            }
        }
    },

    /**
     * Refresh Ollama models list
     */
    async refreshOllamaModels() {
        const { elements } = this;

        // Update URL from input
        OllamaClient.setBaseUrl(elements.ollamaUrlInput.value);

        elements.refreshModelsBtn.textContent = 'Detectando...';
        elements.refreshModelsBtn.disabled = true;

        try {
            const models = await OllamaClient.listModels();

            elements.ollamaModelSelect.innerHTML = models.length === 0
                ? '<option value="">-- No hay modelos --</option>'
                : models.map(m => `<option value="${m.name}">${m.name}</option>`).join('');

            // Select saved model if available
            const savedModel = OllamaClient.getModel();
            if (savedModel && models.some(m => m.name === savedModel)) {
                elements.ollamaModelSelect.value = savedModel;
            } else if (models.length > 0) {
                // Auto-select first model
                OllamaClient.setModel(models[0].name);
            }

            if (models.length === 0) {
                elements.keyStatus.innerHTML = '<span style="color: var(--warning);">No hay modelos. Ejecuta: ollama pull qwen2.5:14b</span>';
                elements.keyStatus.classList.remove('hidden');
            }

        } catch (error) {
            elements.ollamaModelSelect.innerHTML = '<option value="">-- Error de conexion --</option>';
            elements.keyStatus.innerHTML = '<span style="color: var(--danger);">Ollama no esta corriendo. Ejecuta: ollama serve</span>';
            elements.keyStatus.classList.remove('hidden');
        }

        elements.refreshModelsBtn.textContent = 'Detectar modelos';
        elements.refreshModelsBtn.disabled = false;
    },

    /**
     * Start polling for model status (Ollama)
     */
    startModelStatusPolling() {
        // Stop any existing polling
        this.stopModelStatusPolling();

        // Check immediately
        this.updateModelStatus();

        // Check every 30 seconds (only when on relevant screens)
        this._modelCheckInterval = setInterval(() => {
            if (this.currentState === 'setup' || this.currentState === 'settings') {
                this.updateModelStatus();
            }
        }, 30000);
    },

    /**
     * Stop model status polling
     */
    stopModelStatusPolling() {
        if (this._modelCheckInterval) {
            clearInterval(this._modelCheckInterval);
            this._modelCheckInterval = null;
        }
        if (this._keepWarmInterval) {
            clearInterval(this._keepWarmInterval);
            this._keepWarmInterval = null;
        }
        this._isKeepWarmActive = false;
    },

    /**
     * Update model status indicator
     */
    async updateModelStatus() {
        const { elements } = this;
        if (!elements.modelStatusDot || !elements.modelStatusText) return;

        try {
            const isLoaded = await OllamaClient.isModelLoaded();
            const model = OllamaClient.getModel();

            if (isLoaded) {
                elements.modelStatusDot.className = 'status-dot loaded';
                elements.modelStatusText.textContent = model ? `${model} cargado` : 'Modelo cargado';
            } else {
                elements.modelStatusDot.className = 'status-dot';
                elements.modelStatusText.textContent = 'Modelo no cargado';
            }

            // Update power button state
            elements.modelPowerBtn?.classList.toggle('active', this._isKeepWarmActive);

        } catch (error) {
            elements.modelStatusDot.className = 'status-dot';
            elements.modelStatusText.textContent = 'Error de conexion';
        }
    },

    /**
     * Toggle keep warm mode
     */
    async toggleKeepWarm() {
        const { elements } = this;

        if (this._isKeepWarmActive) {
            // Deactivate keep warm
            if (this._keepWarmInterval) {
                clearInterval(this._keepWarmInterval);
                this._keepWarmInterval = null;
            }
            this._isKeepWarmActive = false;

            // Unload model
            await OllamaClient.unloadModel();
            console.log('[AutoClipper] Model unloaded from GPU');

        } else {
            // Activate keep warm
            this._isKeepWarmActive = true;

            // Keep warm immediately
            await OllamaClient.keepWarm();
            console.log('[AutoClipper] Keep warm activated (30 min)');

            // Refresh every 25 minutes to maintain warmth
            this._keepWarmInterval = setInterval(async () => {
                await OllamaClient.keepWarm();
                console.log('[AutoClipper] Keep warm refreshed');
            }, 25 * 60 * 1000);
        }

        // Update UI
        elements.modelPowerBtn?.classList.toggle('active', this._isKeepWarmActive);
        this.updateModelStatus();
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

        if (this.currentBackend === 'ollama') {
            // Save Ollama settings
            OllamaClient.setBaseUrl(elements.ollamaUrlInput.value);
            const model = elements.ollamaModelSelect.value;

            if (!model) {
                elements.keyStatus.innerHTML = '<span style="color: var(--danger);">Selecciona un modelo primero</span>';
                elements.keyStatus.classList.remove('hidden');
                return;
            }

            OllamaClient.setModel(model);

            // Test connection
            elements.saveKeyBtn.textContent = 'Verificando...';
            elements.saveKeyBtn.disabled = true;

            const health = await OllamaClient.checkHealth();

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

        } else {
            // Save OpenRouter settings
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

            // Load Ollama settings
            const ollamaUrl = OllamaClient.getBaseUrl();
            if (ollamaUrl) {
                this.elements.ollamaUrlInput.value = ollamaUrl;
            }

            // Clear status
            this.elements.keyStatus.classList.add('hidden');
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

    // Store last error for details view
    _lastError: null,

    /**
     * Start analysis
     */
    async startAnalysis() {
        // Check configuration first
        if (!this.isBackendConfigured()) {
            this.setState('settings');
            return;
        }

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
                }
            );

            if (this.viralClips.length === 0) {
                throw new Error('No se encontraron momentos virales');
            }

            // Initialize review state
            this.approvedClips = [];
            this.currentClipIndex = 0;
            this.updateReviewUI();
            this.setState('review');

        } catch (error) {
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
        // OpenRouter doesn't support cancel, just go back
        this.setState('setup');
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

        this.elements.clipCounter.textContent = `[Clip ${current}/${total}]`;
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

        // Make dots clickable
        this.elements.progressDots.querySelectorAll('.dot').forEach(dot => {
            dot.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.goToClip(index);
            });
        });
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
        this.viralClips[this.currentClipIndex].approved = true;
        this.viralClips[this.currentClipIndex].rejected = false;
        this.viralClips[this.currentClipIndex].skipped = false;
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
        if (typeof csInterface !== 'undefined') {
            csInterface.evalScript(`playClipRange(${clip.startTime}, ${clip.endTime})`, (result) => {
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
        const skippedCount = this.viralClips.filter(clip => clip.skipped).length;
        const rejectedCount = this.viralClips.filter(clip => clip.rejected).length;

        if (this.approvedClips.length === 0) {
            let msg = 'No aprobaste ningun clip.';
            if (skippedCount > 0) {
                msg += ` Tienes ${skippedCount} sin revisar (usa flechas arriba/abajo para navegar).`;
            } else {
                msg += ' Vuelve a revisar.';
            }
            alert(msg);
            this.currentClipIndex = 0;
            this.updateReviewUI();
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
                <span class="title">${starPrefix}${clip.suggestedTitle || 'Clip'}</span>
                <span class="preset-badge">&#9889;</span>
            </div>
        `;
        }).join('');

        this.elements.approvedList.innerHTML = listHTML;
    },

    /**
     * Go back to review from generate
     */
    goBackToReview() {
        this.currentClipIndex = 0;
        this.updateReviewUI();
        this.setState('review');
    },

    /**
     * Start generating sequences
     */
    async startGeneration() {
        // Check if host script is loaded
        if (typeof isHostScriptLoaded === 'function' && !isHostScriptLoaded()) {
            alert('Error: ExtendScript no esta cargado.\n\nLas funciones de Premiere no estan disponibles.\nRevisa el panel de Debug para mas informacion.');
            this.addDebugLog('Generacion bloqueada: ExtendScript no cargado');
            return;
        }

        this.setState('generating');
        this.elements.generationProgress.style.width = '0%';

        const preset = this.elements.subtitlePreset.value;
        const total = this.approvedClips.length;

        // Initial list - all pending
        this.elements.generationList.innerHTML = this.approvedClips.map((clip, i) => `
            <div class="generation-item" id="gen-item-${i}">
                <span class="status-icon pending">○</span>
                <div>
                    <div class="title">${clip.suggestedTitle || `Clip ${i + 1}`}</div>
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
    }
};

// Export for use in CEP
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIController;
}
