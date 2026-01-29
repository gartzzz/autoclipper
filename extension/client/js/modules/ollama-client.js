/**
 * Ollama Client Module
 * Handles communication with the local AutoClipper server (which proxies to Ollama)
 */

const OllamaClient = {
    serverUrl: 'http://127.0.0.1:3847',

    /**
     * Check if the server is running and Ollama is available
     * @returns {Promise<{ok: boolean, message: string}>}
     */
    async checkHealth() {
        try {
            const response = await fetch(`${this.serverUrl}/api/analyze/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}`);
            }

            const data = await response.json();
            return { ok: true, message: data.message || 'Connected' };
        } catch (error) {
            return {
                ok: false,
                message: error.message || 'Cannot connect to AutoClipper server'
            };
        }
    },

    /**
     * Analyze transcript for viral moments
     * @param {Array<{start: number, end: number, text: string}>} segments - Transcript segments
     * @param {Object} options - Analysis options
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<Array<ViralClip>>}
     */
    async analyzeTranscript(segments, options = {}, onProgress = null) {
        const {
            minClipDuration = 15,
            maxClipDuration = 90,
            targetCount = 10,
            contentType = 'general'
        } = options;

        try {
            const response = await fetch(`${this.serverUrl}/api/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    segments,
                    options: {
                        minClipDuration,
                        maxClipDuration,
                        targetCount,
                        contentType
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Analysis failed: ${response.status}`);
            }

            // Handle streaming response
            if (response.headers.get('content-type')?.includes('text/event-stream')) {
                return await this.handleStreamResponse(response, onProgress);
            }

            const data = await response.json();
            return data.clips || [];
        } catch (error) {
            console.error('Analysis error:', error);
            throw error;
        }
    },

    /**
     * Handle Server-Sent Events streaming response
     * @param {Response} response
     * @param {Function} onProgress
     * @returns {Promise<Array<ViralClip>>}
     */
    async handleStreamResponse(response, onProgress) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let clips = [];
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.type === 'progress' && onProgress) {
                            onProgress({
                                progress: data.progress,
                                message: data.message,
                                momentsFound: data.momentsFound || clips.length
                            });
                        } else if (data.type === 'clip') {
                            clips.push(data.clip);
                            if (onProgress) {
                                onProgress({ momentsFound: clips.length });
                            }
                        } else if (data.type === 'complete') {
                            clips = data.clips || clips;
                        } else if (data.type === 'error') {
                            throw new Error(data.error);
                        }
                    } catch (e) {
                        if (e.message !== 'Unexpected end of JSON input') {
                            console.warn('Parse error:', e);
                        }
                    }
                }
            }
        }

        return clips;
    },

    /**
     * Cancel ongoing analysis
     * @returns {Promise<void>}
     */
    async cancelAnalysis() {
        try {
            await fetch(`${this.serverUrl}/api/analyze/cancel`, {
                method: 'POST'
            });
        } catch (error) {
            console.warn('Cancel request failed:', error);
        }
    },

    /**
     * Get available subtitle presets from Premiere
     * This calls ExtendScript via CSInterface
     * @returns {Promise<Array<{id: string, name: string}>>}
     */
    async getSubtitlePresets() {
        return new Promise((resolve) => {
            if (typeof csInterface !== 'undefined') {
                csInterface.evalScript('getSubtitlePresets()', (result) => {
                    try {
                        resolve(JSON.parse(result));
                    } catch {
                        resolve([
                            { id: 'viral_yellow', name: 'Viral Yellow' },
                            { id: 'minimal_white', name: 'Minimal White' },
                            { id: 'none', name: 'Sin subtitulos' }
                        ]);
                    }
                });
            } else {
                // Fallback for testing outside Premiere
                resolve([
                    { id: 'viral_yellow', name: 'Viral Yellow' },
                    { id: 'minimal_white', name: 'Minimal White' },
                    { id: 'none', name: 'Sin subtitulos' }
                ]);
            }
        });
    }
};

// Export for use in CEP
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OllamaClient;
}
