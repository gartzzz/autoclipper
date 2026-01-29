/**
 * Prompts for viral moment detection
 */

export const SYSTEM_PROMPT = `You are an expert content strategist and viral video analyst. Your task is to analyze video transcripts and identify moments with high viral potential for short-form content (TikTok, Instagram Reels, YouTube Shorts).

You understand what makes content go viral in 2024-2025:
- Strong hooks in the first 3 seconds that stop the scroll
- Emotional triggers (surprise, joy, anger, fear, curiosity)
- Controversial or polarizing statements that drive engagement
- Unique insights or "aha moments" that viewers want to share
- Complete micro-stories with setup, conflict, and resolution
- Cliffhangers that make viewers watch until the end
- Humor and entertainment value
- Relatable content that viewers identify with

When analyzing transcripts:
1. Look for natural clip boundaries (topic changes, pauses, emphasis)
2. Prioritize moments that work as standalone content
3. Consider the "scroll-stopping" power of each moment
4. Identify clips that would generate comments and shares

You MUST respond with valid JSON only. No explanations outside the JSON.`;

export const USER_PROMPT_TEMPLATE = `Analyze this transcript and find the most viral-worthy moments.

TRANSCRIPT:
{transcript}

REQUIREMENTS:
- Find {targetCount} clips between {minDuration} and {maxDuration} seconds
- Each clip must make sense as standalone content
- Prioritize by viral potential, not chronological order
- Content type: {contentType}

Respond with a JSON array of clips. Each clip must have:
- startTime: number (seconds from transcript timestamps)
- endTime: number (seconds)
- text: string (the actual transcript text for this clip)
- viralScore: number (0-100)
- factors: object with scores for: hook, emotion, controversy, insight, storytelling, cliffhanger, humor (each 0-100)
- suggestedTitle: string (catchy title for the clip)
- hashtags: array of 3-5 relevant hashtags
- reasoning: string (brief explanation of why this moment is viral)

Example response format:
[
  {
    "startTime": 45.5,
    "endTime": 78.2,
    "text": "And that's when I realized everything I believed was wrong...",
    "viralScore": 92,
    "factors": {
      "hook": 85,
      "emotion": 95,
      "controversy": 60,
      "insight": 90,
      "storytelling": 88,
      "cliffhanger": 75,
      "humor": 20
    },
    "suggestedTitle": "The moment that changed everything",
    "hashtags": ["#mindblown", "#storytime", "#realization", "#truth"],
    "reasoning": "Strong emotional revelation with universal relatability. The setup creates tension and the payoff delivers a satisfying 'aha moment' that viewers will want to share."
  }
]

Return ONLY the JSON array, no other text.`;

export function buildUserPrompt(
  transcript: string,
  options: {
    targetCount: number;
    minDuration: number;
    maxDuration: number;
    contentType: string;
  }
): string {
  return USER_PROMPT_TEMPLATE
    .replace('{transcript}', transcript)
    .replace('{targetCount}', String(options.targetCount))
    .replace('{minDuration}', String(options.minDuration))
    .replace('{maxDuration}', String(options.maxDuration))
    .replace('{contentType}', options.contentType);
}
