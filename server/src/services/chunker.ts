/**
 * Transcript Chunker
 * Splits long transcripts into manageable chunks for LLM processing
 */

export interface TranscriptChunk {
  text: string;
  startOffset: number; // Time offset in seconds for the start of this chunk
  endOffset: number;
}

/**
 * Chunk a transcript into smaller pieces
 * Uses overlap to avoid missing clips at boundaries
 */
export function chunkTranscript(
  transcript: string,
  maxChars: number = 24000, // ~6000 tokens for Qwen
  overlapSeconds: number = 30
): TranscriptChunk[] {
  // If transcript fits in one chunk, return as-is
  if (transcript.length <= maxChars) {
    return [{
      text: transcript,
      startOffset: 0,
      endOffset: extractEndTime(transcript)
    }];
  }

  const lines = transcript.split('\n');
  const chunks: TranscriptChunk[] = [];

  let currentChunk = '';
  let chunkStartTime = 0;
  let lastTimestamp = 0;
  let overlapBuffer: string[] = [];

  for (const line of lines) {
    // Extract timestamp from line if present
    const timeMatch = line.match(/^\[(\d+):(\d+)(?::(\d+))?\]/);
    if (timeMatch) {
      const hours = timeMatch[3] ? parseInt(timeMatch[1]) : 0;
      const mins = timeMatch[3] ? parseInt(timeMatch[2]) : parseInt(timeMatch[1]);
      const secs = timeMatch[3] ? parseInt(timeMatch[3]) : parseInt(timeMatch[2]);
      lastTimestamp = hours * 3600 + mins * 60 + secs;
    }

    // Check if adding this line would exceed limit
    if (currentChunk.length + line.length + 1 > maxChars && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        text: currentChunk.trim(),
        startOffset: chunkStartTime,
        endOffset: lastTimestamp
      });

      // Start new chunk with overlap
      currentChunk = overlapBuffer.join('\n') + '\n';
      chunkStartTime = lastTimestamp - overlapSeconds;
      overlapBuffer = [];
    }

    currentChunk += line + '\n';

    // Keep track of last N seconds for overlap
    if (timeMatch && lastTimestamp > 0) {
      overlapBuffer.push(line);
      // Trim overlap buffer to keep only last ~30 seconds worth
      while (overlapBuffer.length > 0) {
        const firstLine = overlapBuffer[0];
        const firstTimeMatch = firstLine.match(/^\[(\d+):(\d+)(?::(\d+))?\]/);
        if (firstTimeMatch) {
          const hours = firstTimeMatch[3] ? parseInt(firstTimeMatch[1]) : 0;
          const mins = firstTimeMatch[3] ? parseInt(firstTimeMatch[2]) : parseInt(firstTimeMatch[1]);
          const secs = firstTimeMatch[3] ? parseInt(firstTimeMatch[3]) : parseInt(firstTimeMatch[2]);
          const firstTime = hours * 3600 + mins * 60 + secs;

          if (lastTimestamp - firstTime > overlapSeconds) {
            overlapBuffer.shift();
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      startOffset: chunkStartTime,
      endOffset: lastTimestamp
    });
  }

  return chunks;
}

/**
 * Extract the last timestamp from a transcript
 */
function extractEndTime(transcript: string): number {
  const lines = transcript.split('\n').reverse();

  for (const line of lines) {
    const timeMatch = line.match(/^\[(\d+):(\d+)(?::(\d+))?\]/);
    if (timeMatch) {
      const hours = timeMatch[3] ? parseInt(timeMatch[1]) : 0;
      const mins = timeMatch[3] ? parseInt(timeMatch[2]) : parseInt(timeMatch[1]);
      const secs = timeMatch[3] ? parseInt(timeMatch[3]) : parseInt(timeMatch[2]);
      return hours * 3600 + mins * 60 + secs;
    }
  }

  return 0;
}

/**
 * Estimate token count (rough approximation)
 * Average: 1 token ≈ 4 characters for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
