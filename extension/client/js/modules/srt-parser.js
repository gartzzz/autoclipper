/**
 * SRT/VTT Parser Module
 * Parses subtitle files and plain text transcripts into structured segments
 */

const SRTParser = {
    /**
     * Parse SRT format text
     * @param {string} text - Raw SRT content
     * @returns {Array<{id: string, start: number, end: number, text: string}>}
     */
    parseSRT(text) {
        const segments = [];
        const blocks = text.trim().split(/\n\n+/);

        for (const block of blocks) {
            const lines = block.split('\n');
            if (lines.length < 3) continue;

            const id = lines[0].trim();
            const timecode = lines[1];
            const textLines = lines.slice(2).join(' ');

            const times = this.parseTimecode(timecode);
            if (times) {
                segments.push({
                    id,
                    start: times.start,
                    end: times.end,
                    text: this.cleanText(textLines)
                });
            }
        }

        return segments;
    },

    /**
     * Parse VTT format text
     * @param {string} text - Raw VTT content
     * @returns {Array<{id: string, start: number, end: number, text: string}>}
     */
    parseVTT(text) {
        // Remove WEBVTT header
        const content = text.replace(/^WEBVTT.*?\n\n/s, '');
        return this.parseSRT(content);
    },

    /**
     * Parse plain text (Premiere's Copy Transcript format)
     * Each line may have timestamp prefix or just be plain text
     * @param {string} text - Raw text content
     * @returns {Array<{id: string, start: number, end: number, text: string}>}
     */
    parsePlainText(text) {
        const segments = [];
        const lines = text.trim().split('\n');
        let currentTime = 0;
        const avgWordsPerSecond = 2.5;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Try to detect timestamp at start of line
            const timestampMatch = line.match(/^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*(.*)$/);

            let text, start, end;

            if (timestampMatch) {
                const hours = timestampMatch[3] ? parseInt(timestampMatch[1]) : 0;
                const mins = timestampMatch[3] ? parseInt(timestampMatch[2]) : parseInt(timestampMatch[1]);
                const secs = timestampMatch[3] ? parseInt(timestampMatch[3]) : parseInt(timestampMatch[2]);
                start = hours * 3600 + mins * 60 + secs;
                text = timestampMatch[4] || '';
            } else {
                text = line;
                start = currentTime;
            }

            if (text) {
                const wordCount = text.split(/\s+/).length;
                const duration = Math.max(wordCount / avgWordsPerSecond, 1);
                end = start + duration;
                currentTime = end;

                segments.push({
                    id: String(i + 1),
                    start,
                    end,
                    text: this.cleanText(text)
                });
            }
        }

        return segments;
    },

    /**
     * Auto-detect format and parse
     * @param {string} text - Raw content
     * @returns {Array<{id: string, start: number, end: number, text: string}>}
     */
    parse(text) {
        text = text.trim();

        if (text.startsWith('WEBVTT')) {
            return this.parseVTT(text);
        }

        // Check if it looks like SRT (numbered blocks with timecodes)
        if (/^\d+\s*\n\d{2}:\d{2}:\d{2}/.test(text)) {
            return this.parseSRT(text);
        }

        // Default to plain text parsing
        return this.parsePlainText(text);
    },

    /**
     * Parse SRT/VTT timecode line
     * @param {string} timecode - e.g., "00:01:23,456 --> 00:01:25,789"
     * @returns {{start: number, end: number} | null}
     */
    parseTimecode(timecode) {
        const match = timecode.match(
            /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
        );

        if (!match) return null;

        const start =
            parseInt(match[1]) * 3600 +
            parseInt(match[2]) * 60 +
            parseInt(match[3]) +
            parseInt(match[4]) / 1000;

        const end =
            parseInt(match[5]) * 3600 +
            parseInt(match[6]) * 60 +
            parseInt(match[7]) +
            parseInt(match[8]) / 1000;

        return { start, end };
    },

    /**
     * Clean subtitle text
     * @param {string} text
     * @returns {string}
     */
    cleanText(text) {
        return text
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/\{[^}]+\}/g, '') // Remove ASS/SSA tags
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    },

    /**
     * Count words in segments
     * @param {Array} segments
     * @returns {number}
     */
    countWords(segments) {
        return segments.reduce((total, seg) => {
            return total + seg.text.split(/\s+/).filter(w => w).length;
        }, 0);
    },

    /**
     * Merge segments into chunks for LLM processing
     * @param {Array} segments
     * @param {number} maxChars - Max characters per chunk
     * @returns {Array<{start: number, end: number, text: string}>}
     */
    chunkSegments(segments, maxChars = 6000) {
        const chunks = [];
        let current = { start: 0, end: 0, text: '' };

        for (const seg of segments) {
            const addition = `[${this.formatTime(seg.start)}] ${seg.text}\n`;

            if (current.text.length + addition.length > maxChars && current.text) {
                chunks.push({ ...current });
                current = { start: seg.start, end: seg.end, text: addition };
            } else {
                if (!current.text) current.start = seg.start;
                current.text += addition;
                current.end = seg.end;
            }
        }

        if (current.text) {
            chunks.push(current);
        }

        return chunks;
    },

    /**
     * Format seconds to timecode string
     * @param {number} seconds
     * @returns {string}
     */
    formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
};

// Export for use in CEP
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SRTParser;
}
