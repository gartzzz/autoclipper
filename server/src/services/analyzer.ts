/**
 * Viral Content Analyzer Service
 * Analyzes transcripts using Ollama to find viral moments
 */

import { chat } from './ollama.js';
import { chunkTranscript } from './chunker.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../prompts/viral-detection.js';
import { logger } from '../utils/logger.js';
import type { TranscriptSegment, ViralClip, AnalyzeOptions } from '../types/index.js';

const DEFAULT_OPTIONS: Required<AnalyzeOptions> = {
  minClipDuration: 15,
  maxClipDuration: 90,
  targetCount: 10,
  contentType: 'general'
};

/**
 * Analyze transcript for viral moments
 */
export async function analyzeTranscript(
  segments: TranscriptSegment[],
  options: AnalyzeOptions = {},
  onProgress?: (progress: number, message: string, momentsFound: number) => void
): Promise<ViralClip[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  logger.info(
    {
      segmentCount: segments.length,
      options: opts
    },
    'Starting transcript analysis'
  );

  // Format transcript with timestamps
  const formattedTranscript = formatTranscript(segments);

  // Check if we need to chunk (for very long transcripts)
  const chunks = chunkTranscript(formattedTranscript, 24000); // ~6000 tokens

  logger.info({ chunkCount: chunks.length }, 'Transcript chunked');

  let allClips: ViralClip[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkProgress = ((i + 1) / chunks.length) * 100;

    onProgress?.(
      chunkProgress * 0.9, // Reserve 10% for final processing
      `Analyzing section ${i + 1}/${chunks.length}...`,
      allClips.length
    );

    logger.info(
      {
        chunk: i + 1,
        total: chunks.length,
        chunkLength: chunk.text.length
      },
      'Processing chunk'
    );

    const userPrompt = buildUserPrompt(chunk.text, {
      targetCount: Math.ceil(opts.targetCount / chunks.length) + 2, // Get a few extra per chunk
      minDuration: opts.minClipDuration,
      maxDuration: opts.maxClipDuration,
      contentType: opts.contentType
    });

    try {
      const response = await chat(SYSTEM_PROMPT, userPrompt, {
        temperature: 0.7,
        maxTokens: 4096
      });

      const clips = parseClipsFromResponse(response, chunk.startOffset);
      allClips = allClips.concat(clips);

      logger.info(
        {
          chunk: i + 1,
          clipsFound: clips.length,
          totalClips: allClips.length
        },
        'Chunk processed'
      );

    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown',
          chunk: i + 1
        },
        'Failed to analyze chunk'
      );
      // Continue with other chunks
    }
  }

  onProgress?.(95, 'Ranking and filtering clips...', allClips.length);

  // Sort by viral score and take top N
  const sortedClips = allClips
    .filter(clip => isValidClip(clip, opts))
    .sort((a, b) => b.viralScore - a.viralScore)
    .slice(0, opts.targetCount);

  // Remove overlapping clips
  const finalClips = removeOverlaps(sortedClips);

  onProgress?.(100, 'Analysis complete', finalClips.length);

  logger.info(
    {
      totalFound: allClips.length,
      afterFilter: sortedClips.length,
      final: finalClips.length
    },
    'Analysis complete'
  );

  return finalClips;
}

/**
 * Format segments into timestamped transcript
 */
function formatTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map(seg => `[${formatTime(seg.start)}] ${seg.text}`)
    .join('\n');
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Parse clips from LLM response
 */
function parseClipsFromResponse(response: string, timeOffset: number = 0): ViralClip[] {
  try {
    // Try to extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn('No JSON array found in response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) {
      logger.warn('Parsed response is not an array');
      return [];
    }

    return parsed
      .filter(clip =>
        typeof clip.startTime === 'number' &&
        typeof clip.endTime === 'number' &&
        typeof clip.viralScore === 'number'
      )
      .map(clip => ({
        startTime: clip.startTime + timeOffset,
        endTime: clip.endTime + timeOffset,
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
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown',
        responsePreview: response.slice(0, 200)
      },
      'Failed to parse clips from response'
    );
    return [];
  }
}

/**
 * Validate a clip meets our criteria
 */
function isValidClip(clip: ViralClip, options: Required<AnalyzeOptions>): boolean {
  const duration = clip.endTime - clip.startTime;

  return (
    duration >= options.minClipDuration &&
    duration <= options.maxClipDuration &&
    clip.viralScore >= 50 && // Minimum viral score threshold
    clip.startTime >= 0 &&
    clip.endTime > clip.startTime
  );
}

/**
 * Remove overlapping clips, keeping higher scored ones
 */
function removeOverlaps(clips: ViralClip[]): ViralClip[] {
  const result: ViralClip[] = [];

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
