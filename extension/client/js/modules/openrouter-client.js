/**
 * OpenRouter Client Module
 * Calls OpenRouter API directly from CEP panel (no server needed)
 * Uses DeepSeek R1 (deepseek/deepseek-r1:free) - 64K context, optimized for reasoning
 */

const OpenRouterClient = {
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'deepseek/deepseek-r1-0528:free',  // 64K context, optimizado para razonamiento

    // Context window limits (tokens)
    MODEL_CONTEXT_LIMIT: 64000,   // 64K tokens
    MAX_OUTPUT_TOKENS: 8192,      // Más espacio para respuesta detallada
    // Reserve tokens for output, leaving this for input
    get MAX_INPUT_TOKENS() { return this.MODEL_CONTEXT_LIMIT - this.MAX_OUTPUT_TOKENS; },
    // Approximate chars per token (conservative estimate for mixed content)
    CHARS_PER_TOKEN: 3.5,

    // API key - loaded from config or set directly
    _apiKey: null,

    /**
     * Set the API key
     */
    setApiKey(key) {
        this._apiKey = key;
        // Save to localStorage for persistence
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('autoclipper_openrouter_key', key);
        }
    },

    /**
     * Get the API key
     */
    getApiKey() {
        if (this._apiKey) return this._apiKey;

        // Try localStorage
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('autoclipper_openrouter_key');
            if (saved) {
                this._apiKey = saved;
                return saved;
            }
        }

        return null;
    },

    /**
     * Check if API key is configured
     */
    hasApiKey() {
        return !!this.getApiKey();
    },

    /**
     * Check if OpenRouter is available
     */
    async checkHealth() {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            return {
                ok: false,
                message: 'API key not configured. Get one free at openrouter.ai/keys'
            };
        }

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/gartzzz/autoclipper',
                    'X-Title': 'AutoClipper'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 5
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                return {
                    ok: false,
                    message: error.error?.message || `HTTP ${response.status}`
                };
            }

            return { ok: true, message: `Connected to ${this.model}` };
        } catch (error) {
            return {
                ok: false,
                message: error.message || 'Connection failed'
            };
        }
    },

    /**
     * Analyze transcript for viral moments
     */
    async analyzeTranscript(segments, options = {}, onProgress = null) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('API key not configured');
        }

        const {
            minClipDuration = 30,  // Minimum 30 seconds for a proper clip
            maxClipDuration = 90,
            minViralScore = 50,  // Lower threshold - user filters manually
            contentType = 'general'
        } = options;

        // Build prompts and check context limit
        const systemPrompt = this.getSystemPrompt();
        const promptOptions = {
            minViralScore,
            minDuration: minClipDuration,
            maxDuration: maxClipDuration,
            contentType
        };

        // Truncate transcript if needed to fit context window
        const truncateResult = this.truncateTranscriptToFit(segments, systemPrompt, promptOptions);
        const transcript = truncateResult.transcript;

        if (truncateResult.wasTruncated) {
            const percentUsed = Math.round((truncateResult.usedSegments / truncateResult.originalSegments) * 100);
            console.warn(`[AutoClipper] Transcript truncated to fit context window: ${truncateResult.usedSegments}/${truncateResult.originalSegments} segments (${percentUsed}%)`);
            onProgress?.({
                progress: 5,
                message: `⚠️ Transcript truncated (${percentUsed}% fits in context)`,
                momentsFound: 0,
                warning: `Video too long for AI context. Analyzing first ${truncateResult.usedSegments} of ${truncateResult.originalSegments} segments.`
            });
        }

        onProgress?.({
            progress: 10,
            message: `Sending to AI... (~${truncateResult.estimatedTokens} tokens)`,
            momentsFound: 0
        });

        const userPrompt = this.buildUserPrompt(transcript, promptOptions);

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/gartzzz/autoclipper',
                    'X-Title': 'AutoClipper'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 4096
                })
            });

            onProgress?.({
                progress: 70,
                message: 'Processing response...',
                momentsFound: 0
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || `HTTP ${response.status}`);
            }

            const data = await response.json();
            console.log('[AutoClipper] API Response:', JSON.stringify(data, null, 2));

            // DeepSeek R1 puede devolver reasoning en campo separado
            const message = data.choices?.[0]?.message;
            const content = message?.content || message?.reasoning_content || '';

            if (!content) {
                console.error('[AutoClipper] Empty response. Full data:', data);
                throw new Error('No response from AI - check console for details');
            }

            // Parse clips from response
            const clips = this.parseClipsFromResponse(content);

            onProgress?.({
                progress: 90,
                message: 'Filtering clips...',
                momentsFound: clips.length
            });

            // Filter and sort by viral score (no fixed limit - quality threshold instead)
            const validClips = clips
                .filter(clip => this.isValidClip(clip, { minClipDuration, maxClipDuration }))
                .sort((a, b) => b.viralScore - a.viralScore);

            // Remove overlaps
            const deduped = this.removeOverlaps(validClips);

            // Smart filtering: all high quality + limited medium quality
            // No total limit - long mentorships can have 20+ good clips
            const highQuality = deduped.filter(c => c.viralScore >= 70);
            const mediumQuality = deduped.filter(c => c.viralScore >= 50 && c.viralScore < 70).slice(0, 8);
            const finalClips = [...highQuality, ...mediumQuality].sort((a, b) => b.viralScore - a.viralScore);

            console.log('[AutoClipper] Smart filter: ' +
                `${highQuality.length} high (>=70) + ${mediumQuality.length} medium (50-69) = ${finalClips.length} total`);

            // Enrich clips with subtitle segments from original transcript
            for (const clip of finalClips) {
                const orderedSegs = [...(clip.segments || [])].sort((a, b) => a.order - b.order);
                clip.subtitleSegments = [];
                for (const seg of orderedSegs) {
                    const matching = segments.filter(s =>
                        s.start >= seg.startTime && s.end <= seg.endTime
                    );
                    clip.subtitleSegments.push(...matching);
                }
            }

            onProgress?.({
                progress: 100,
                message: 'Complete',
                momentsFound: finalClips.length
            });

            return finalClips;

        } catch (error) {
            console.error('Analysis error:', error);
            throw error;
        }
    },

    /**
     * Estimate token count from text (conservative approximation)
     */
    estimateTokens(text) {
        return Math.ceil(text.length / this.CHARS_PER_TOKEN);
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
     * Truncate transcript to fit within context limit
     * Returns { transcript, wasTruncated, originalSegments, usedSegments }
     */
    truncateTranscriptToFit(segments, systemPrompt, options) {
        const baseUserPrompt = this.buildUserPrompt('', options);
        const baseTokens = this.estimateTokens(systemPrompt) + this.estimateTokens(baseUserPrompt);
        const availableTokens = this.MAX_INPUT_TOKENS - baseTokens - 100; // 100 token safety margin
        const availableChars = availableTokens * this.CHARS_PER_TOKEN;

        let transcript = '';
        let usedSegments = 0;

        for (const seg of segments) {
            const line = `[${this.formatTime(seg.start)}] ${seg.text}\n`;
            if (transcript.length + line.length > availableChars) {
                break;
            }
            transcript += line;
            usedSegments++;
        }

        return {
            transcript: transcript.trim(),
            wasTruncated: usedSegments < segments.length,
            originalSegments: segments.length,
            usedSegments,
            estimatedTokens: this.estimateTokens(systemPrompt + this.buildUserPrompt(transcript, options))
        };
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
     * System prompt for viral detection (optimized for classes/mentoring + irreverent brand)
     */
    getSystemPrompt() {
        return `You are an expert at identifying viral clips from educational content, coaching sessions, and mentorship calls.

TARGET: Short-form clips for TikTok, Reels, Shorts from classes and mentoring sessions.

CRITICAL DURATION RULE:
- Each clip MUST be a COMPLETE segment of at least 30 seconds
- Do NOT return single sentences or short fragments
- Find the FULL context: include setup + main point + conclusion
- Expand clips to include natural start/end points in conversation

SCORING FORMULA - Calculate viralScore as weighted average:
- insight (25%): Mentor reveals something that shifts perspective, "aha moment"
- raw (20%): Unfiltered language, slang, brutal honesty, strong personality
- actionable (20%): Specific advice viewer can apply immediately
- hook (15%): Opening grabs attention, creates curiosity or shock
- relatable (10%): Addresses common struggle/question
- standalone (10%): Makes complete sense without prior context

SCORE CALIBRATION (be generous - human will filter):
- 80-100: Gold - perspective-shifting insight with clear takeaway
- 60-79: Strong - valuable advice, worth reviewing
- 40-59: Potential - might work with good editing
- Below 40: Weak but still include if meets duration

BE GENEROUS: Include any segment that MIGHT be valuable. The human editor will make final decisions. Better to include too many than miss good content.

CLIP COMPOSITION:
- Most clips will be a single continuous segment. That's perfectly fine.
- When combining phrases from different parts would create a SIGNIFICANTLY more compelling clip, compose multi-segment clips.
- Use as many segments as needed to maximize viral impact — no artificial limit.
- Segments must be thematically connected.
- Use the "segments" array with "order" field to specify playback sequence.
- Reorder segments when it creates a stronger hook, narrative arc, or emotional payoff.
- Think like a video editor: what arrangement makes someone STOP scrolling?

PATTERNS TO IDENTIFY:
- "The real reason X doesn't work is..." (contrarian insight)
- "Most people think... but actually..." (myth-busting)
- "Here's what I tell all my students..." (insider knowledge)
- "The #1 mistake I see is..." (common problem)
- Student asks question → Mentor gives powerful answer
- Emotional breakthrough moment
- Concrete framework/steps explained simply
- Any coherent explanation of a concept (30+ seconds)

BONUS PATTERNS (brand voice):
- Raw, unfiltered language (slang, colloquialisms, swearing)
- Irreverent/provocative statements
- Direct, no-BS delivery
- Moments of brutal honesty

You MUST respond with valid JSON only. No explanations outside the JSON.`;
    },

    /**
     * Build user prompt
     */
    buildUserPrompt(transcript, options) {
        return `Analyze this transcript and find ALL potentially viral moments.

TRANSCRIPT:
${transcript}

CRITICAL REQUIREMENTS:
- MINIMUM ${options.minDuration} SECONDS per clip - this is mandatory, no exceptions
- Maximum ${options.maxDuration} seconds per clip
- Do NOT return short fragments or single sentences
- Include the FULL context: setup + main point + natural ending
- BE GENEROUS: include anything that MIGHT be useful, human will filter
- If a good moment is under ${options.minDuration}s, EXPAND it to include surrounding context

Respond with a JSON array of clips. Each clip must have:
- startTime: number (seconds — min start across all segments)
- endTime: number (seconds — max end across all segments)
- text: string (the actual transcript text in playback order)
- viralScore: number (0-100, calculated as: insight×0.25 + raw×0.20 + actionable×0.20 + hook×0.15 + relatable×0.10 + standalone×0.10)
- factors: {
    insight: number (0-100) - perspective shift, aha moment
    raw: number (0-100) - unfiltered language, personality
    actionable: number (0-100) - advice viewer can apply
    hook: number (0-100) - opening grabs attention
    relatable: number (0-100) - common problem
    standalone: number (0-100) - works without context
  }
- segments: array of {startTime, endTime, text, order} — playback order.
  For single continuous clips, use one segment.
  For composed clips, specify multiple segments with desired playback order (order 0 plays first).
- hookSuggestion: string (text overlay for first 3 seconds)
- suggestedTitle: string (catchy title)
- hashtags: array of 3-5 hashtags
- reasoning: string (why this moment has potential)

Return ONLY the JSON array, no other text.`;
    },

    /**
     * Parse clips from LLM response
     */
    parseClipsFromResponse(response) {
        try {
            // Extract JSON array from response
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
                .map(clip => {
                    // Build segments array (backward compat: single segment from startTime/endTime)
                    const segments = Array.isArray(clip.segments) && clip.segments.length > 0
                        ? clip.segments.map(seg => ({
                            startTime: parseFloat(seg.startTime),
                            endTime: parseFloat(seg.endTime),
                            text: seg.text || '',
                            order: parseInt(seg.order) || 0
                          })).sort((a, b) => a.order - b.order)
                        : [{ startTime: clip.startTime, endTime: clip.endTime, text: clip.text || '', order: 0 }];

                    // Check if playback order differs from chronological
                    const isReordered = segments.length > 1 &&
                        segments.some((seg, i) => i > 0 && seg.startTime < segments[i - 1].startTime);

                    return {
                        startTime: clip.startTime,
                        endTime: clip.endTime,
                        text: clip.text || '',
                        viralScore: Math.min(100, Math.max(0, clip.viralScore)),
                        factors: {
                            insight: clip.factors?.insight || 0,
                            raw: clip.factors?.raw || 0,
                            actionable: clip.factors?.actionable || 0,
                            hook: clip.factors?.hook || 0,
                            relatable: clip.factors?.relatable || 0,
                            standalone: clip.factors?.standalone || 0
                        },
                        segments,
                        isReordered,
                        hookSuggestion: clip.hookSuggestion || '',
                        suggestedTitle: clip.suggestedTitle || 'Untitled Clip',
                        hashtags: Array.isArray(clip.hashtags) ? clip.hashtags : [],
                        reasoning: clip.reasoning || ''
                    };
                });

        } catch (error) {
            console.error('Failed to parse clips:', error);
            return [];
        }
    },

    /**
     * Validate clip meets criteria
     * Note: Only filters by duration - user does manual quality filtering
     */
    isValidClip(clip, options) {
        const duration = clip.endTime - clip.startTime;
        return (
            duration >= options.minClipDuration &&
            duration <= options.maxClipDuration &&
            clip.viralScore >= 0 &&  // No score filtering - show all, user decides
            clip.startTime >= 0 &&
            clip.endTime > clip.startTime
        );
    },

    /**
     * Remove overlapping clips (supports multi-segment clips)
     */
    removeOverlaps(clips) {
        const result = [];
        for (const clip of clips) {
            const clipSegs = clip.segments || [{ startTime: clip.startTime, endTime: clip.endTime }];
            const hasOverlap = result.some(existing => {
                const existingSegs = existing.segments || [{ startTime: existing.startTime, endTime: existing.endTime }];
                return clipSegs.some(cs =>
                    existingSegs.some(es =>
                        cs.startTime < es.endTime && cs.endTime > es.startTime
                    )
                );
            });
            if (!hasOverlap) {
                result.push(clip);
            }
        }
        return result;
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OpenRouterClient;
}
