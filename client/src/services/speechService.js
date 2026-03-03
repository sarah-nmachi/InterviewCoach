import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import { getSpeechToken } from './api';

let speechToken = null;
let speechRegion = null;
let tokenTimestamp = 0;
let recognizer = null;
let persistentSynth = null;   // Kept alive between calls — eliminates mobile WebSocket delay
let currentResolve = null;
let audioUnlocked = false;
let audioCtx = null;          // Persistent AudioContext — unlocked during user gesture for iOS
let currentSource = null;     // Current AudioBufferSourceNode — for cancellation
let keepAliveTimer = null;    // Interval that plays silence to prevent iOS from suspending AudioContext
let cancelled = false;        // Set by cancelSpeaking() — prevents new speech from starting

const TOKEN_LIFETIME_MS = 9 * 60 * 1000;

// ─── Fast standard Neural voices (NOT multilingual — 5-10x faster) ───
const TTS_VOICE = 'en-US-GuyNeural';
export const PANEL_VOICES = [
  'en-US-GuyNeural',     // Male 1
  'en-US-JennyNeural',   // Female
  'en-US-DavisNeural',   // Male 2
];

function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Unlock audio on iOS. Must be called from a user-gesture handler.
 * Also pre-warms the TTS synthesizer so the first speech has no connection delay.
 */
export function unlockAudio() {
  // Reset cancel flag for the new session
  cancelled = false;

  // Always recreate AudioContext on each call — handles iOS refresh issue
  // where the previous page's audio session contaminates the new one.
  // Guard only the one-time listeners with audioUnlocked flag.

  // 1. Create & unlock a fresh AudioContext during this user gesture.
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      // Close previous if it exists (shouldn't on fresh load, but defensive)
      if (audioCtx && audioCtx.state !== 'closed') {
        try { audioCtx.close(); } catch (_) {}
      }
      if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }

      audioCtx = new AC();
      const buf = audioCtx.createBuffer(1, 1, 22050);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
      if (audioCtx.state === 'suspended') audioCtx.resume();

      // 2. Keep-alive: play silence every 4s to prevent iOS from suspending the AudioContext.
      //    iOS kills contexts that haven't played audio recently, and resume() from
      //    non-gesture code is silently ignored. This keeps it alive.
      keepAliveTimer = setInterval(() => {
        if (audioCtx && audioCtx.state === 'running') {
          try {
            const b = audioCtx.createBuffer(1, 1, 22050);
            const s = audioCtx.createBufferSource();
            s.buffer = b;
            s.connect(audioCtx.destination);
            s.start(0);
          } catch (_) {}
        } else if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
      }, 4000);

      console.log('[AUDIO] AudioContext created & unlocked, state:', audioCtx.state);
    }
  } catch (e) {
    console.warn('[AUDIO] Failed to create AudioContext:', e);
  }

  // 3. Kill old synthesizer so it recreates with fresh state
  if (persistentSynth) {
    try { persistentSynth.close(); } catch (_) {}
    persistentSynth = null;
  }

  // 4. Pre-warm synthesizer — establishes WebSocket NOW so first TTS is instant
  ensureSynthesizer().catch(() => {});

  // One-time setup
  if (!audioUnlocked) {
    audioUnlocked = true;

    // Pre-request mic permission
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => { stream.getTracks().forEach(t => t.stop()); console.log('[MIC] Permission granted'); })
        .catch(err => console.warn('[MIC] Permission denied:', err.message));
    }

    // Handle iOS app backgrounding — resume AudioContext when page becomes visible.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (audioCtx?.state === 'suspended') {
          audioCtx.resume().catch(() => {});
          console.log('[AUDIO] Resumed AudioContext after visibility change');
        }
        if (persistentSynth) {
          try { persistentSynth.close(); } catch (_) {}
          persistentSynth = null;
          console.log('[TTS] Synth cleared after backgrounding — will recreate on next use');
        }
      }
    });
  }
}

