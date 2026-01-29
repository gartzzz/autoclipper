/**
 * OpenRouter Client Module
 * Calls OpenRouter API directly from CEP panel (no server needed)
 * Uses Kimi K2 (moonshotai/kimi-k2:free) - completely free model
 */

const OpenRouterClient = {
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'moonshotai/kimi-k2:free',

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
            minClipDuration = 15,
            maxClipDuration = 90,
            targetCount = 10,
            contentType = 'general'
        } = options;

        // Format transcript
        const transcript = this.formatTranscript(segments);

        onProgress?.({
            progress: 10,
            message: 'Sending to AI...',
            momentsFound: 0
        });

        // Build prompts
        const systemPrompt = this.getSystemPrompt();
        const userPrompt = this.buildUserPrompt(transcript, {
            targetCount,
            minDuration: minClipDuration,
            maxDuration: maxClipDuration,
            contentType
        });

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
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error('No response from AI');
            }

            // Parse clips from response
            const clips = this.parseClipsFromResponse(content);

            onProgress?.({
                progress: 90,
                message: 'Filtering clips...',
                momentsFound: clips.length
            });

            // Filter and sort
            const validClips = clips
                .filter(clip => this.isValidClip(clip, { minClipDuration, maxClipDuration }))
                .sort((a, b) => b.viralScore - a.viralScore)
                .slice(0, targetCount);

            // Remove overlaps
            const finalClips = this.removeOverlaps(validClips);

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
     * System prompt for viral detection
     */
    getSystemPrompt() {
        return `You are an expert content strategist and viral video analyst. Your task is to analyze video transcripts and identify moments with high viral potential for short-form content (TikTok, Instagram Reels, YouTube Shorts).

You understand what makes content go viral:
- Strong hooks in the first 3 seconds that stop the scroll
- Emotional triggers (surprise, joy, anger, fear, curiosity)
- Controversial or polarizing statements that drive engagement
- Unique insights or "aha moments" that viewers want to share
- Complete micro-stories with setup, conflict, and resolution
- Cliffhangers that make viewers watch until the end
- Humor and entertainment value

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
- Prioritize by viral potential, not chronological order
- Content type: ${options.contentType}

Respond with a JSON array of clips. Each clip must have:
- startTime: number (seconds from transcript timestamps)
- endTime: number (seconds)
- text: string (the actual transcript text for this clip)
- viralScore: number (0-100)
- factors: object with scores for: hook, emotion, controversy, insight, storytelling, cliffhanger, humor (each 0-100)
- suggestedTitle: string (catchy title for the clip)
- hashtags: array of 3-5 relevant hashtags
- reasoning: string (brief explanation of why this moment is viral)

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
                .map(clip => ({
                    startTime: clip.startTime,
                    endTime: clip.endTime,
                    text: clip.text || '',
                    viralScore: Math.min(100, Math.max(0, clip.viralScore)),
                    factors: {
                        hook: clip.factors?.hook || 0,
                        emotion: clip.factors?.emotion || 0,
                        controversy: clip.factors?.controversy || 0,
                        insight: clip.factors?.insight || 0,
                        storytelling: clip.factors?.storytelling || 0,
                        cliffhanger: clip.factors?.cliffhanger || 0,
                        humor: clip.factors?.humor || 0
                    },
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
            clip.viralScore >= 50 &&
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
    module.exports = OpenRouterClient;
}
