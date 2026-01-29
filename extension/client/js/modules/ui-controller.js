/**
 * UI Controller Module
 * Manages state transitions and UI updates for AutoClipper panel
 */

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

    /**
     * Initialize the UI controller
     */
    init() {
        this.cacheElements();
        this.bindEvents();
        this.bindKeyboardShortcuts();
        this.setState('setup');
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

            // Setup
            transcriptInput: document.getElementById('transcript-input'),
            transcriptDrop: document.getElementById('transcript-drop'),
            transcriptInfo: document.getElementById('transcript-info'),
            wordCount: document.getElementById('word-count'),
            analyzeBtn: document.getElementById('analyze-btn'),

            // Review
            clipCounter: document.getElementById('clip-counter'),
            clipTitle: document.getElementById('clip-title'),
            clipPreview: document.getElementById('clip-preview'),
            clipTranscript: document.getElementById('clip-transcript'),
            clipTimecode: document.getElementById('clip-timecode'),
            clipScore: document.getElementById('clip-score'),
            rejectBtn: document.getElementById('reject-btn'),
            replayBtn: document.getElementById('replay-btn'),
            approveBtn: document.getElementById('approve-btn'),
            progressDots: document.getElementById('progress-dots'),
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

            // Generating
            generationProgress: document.getElementById('generation-progress-fill'),
            generationStatus: document.getElementById('generation-status'),
            generationList: document.getElementById('generation-list'),

            // Error
            errorMessage: document.getElementById('error-message'),
            retryBtn: document.getElementById('retry-btn'),
            fallbackBtn: document.getElementById('fallback-btn'),
            closeError: document.getElementById('close-error')
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

        // Analyze button
        elements.analyzeBtn.addEventListener('click', () => this.startAnalysis());

        // Review actions
        elements.rejectBtn.addEventListener('click', () => this.rejectClip());
        elements.approveBtn.addEventListener('click', () => this.approveClip());
        elements.replayBtn.addEventListener('click', () => this.replayClip());
        elements.backToSetup.addEventListener('click', () => this.setState('setup'));

        // Generate actions
        elements.generateBtn.addEventListener('click', () => this.startGeneration());
        elements.backToReview.addEventListener('click', () => this.goBackToReview());

        // Error actions
        elements.retryBtn.addEventListener('click', () => this.startAnalysis());
        elements.fallbackBtn.addEventListener('click', () => this.useFallbackDetection());
        elements.closeError.addEventListener('click', () => this.setState('setup'));

        // Cancel analysis
        elements.cancelAnalysis.addEventListener('click', () => this.cancelAnalysis());
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
     * Start analysis
     */
    async startAnalysis() {
        this.setState('analyzing');
        this.elements.analysisProgress.style.width = '0%';
        this.elements.momentsFound.textContent = '0 momentos encontrados';

        try {
            // Check server health first
            const health = await OllamaClient.checkHealth();
            if (!health.ok) {
                throw new Error(health.message);
            }

            this.elements.analysisStatus.textContent = 'Analizando transcripcion...';

            // Analyze transcript
            this.viralClips = await OllamaClient.analyzeTranscript(
                this.segments,
                {},
                (progress) => {
                    if (progress.progress !== undefined) {
                        this.elements.analysisProgress.style.width = `${progress.progress}%`;
                    }
                    if (progress.message) {
                        this.elements.analysisStatus.textContent = progress.message;
                    }
                    if (progress.momentsFound !== undefined) {
                        this.elements.momentsFound.textContent =
                            `${progress.momentsFound} momentos encontrados`;
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
            this.elements.errorMessage.textContent = error.message;
            this.setState('error');
        }
    },

    /**
     * Cancel ongoing analysis
     */
    async cancelAnalysis() {
        await OllamaClient.cancelAnalysis();
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

        this.elements.clipCounter.textContent = `[Clip ${current}/${total}]`;
        this.elements.clipTitle.textContent = clip.suggestedTitle || `Momento ${current}`;
        this.elements.clipTranscript.textContent = `"${clip.text || '...'}"`;
        this.elements.clipTimecode.textContent =
            `${SRTParser.formatTime(clip.startTime)} - ${SRTParser.formatTime(clip.endTime)}`;
        this.elements.clipScore.textContent = `${clip.viralScore || 0}%`;

        // Update progress dots
        this.updateProgressDots();
    },

    /**
     * Update progress dots
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
            }
            return `<div class="${className}"></div>`;
        }).join('');

        this.elements.progressDots.innerHTML = dots;
    },

    /**
     * Reject current clip and move to next
     */
    rejectClip() {
        this.viralClips[this.currentClipIndex].rejected = true;
        this.viralClips[this.currentClipIndex].approved = false;
        this.nextClip();
    },

    /**
     * Approve current clip and move to next
     */
    approveClip() {
        this.viralClips[this.currentClipIndex].approved = true;
        this.viralClips[this.currentClipIndex].rejected = false;
        this.nextClip();
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

        // Call ExtendScript to set playhead and play
        if (typeof csInterface !== 'undefined') {
            csInterface.evalScript(`playClipRange(${clip.startTime}, ${clip.endTime})`);
        }
    },

    /**
     * Finish review and show generate state
     */
    finishReview() {
        this.approvedClips = this.viralClips.filter(clip => clip.approved);

        if (this.approvedClips.length === 0) {
            alert('No aprobaste ningun clip. Vuelve a revisar.');
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

        const listHTML = this.approvedClips.map(clip => `
            <div class="approved-item">
                <span class="check">&#10003;</span>
                <span class="title">${clip.suggestedTitle || 'Clip'}</span>
                <span class="preset-badge">&#9889;</span>
            </div>
        `).join('');

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
        this.setState('generating');
        this.elements.generationProgress.style.width = '0%';

        const preset = this.elements.subtitlePreset.value;
        const total = this.approvedClips.length;

        // Initial list
        this.elements.generationList.innerHTML = this.approvedClips.map((clip, i) => `
            <div class="generation-item" id="gen-item-${i}">
                <span class="status-icon pending">○</span>
                <div>
                    <div class="title">${clip.suggestedTitle || `Clip ${i + 1}`}</div>
                    <div class="subtitle">Esperando...</div>
                </div>
            </div>
        `).join('');

        for (let i = 0; i < total; i++) {
            const clip = this.approvedClips[i];
            const item = document.getElementById(`gen-item-${i}`);

            // Update to working
            item.querySelector('.status-icon').textContent = '⟳';
            item.querySelector('.status-icon').className = 'status-icon working';
            item.querySelector('.subtitle').textContent = 'Creando secuencia...';

            try {
                // Call ExtendScript to create sequence
                if (typeof csInterface !== 'undefined') {
                    await new Promise((resolve, reject) => {
                        csInterface.evalScript(
                            `createSequenceFromClip(${JSON.stringify(clip)}, "${preset}")`,
                            (result) => {
                                if (result === 'error') {
                                    reject(new Error('Failed to create sequence'));
                                } else {
                                    resolve(result);
                                }
                            }
                        );
                    });
                } else {
                    // Simulate for testing
                    await new Promise(r => setTimeout(r, 1000));
                }

                // Update to done
                item.querySelector('.status-icon').textContent = '✓';
                item.querySelector('.status-icon').className = 'status-icon done';
                item.querySelector('.subtitle').textContent = 'Completado';

            } catch (error) {
                item.querySelector('.status-icon').textContent = '✗';
                item.querySelector('.status-icon').className = 'status-icon error';
                item.querySelector('.subtitle').textContent = 'Error';
            }

            // Update progress
            this.elements.generationProgress.style.width = `${((i + 1) / total) * 100}%`;
            this.elements.generationStatus.textContent =
                `${i + 1}/${total} secuencias creadas`;
        }

        // Done - could show a completion message or return to setup
        this.elements.generationStatus.textContent = 'Generacion completada!';
    },

    /**
     * Use fallback detection (silence-based or energy-based)
     */
    useFallbackDetection() {
        // TODO: Implement fallback detection
        alert('Deteccion alternativa aun no implementada');
        this.setState('setup');
    }
};

// Export for use in CEP
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIController;
}