// ─── Token management ───
async function ensureToken() {
  const needRefresh = !speechToken || (Date.now() - tokenTimestamp > TOKEN_LIFETIME_MS);
  if (needRefresh) {
    const { token, region } = await getSpeechToken();
    speechToken = token;
    speechRegion = region;
    tokenTimestamp = Date.now();
    // Token changed — kill old synthesizer so it reconnects with new token
    if (persistentSynth) {
      try { persistentSynth.close(); } catch (_) {}
      persistentSynth = null;
    }
  }
  return { token: speechToken, region: speechRegion };
}

/**
 * Get or create the persistent synthesizer with manual playback (null AudioConfig).
 * Audio data is returned in result.audioData and played through our pre-unlocked AudioContext.
 * The synthesizer's WebSocket stays alive between calls, eliminating mobile handshake delay.
 */
async function ensureSynthesizer() {
  await ensureToken();
  if (persistentSynth) return persistentSynth;

  const config = SpeechSDK.SpeechConfig.fromAuthorizationToken(speechToken, speechRegion);
  config.speechRecognitionLanguage = 'en-US';
  // Output as compressed MP3 — ~8x smaller than WAV, much faster network transfer.
  // iOS decodeAudioData works fine with MP3 as long as we .slice(0) the ArrayBuffer
  // before passing it (to avoid neutering the SDK's internal buffer).
  config.speechSynthesisOutputFormat = SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3;
  // null AudioConfig → SDK returns audio data in result.audioData WITHOUT playing it.
  // We play manually through our pre-unlocked AudioContext — reliable on iOS.
  persistentSynth = new SpeechSDK.SpeechSynthesizer(config, null);
  console.log('[TTS] Synthesizer created (manual playback mode)');
  return persistentSynth;
}

/**
 * Play raw audio data through the pre-unlocked AudioContext.
 * Falls back to an HTML Audio element if AudioContext fails.
 * Returns a promise that resolves when playback completes.
 */
async function playAudioData(audioData) {
  // Recreate AudioContext if it was closed (e.g. after cancellation)
  if (audioCtx && audioCtx.state === 'closed') {
    console.warn('[AUDIO] AudioContext was closed, cannot play');
    audioCtx = null;
  }

  // Primary: AudioContext (pre-unlocked during user gesture — reliable on iOS)
  if (audioCtx) {
    try {
      // Resume if suspended (iOS backgrounding can cause this)
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
        console.log('[AUDIO] Resumed suspended AudioContext, state:', audioCtx.state);
      }

      // CRITICAL: Always copy the ArrayBuffer before passing to decodeAudioData.
      // decodeAudioData() neuters/detaches the original buffer, which corrupts the
      // SDK's internal state and breaks all subsequent TTS calls.
      let raw;
      if (audioData instanceof ArrayBuffer) {
        raw = audioData.slice(0);
      } else {
        raw = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
      }

      const audioBuffer = await audioCtx.decodeAudioData(raw);
      console.log('[AUDIO] Decoded audio:', audioBuffer.duration.toFixed(1), 's');

      return await new Promise((resolve) => {
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        currentSource = source;
        source.onended = () => {
          if (currentSource === source) currentSource = null;
          resolve();
        };
        source.start(0);
      });
    } catch (e) {
      console.warn('[TTS] AudioContext playback failed, trying Audio element:', e);
    }
  }

  // Fallback: HTML Audio element with WAV blob
  return new Promise((resolve) => {
    try {
      // Copy buffer for blob (original may be neutered)
      const copy = audioData instanceof ArrayBuffer ? audioData.slice(0) : new Uint8Array(audioData).buffer;
      const blob = new Blob([copy], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = (e) => { console.warn('[TTS] Audio element error:', e); URL.revokeObjectURL(url); resolve(); };
      audio.play().catch((e) => { console.warn('[TTS] Audio element play() rejected:', e); URL.revokeObjectURL(url); resolve(); });
    } catch (e) {
      console.warn('[TTS] All playback methods failed:', e);
      resolve();
    }
  });
}

