/**
 * AutoClipper Types
 */

export interface TranscriptSegment {
  id: string;
  start: number;  // seconds
  end: number;    // seconds
  text: string;
  speaker?: string;
}

export interface ViralFactors {
  hook: number;        // 0-100 - Strong opening
  emotion: number;     // 0-100 - Emotional impact
  controversy: number; // 0-100 - Polarizing content
  insight: number;     // 0-100 - Unique/valuable info
  storytelling: number; // 0-100 - Complete narrative
  cliffhanger: number; // 0-100 - Creates curiosity
  humor: number;       // 0-100 - Entertainment value
}

export interface ViralClip {
  startTime: number;
  endTime: number;
  text: string;
  viralScore: number;      // 0-100
  factors: ViralFactors;
  suggestedTitle: string;
  hashtags: string[];
  reasoning: string;
}

export interface AnalyzeRequest {
  segments: TranscriptSegment[];
  options: AnalyzeOptions;
}

export interface AnalyzeOptions {
  minClipDuration?: number;   // seconds, default 15
  maxClipDuration?: number;   // seconds, default 90
  targetCount?: number;       // number of clips to find, default 10
  contentType?: 'general' | 'podcast' | 'interview' | 'tutorial' | 'vlog';
}

export interface AnalyzeResponse {
  clips: ViralClip[];
  processingTime: number;
  model: string;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  message: string;
  ollamaConnected: boolean;
  model?: string;
}

export interface StreamEvent {
  type: 'progress' | 'clip' | 'complete' | 'error';
  progress?: number;
  message?: string;
  momentsFound?: number;
  clip?: ViralClip;
  clips?: ViralClip[];
  error?: string;
}
