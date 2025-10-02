import { NextRequest, NextResponse } from "next/server";

// Simple in-memory cache for TTS responses
const ttsCache = new Map<string, ArrayBuffer>();
const MAX_CACHE_SIZE = 50; // Limit cache size
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    const { text, voice_id = "pNInz6obpgDQGcFmaJgB" } = await request.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // Create cache key
    const cacheKey = `${voice_id}_${text.slice(0, 100)}`; // Use first 100 chars for key

    // Check cache first
    if (ttsCache.has(cacheKey)) {
      const cachedAudio = ttsCache.get(cacheKey)!;
      return new NextResponse(cachedAudio, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": cachedAudio.byteLength.toString(),
          "Cache-Control": "public, max-age=300", // Cache for 5 minutes
        },
      });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ElevenLabs API key not configured" },
        { status: 500 }
      );
    }

    // Generate speech using ElevenLabs API directly
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2", // Faster model
          voice_settings: {
            stability: 0.5, // Lower for faster generation
            similarity_boost: 0.8,
            style: 0.0, // Remove style for speed
            use_speaker_boost: false, // Disable for speed
          },
          optimize_streaming_latency: 4, // Maximum optimization for streaming
          output_format: "mp3_22050_32", // Lower quality for speed
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();

    // Cache the response if cache isn't too large
    if (ttsCache.size < MAX_CACHE_SIZE) {
      ttsCache.set(cacheKey, audioBuffer);

      // Set TTL cleanup
      setTimeout(() => {
        ttsCache.delete(cacheKey);
      }, CACHE_TTL);
    }

    // Return the audio as a response
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error("TTS Error:", error);
    return NextResponse.json(
      { error: "Failed to generate speech" },
      { status: 500 }
    );
  }
}
