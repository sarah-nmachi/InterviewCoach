import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import { getSpeechToken } from './api';

let speechToken = null;
let speechRegion = null;
let tokenTimestamp = 0;
let recognizer = null;
let currentSynthesizer = null;
let currentPlayer = null;
let currentResolve = null;  // Force-resolve hook for cancelSpeaking
let cancelled = false;       // Stops speakSegments loop

const TTS_VOICE = 'en-US-AndrewMultilingualNeural';
const TOKEN_LIFETIME_MS = 9 * 60 * 1000; // Refresh token every 9 min (expires at 10)

/**
 * Panel voice pool — 3 distinct Azure Neural voices for panel interviewers.
 */
export const PANEL_VOICES = [
  'en-US-AndrewMultilingualNeural',   // Male 1
  'en-US-AvaMultilingualNeural',      // Female 1
  'en-US-BrianMultilingualNeural',    // Male 2
];

/**
 * Cache the speech token (auto-refreshes when expired)
 */
async function ensureToken() {
  if (!speechToken || (Date.now() - tokenTimestamp > TOKEN_LIFETIME_MS)) {
    const { token, region } = await getSpeechToken();
    speechToken = token;
    speechRegion = region;
    tokenTimestamp = Date.now();
  }
  return { token: speechToken, region: speechRegion };
}

/**
 * Create a fresh SpeechConfig (one per synthesizer to avoid shared-state bugs)
 */
async function createSpeechConfig(voice) {
  const { token, region } = await ensureToken();
  const config = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
  config.speechRecognitionLanguage = 'en-US';
  config.speechSynthesisVoiceName = voice || TTS_VOICE;
  return config;
}

/**
 * Cancel any currently ongoing TTS and signal loops to stop.
 */
export function cancelSpeaking() {
  cancelled = true;
  if (currentPlayer) {
    try { currentPlayer.pause(); } catch (e) { /* ignore */ }
    try { currentPlayer.close(); } catch (e) { /* ignore */ }
    currentPlayer = null;
  }
  if (currentSynthesizer) {
    try { currentSynthesizer.close(); } catch (e) { /* ignore */ }
    currentSynthesizer = null;
  }
  // Force-resolve pending speakText promise so callers unblock
  if (currentResolve) {
    currentResolve();
    currentResolve = null;
  }
}

/**
 * Speak text aloud using Azure TTS.
 * Each call creates its own player + synthesizer. Only one speaks at a time.
 * @param {string} text
 * @param {function} onStart
 * @param {function} onEnd
 * @param {string} [voice]
 */
export async function speakText(text, onStart, onEnd, voice) {
  // Fresh config per call — avoids shared-state bugs when synthesizer.close() taints config
  const config = await createSpeechConfig(voice);

  const player = new SpeechSDK.SpeakerAudioDestination();
  currentPlayer = player;
  const audioConfig = SpeechSDK.AudioConfig.fromSpeakerOutput(player);
  const synthesizer = new SpeechSDK.SpeechSynthesizer(config, audioConfig);
  currentSynthesizer = synthesizer;

  if (onStart) onStart();

  return new Promise((resolve) => {
    let done = false;
    let fallbackTimer = null;

    function cleanup() {
      if (done) return;
      done = true;
      currentResolve = null;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      try { synthesizer.close(); } catch (e) { /* ignore */ }
      if (currentSynthesizer === synthesizer) currentSynthesizer = null;
      if (currentPlayer === player) currentPlayer = null;
      if (onEnd) onEnd();
      resolve();
    }

    // Hook for cancelSpeaking() to force-resolve
    currentResolve = cleanup;

    // Primary: wait for actual audio playback to finish
    player.onAudioEnd = () => cleanup();

    synthesizer.speakTextAsync(
      text,
      (result) => {
        // Fallback timer based on audio duration in case onAudioEnd doesn't fire
        const durationMs = (result.audioDuration || 0) / 10000;
        const wait = Math.max(500, durationMs + 1000);
        fallbackTimer = setTimeout(() => cleanup(), wait);
      },
      (err) => {
        console.warn('TTS synthesis error:', err);
        cleanup();
      }
    );
  });
}

/**
 * Stop any ongoing speech
 */
export function stopSpeaking() {
  cancelSpeaking();
}

/**
 * Speak an array of { text, voice } segments as a SINGLE synthesis call using SSML.
 * This avoids all sequential synthesizer issues by switching voices within one request.
 * Used for panel interviews where each panelist has a different voice.
 */
export async function speakSegments(segments, onStart, onEnd) {
  if (!segments || segments.length === 0) {
    if (onEnd) onEnd();
    return;
  }

  // Build SSML with <voice> tags for each panelist — one synthesis call, multiple voices
  const voiceBlocks = segments.map(seg => {
    // Escape XML special characters in the text
    const escaped = seg.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return `<voice name="${seg.voice}"><break time="400ms"/>${escaped}</voice>`;
  }).join('\n');

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
${voiceBlocks}
</speak>`;

  // Use speakSsml instead of speakText — single synth, single player, all voices
  const config = await createSpeechConfig();
  const player = new SpeechSDK.SpeakerAudioDestination();
  currentPlayer = player;
  const audioConfig = SpeechSDK.AudioConfig.fromSpeakerOutput(player);
  const synthesizer = new SpeechSDK.SpeechSynthesizer(config, audioConfig);
  currentSynthesizer = synthesizer;

  if (onStart) onStart();

  return new Promise((resolve) => {
    let done = false;
    let fallbackTimer = null;

    function cleanup() {
      if (done) return;
      done = true;
      currentResolve = null;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      try { synthesizer.close(); } catch (e) { /* ignore */ }
      if (currentSynthesizer === synthesizer) currentSynthesizer = null;
      if (currentPlayer === player) currentPlayer = null;
      if (onEnd) onEnd();
      resolve();
    }

    currentResolve = cleanup;
    player.onAudioEnd = () => cleanup();

    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        if (result.reason === SpeechSDK.ResultReason.Canceled) {
          console.warn('SSML synthesis canceled:', result.errorDetails);
          cleanup();
          return;
        }
        // Fallback timer in case onAudioEnd doesn't fire
        const durationMs = (result.audioDuration || 0) / 10000;
        const wait = Math.max(500, durationMs + 1000);
        fallbackTimer = setTimeout(() => cleanup(), wait);
      },
      (err) => {
        console.warn('SSML synthesis error:', err);
        cleanup();
      }
    );
  });
}

/**
 * Start continuous speech recognition
 * @param {Object} callbacks
 * @param {function} callbacks.onRecognizing - Called with interim results
 * @param {function} callbacks.onRecognized - Called with final results
 * @param {function} callbacks.onError - Called on error
 * @param {function} callbacks.onAudioData - Called with audio level data for waveform
 * @returns {Promise<void>}
 */
export async function startRecognition({ onRecognizing, onRecognized, onError, onAudioData }) {
  const config = await createSpeechConfig();
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
 * @returns {Promise<void>}
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
}