// ─── Cancel / Stop ───
export function cancelSpeaking() {
  cancelled = true;
  // Stop manual audio playback
  if (currentSource) {
    try { currentSource.stop(); } catch (_) {}
    currentSource = null;
  }
  // Close synth (cancels in-progress synthesis)
  if (persistentSynth) {
    try { persistentSynth.close(); } catch (_) {}
    persistentSynth = null;
  }
  if (currentResolve) { currentResolve(); currentResolve = null; }
}

export function stopSpeaking() { cancelSpeaking(); }

/**
 * Speak text using Azure TTS with persistent synthesizer (manual playback).
 * Uses SSML so voice can be switched without recreating the synthesizer.
 * Audio is played through our pre-unlocked AudioContext for iOS compatibility.
 * Does NOT close the synthesizer after speaking — keeps the WebSocket alive for the next call.
 */
export async function speakText(text, onStart, onEnd, voice) {
  if (cancelled) {
    if (onEnd) onEnd();
    return;
  }

  // Don't call cancelSpeaking — conversation is turn-based, previous speech is already done.
  // Keeping the synth alive avoids the 2-5s mobile WebSocket re-handshake.

  let synth;
  try {
    synth = await ensureSynthesizer();
  } catch (err) {
    console.warn('[TTS] Failed to get synthesizer:', err);
    if (onEnd) onEnd();
    return;
  }

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
<voice name="${voice || TTS_VOICE}">${escXml(text)}</voice>
</speak>`;

  return new Promise((resolve) => {
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      currentResolve = null;
      // Do NOT close synth here — keep it alive for the next call
      if (onEnd) onEnd();
      resolve();
    }
    currentResolve = finish;

    synth.speakSsmlAsync(
      ssml,
      async (result) => {
        if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
          // Play audio through our pre-unlocked AudioContext (iOS-safe)
          if (result.audioData && result.audioData.byteLength > 0) {
            if (onStart) onStart();
            try {
              await playAudioData(result.audioData);
            } catch (e) {
              console.warn('[TTS] Playback error:', e);
            }
          }
          finish();
        } else {
          console.warn('[TTS] Synthesis issue:', result.errorDetails || result.reason);
          // On error/cancel, kill synth so it recreates next time
          if (result.reason === SpeechSDK.ResultReason.Canceled) {
            if (persistentSynth === synth) {
              try { persistentSynth.close(); } catch (_) {}
              persistentSynth = null;
            }
          }
          finish();
        }
      },
      (err) => {
        console.warn('[TTS] Error:', err);
        // Kill synth on error — recreate next time
        if (persistentSynth === synth) {
          try { persistentSynth.close(); } catch (_) {}
          persistentSynth = null;
        }
        finish();
      }
    );
  });
}

/**
 * Speak panel segments as a SINGLE SSML synthesis — all panelists in one call.
 * Reuses the persistent synthesizer, so no connection delay on mobile.
 * If multi-voice SSML fails (common on mobile), falls back to sequential speakText calls.
 */
export async function speakSegments(segments, onStart, onEnd) {
  if (!segments || segments.length === 0) {
    if (onEnd) onEnd();
    return;
  }

  let synth;
  try {
    synth = await ensureSynthesizer();
  } catch (err) {
    console.warn('[TTS] Failed to get synthesizer:', err);
    if (onEnd) onEnd();
    return;
  }

  const voiceBlocks = segments.map(seg =>
    `<voice name="${seg.voice}"><break time="400ms"/>${escXml(seg.text)}</voice>`
  ).join('\n');

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
${voiceBlocks}
</speak>`;

  // Try multi-voice SSML first
  const multiVoiceOk = await new Promise((resolve) => {
    let done = false;
    function finish(success) {
      if (done) return;
      done = true;
      currentResolve = null;
      resolve(success);
    }
    currentResolve = () => finish(false);

    synth.speakSsmlAsync(
      ssml,
      async (result) => {
        if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
          // Play panel audio through our pre-unlocked AudioContext (iOS-safe)
          if (result.audioData && result.audioData.byteLength > 0) {
            if (onStart) onStart();
            try {
              await playAudioData(result.audioData);
            } catch (e) {
              console.warn('[TTS] Panel playback error:', e);
            }
          }
          finish(true);
        } else {
          console.warn('[TTS] Panel SSML issue:', result.errorDetails || result.reason);
          if (result.reason === SpeechSDK.ResultReason.Canceled) {
            if (persistentSynth === synth) {
              try { persistentSynth.close(); } catch (_) {}
              persistentSynth = null;
            }
          }
          finish(false);
        }
      },
      (err) => {
        console.warn('[TTS] Panel SSML error:', err);
        if (persistentSynth === synth) {
          try { persistentSynth.close(); } catch (_) {}
          persistentSynth = null;
        }
        finish(false);
      }
    );
  });

  // If multi-voice SSML failed, fall back to speaking each segment one by one
  if (!multiVoiceOk) {
    console.log('[TTS] Panel fallback: speaking segments sequentially');
    for (const seg of segments) {
      if (cancelled) break;
      try {
        await speakText(seg.text, null, null, seg.voice);
      } catch (e) {
        console.warn('[TTS] Segment fallback error:', e);
      }
    }
  }

  if (onEnd) onEnd();
}

