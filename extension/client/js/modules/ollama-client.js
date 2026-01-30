/**
 * Ollama Client Module
 * Calls local Ollama server for 100% offline AI analysis
 */

const OllamaClient = {
    _baseUrl: 'http://localhost:11434',
    _model: null,

    // Context configuration
    // RTX 3080 (10GB) can handle ~24K context fully in GPU with 8B model
    // We calculate dynamically based on input size
    MIN_CONTEXT: 8192,      // Minimum context window
    MAX_CONTEXT: 32768,     // Max for 10GB VRAM (safe limit)
    CONTEXT_MARGIN: 4096,   // Extra space for output
    CHARS_PER_TOKEN: 3.5,   // Approximate chars per token

    /**
     * Set server URL
     */
    setBaseUrl(url) {
        this._baseUrl = url.replace(/\/$/, ''); // Remove trailing slash
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('autoclipper_ollama_url', this._baseUrl);
        }
    },

    /**
     * Get server URL
     */
    getBaseUrl() {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('autoclipper_ollama_url');
            if (saved) this._baseUrl = saved;
        }
        return this._baseUrl;
    },

    /**
     * Set model
     */
    setModel(model) {
        this._model = model;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('autoclipper_ollama_model', model);
        }
    },

    /**
     * Get model
     */
    getModel() {
        if (!this._model && typeof localStorage !== 'undefined') {
            this._model = localStorage.getItem('autoclipper_ollama_model');
        }
        return this._model;
    },

    /**
     * Check if Ollama is configured
     */
    isConfigured() {
        return !!this.getModel();
    },

    /**
     * Calculate optimal context size based on input
     * This ensures we use GPU efficiently - smaller context = faster inference
     */
    calculateOptimalContext(systemPrompt, userPrompt) {
        const totalChars = systemPrompt.length + userPrompt.length;
        const estimatedTokens = Math.ceil(totalChars / this.CHARS_PER_TOKEN);

        // Add margin for output and round up to nearest 2048
        const neededContext = estimatedTokens + this.CONTEXT_MARGIN;
        const roundedContext = Math.ceil(neededContext / 2048) * 2048;

        // Clamp between min and max
        const optimalContext = Math.max(this.MIN_CONTEXT, Math.min(this.MAX_CONTEXT, roundedContext));

        console.log(`[AutoClipper] Input: ~${estimatedTokens} tokens, Context: ${optimalContext}`);
        return optimalContext;
    },

    /**
     * List available models
     */
    async listModels() {
        try {
            const response = await fetch(`${this.getBaseUrl()}/api/tags`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            return data.models || [];
        } catch (error) {
            console.error('Failed to list Ollama models:', error);
            return [];
        }
    },

    /**
     * Check if Ollama server is available
     */
    async checkHealth() {
        const model = this.getModel();
        if (!model) {
            return {
                ok: false,
                message: 'No model selected. Click "Detect models" first.'
            };
        }

        try {
            const response = await fetch(`${this.getBaseUrl()}/api/tags`);
            if (!response.ok) {
                return {
                    ok: false,
                    message: `Ollama not running (HTTP ${response.status})`
                };
            }

            const data = await response.json();
            const models = data.models || [];
            const hasModel = models.some(m => m.name === model || m.name.startsWith(model));

            if (!hasModel) {
                return {
                    ok: false,
                    message: `Model "${model}" not found. Run: ollama pull ${model}`
                };
            }

            return { ok: true, message: `Connected to Ollama (${model})` };
        } catch (error) {
            return {
                ok: false,
                message: 'Ollama not running. Start it with: ollama serve'
            };
        }
    },

    // Store last raw response for debugging
    _lastRawResponse: '',

    /**
     * Get the last raw response (for debugging)
     */
    getLastRawResponse() {
        return this._lastRawResponse;
    },

    /**
     * Analyze transcript for viral moments (with streaming)
     */
    async analyzeTranscript(segments, options = {}, onProgress = null) {
        const model = this.getModel();
        if (!model) {
            throw new Error('No Ollama model selected');
        }

        const {
            minClipDuration = 15,
            maxClipDuration = 90,
            targetCount = 10,
            contentType = 'general'
        } = options;

        const systemPrompt = this.getSystemPrompt();
        const transcript = this.formatTranscript(segments);
        const userPrompt = this.buildUserPrompt(transcript, {
            targetCount,
            minDuration: minClipDuration,
            maxDuration: maxClipDuration,
            contentType
        });

        // Calculate optimal context size for this input
        const optimalContext = this.calculateOptimalContext(systemPrompt, userPrompt);
        const estimatedInputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / this.CHARS_PER_TOKEN);

        onProgress?.({
            progress: 5,
            message: `Conectando con ${model}...`,
            momentsFound: 0,
            tokensReceived: 0,
            contextInfo: `~${estimatedInputTokens} tokens input, ${optimalContext} contexto`
        });

        this._lastRawResponse = '';

        try {
            const response = await fetch(`${this.getBaseUrl()}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    stream: true,
                    options: {
                        temperature: 0.7,
                        num_ctx: optimalContext,  // Dynamic context based on input
                        num_gpu: 999  // Force all layers to GPU
                    }
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || `HTTP ${response.status}`);
            }

            // Process stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let thinkingContent = '';
            let isThinking = false;
            let tokensReceived = 0;
            let lastProgressUpdate = Date.now();
            const startTime = Date.now();

            onProgress?.({
                progress: 10,
                message: 'Modelo pensando...',
                momentsFound: 0,
                tokensReceived: 0
            });

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        const token = data.message?.content || '';
                        fullContent += token;
                        tokensReceived++;

                        // Detect thinking tags from DeepSeek R1
                        if (token.includes('<think>') || fullContent.includes('<think>') && !fullContent.includes('</think>')) {
                            isThinking = true;
                        }
                        if (isThinking) {
                            thinkingContent += token;
                        }
                        if (token.includes('</think>')) {
                            isThinking = false;
                        }

                        // Update progress every 100ms to avoid UI flooding
                        const now = Date.now();
                        if (now - lastProgressUpdate > 100) {
                            lastProgressUpdate = now;

                            // Calculate progress (10-80% during generation)
                            const progressPct = Math.min(80, 10 + (tokensReceived / 50));

                            // Calculate tokens per second
                            const elapsedSec = (now - startTime) / 1000;
                            const tokensPerSec = elapsedSec > 0 ? (tokensReceived / elapsedSec).toFixed(1) : 0;

                            // Extract last meaningful part of thinking
                            let thinkingPreview = '';
                            if (thinkingContent) {
                                const cleanThinking = thinkingContent
                                    .replace(/<\/?think>/g, '')
                                    .trim();
                                // Get last 300 chars
                                thinkingPreview = cleanThinking.slice(-300);
                            }

                            onProgress?.({
                                progress: progressPct,
                                message: isThinking ? 'Razonando...' : 'Generando respuesta...',
                                momentsFound: 0,
                                tokensReceived,
                                tokensPerSec,
                                thinking: thinkingPreview,
                                isThinking
                            });
                        }

                    } catch (e) {
                        // Skip malformed JSON lines
                    }
                }
            }

            // Store raw response for debugging
            this._lastRawResponse = fullContent;
            console.log('[AutoClipper Ollama] Full response:', fullContent);
            console.log('[AutoClipper Ollama] Tokens received:', tokensReceived);

            onProgress?.({
                progress: 85,
                message: 'Analizando respuesta...',
                momentsFound: 0,
                tokensReceived
            });

            // Extract content after </think> if present
            let contentToParse = fullContent;
            if (fullContent.includes('</think>')) {
                contentToParse = fullContent.split('</think>').pop() || fullContent;
            }

            if (!contentToParse.trim()) {
                const error = new Error('El modelo no devolvio contenido parseable');
                error.rawResponse = fullContent;
                throw error;
            }

            // Parse clips from response
            const clips = this.parseClipsFromResponse(contentToParse);
            console.log('[AutoClipper Ollama] Parsed clips:', clips.length);

            onProgress?.({
                progress: 90,
                message: `Filtrando ${clips.length} clips...`,
                momentsFound: clips.length,
                tokensReceived
            });

            // Filter and sort
            const validClips = clips
                .filter(clip => this.isValidClip(clip, { minClipDuration, maxClipDuration }))
                .sort((a, b) => b.viralScore - a.viralScore)
                .slice(0, targetCount);

            console.log('[AutoClipper Ollama] Valid clips after filter:', validClips.length);

            // Remove overlaps
            const finalClips = this.removeOverlaps(validClips);

            onProgress?.({
                progress: 100,
                message: 'Completado',
                momentsFound: finalClips.length,
                tokensReceived
            });

            // If no clips found, throw with details
            if (finalClips.length === 0) {
                const error = new Error(
                    clips.length === 0
                        ? 'El modelo no encontro momentos virales en el JSON'
                        : `Se encontraron ${clips.length} clips pero ninguno paso los filtros (score>=55, duracion 15-90s)`
                );
                error.rawResponse = fullContent;
                error.parsedClips = clips;
                throw error;
            }

            return finalClips;

        } catch (error) {
            console.error('Ollama analysis error:', error);
            // Attach raw response to error if not already attached
            if (!error.rawResponse) {
                error.rawResponse = this._lastRawResponse;
            }
            throw error;
        }
    },

    /**
     * Format segments into timestamped transcript
     */
    formatTranscript(segments) {
        return segments
            .map(seg => `[${this.formatTime(seg.start)}] ${seg.text}`)
            .join('\n');
    },

    /**
     * Format seconds to MM:SS
     */
    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    },

    /**
     * System prompt (same as OpenRouter client)
     */
    getSystemPrompt() {
        return `You are an expert at identifying viral clips from educational content, coaching sessions, and mentorship calls.

TARGET: Short-form clips (15-90s) for TikTok, Reels, Shorts from classes and mentoring sessions.

SCORING FORMULA - Calculate viralScore as weighted average:
- insight (25%): Mentor reveals something that shifts perspective, "aha moment"
- raw (20%): Unfiltered language, slang, brutal honesty, strong personality - MORE IS BETTER
- actionable (20%): Specific advice viewer can apply immediately
- hook (15%): Opening grabs attention, creates curiosity or shock
- relatable (10%): Addresses common struggle/question
- standalone (10%): Makes complete sense without prior context

SCORE CALIBRATION:
- 85-100: Gold - perspective-shifting insight with clear takeaway
- 70-84: Strong - valuable advice with good hook
- 55-69: Decent - needs strong editing/hook overlay
- Below 55: Skip

You MUST respond with valid JSON only. No explanations outside the JSON.`;
    },

    /**
     * Build user prompt
     */
    buildUserPrompt(transcript, options) {
        return `Analyze this transcript and find the most viral-worthy moments.

TRANSCRIPT:
${transcript}

REQUIREMENTS:
- Find ${options.targetCount} clips between ${options.minDuration} and ${options.maxDuration} seconds
- Each clip must make sense as standalone content
- Prioritize by viralScore, not chronological order

Respond with a JSON array of clips. Each clip must have:
- startTime: number (seconds from transcript timestamps)
- endTime: number (seconds)
- text: string (the actual transcript text for this clip)
- viralScore: number (0-100)
- suggestedTitle: string (catchy title for the clip)
- reasoning: string (brief explanation)

Return ONLY the JSON array, no other text.`;
    },

    /**
     * Parse clips from LLM response
     */
    parseClipsFromResponse(response) {
        try {
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.warn('No JSON array found in response');
                return [];
            }

            const parsed = JSON.parse(jsonMatch[0]);

            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed
                .filter(clip =>
                    typeof clip.startTime === 'number' &&
                    typeof clip.endTime === 'number' &&
                    typeof clip.viralScore === 'number'
                )
                .map(clip => ({
                    startTime: clip.startTime,
                    endTime: clip.endTime,
                    text: clip.text || '',
                    viralScore: Math.min(100, Math.max(0, clip.viralScore)),
                    factors: clip.factors || {},
                    hookSuggestion: clip.hookSuggestion || '',
                    suggestedTitle: clip.suggestedTitle || 'Untitled Clip',
                    hashtags: Array.isArray(clip.hashtags) ? clip.hashtags : [],
                    reasoning: clip.reasoning || ''
                }));

        } catch (error) {
            console.error('Failed to parse clips:', error);
            return [];
        }
    },

    /**
     * Validate clip meets criteria
     */
    isValidClip(clip, options) {
        const duration = clip.endTime - clip.startTime;
        return (
            duration >= options.minClipDuration &&
            duration <= options.maxClipDuration &&
            clip.viralScore >= 55 &&
            clip.startTime >= 0 &&
            clip.endTime > clip.startTime
        );
    },

    /**
     * Remove overlapping clips
     */
    removeOverlaps(clips) {
        const result = [];
        for (const clip of clips) {
            const hasOverlap = result.some(existing =>
                (clip.startTime >= existing.startTime && clip.startTime < existing.endTime) ||
                (clip.endTime > existing.startTime && clip.endTime <= existing.endTime) ||
                (clip.startTime <= existing.startTime && clip.endTime >= existing.endTime)
            );
            if (!hasOverlap) {
                result.push(clip);
            }
        }
        return result;
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OllamaClient;
}