// ─── Speech Recognition (STT) — Azure Speech SDK ───
async function createRecognitionConfig() {
  const { token, region } = await ensureToken();
  const config = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
  config.speechRecognitionLanguage = 'en-US';
  return config;
}

export async function startRecognition({ onRecognizing, onRecognized, onError, onAudioData }) {
  // Check mic permission first
  if (!navigator.mediaDevices?.getUserMedia) {
    const msg = window.location.protocol === 'http:'
      ? 'Microphone requires HTTPS. Use localhost or deploy to HTTPS.'
      : 'Microphone API not available.';
    if (onError) onError(msg);
    throw new Error(msg);
  }

  try {
    const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    testStream.getTracks().forEach(t => t.stop());
  } catch (micErr) {
    const msg = `Microphone denied: ${micErr.message}. Allow mic in browser settings.`;
    if (onError) onError(msg);
    throw new Error(msg);
  }

  // Ensure AudioContext is active (iOS may have suspended it during backgrounding)
  if (audioCtx?.state === 'suspended') {
    await audioCtx.resume().catch(() => {});
  }

  const config = await createRecognitionConfig();
  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  recognizer = new SpeechSDK.SpeechRecognizer(config, audioConfig);

  recognizer.recognizing = (_, e) => {
    if (e.result.reason === SpeechSDK.ResultReason.RecognizingSpeech) {
      if (onRecognizing) onRecognizing(e.result.text);
    }
  };

  recognizer.recognized = (_, e) => {
    if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      if (onRecognized) onRecognized(e.result.text);
    }
  };

  recognizer.canceled = (_, e) => {
    if (e.reason === SpeechSDK.CancellationReason.Error) {
      if (onError) onError(e.errorDetails);
    }
  };

  await new Promise((resolve, reject) => {
    recognizer.startContinuousRecognitionAsync(resolve, reject);
  });
}

/**
 * Stop speech recognition
 */
export async function stopRecognition() {
  if (recognizer) {
    await new Promise((resolve, reject) => {
      recognizer.stopContinuousRecognitionAsync(resolve, reject);
    });
    recognizer.close();
    recognizer = null;
  }
}

/**
 * Reset the speech config (e.g. when token expires)
 */
export function resetSpeechConfig() {
  speechToken = null;
  speechRegion = null;
  tokenTimestamp = 0;
  cancelSpeaking();
}
