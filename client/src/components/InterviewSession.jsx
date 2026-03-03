import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sendAnswer, endInterview, forceEndInterview } from '../services/api';
import { speakText, startRecognition, stopRecognition, cancelSpeaking, speakSegments, PANEL_VOICES } from '../services/speechService';
import AIAvatar, { getPersonaById } from './AIAvatar';
import './InterviewSession.css';

const SESSION_DURATION = 30 * 60; // 30 minutes in seconds
const WRAP_UP_THRESHOLD = 5 * 60; // 5 minutes remaining
const CLOSING_THRESHOLD = 2 * 60; // 2 minutes remaining

export default function InterviewSession({ sessionData, callPrefs, onEnd }) {
  const { sessionId, firstMessage, interviewerRole } = sessionData;
  const { cameraMode = 'avatar', cameraStream = null, aiPersona = 'hr' } = callPrefs || {};

  const [transcript, setTranscript] = useState([]);
  const [currentInterim, setCurrentInterim] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(SESSION_DURATION);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [ending, setEnding] = useState(false);
  // Default transcript to collapsed on mobile so it doesn't cover the screen
  const [showTranscript, setShowTranscript] = useState(() => window.innerWidth > 900);

  const transcriptEndRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const answerPartsRef = useRef([]);
  const hasMountedRef = useRef(false);
  const sessionEndedRef = useRef(false);
  const userVideoRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(cameraMode === 'camera');
  const [localStream, setLocalStream] = useState(cameraStream);

  // AI persona info — override label with the role the AI actually stated
  const basePersona = getPersonaById(aiPersona);
  const persona = interviewerRole
    ? { ...basePersona, label: interviewerRole }
    : basePersona;
  const isPanel = persona.id === 'panel';

  // Stable voice assignment for panel members: maps panelist name → voice
  const panelVoiceMap = useRef({});

  /**
   * Parse panel speaker tags from AI response.
   * Input:  "[Sarah]: Hello! \n[Mike]: Nice to meet you."
   * Output: [{ name: 'Sarah', text: 'Hello!' }, { name: 'Mike', text: 'Nice to meet you.' }]
   * Returns null if no speaker tags detected (non-panel or malformed).
   */
  function parsePanelSpeakers(text) {
    // Match pattern: [Name]: text (possibly multi-line until next [Name]: or end)
    const regex = /\[([A-Za-z]+)\]:\s*/g;
    const matches = [...text.matchAll(regex)];
    if (matches.length === 0) return null;

    const segments = [];
    for (let i = 0; i < matches.length; i++) {
      const name = matches[i][1];
      const start = matches[i].index + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const segText = text.slice(start, end).trim();
      if (segText) {
        segments.push({ name, text: segText });
      }
    }
    return segments.length > 0 ? segments : null;
  }

  /**
   * Get a consistent voice for a panelist by name.
   * First 3 unique names are assigned voices in order; subsequent names cycle.
   */
  function getVoiceForPanelist(name) {
    const map = panelVoiceMap.current;
    if (!map[name]) {
      const assignedCount = Object.keys(map).length;
      map[name] = PANEL_VOICES[assignedCount % PANEL_VOICES.length];
    }
    return map[name];
  }

  // Scroll transcript to bottom
  const scrollToBottom = useCallback(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Attach camera stream to video element
  useEffect(() => {
    if (userVideoRef.current && localStream) {
      userVideoRef.current.srcObject = localStream;
    }
  }, [localStream, cameraOn]);

  // Auto-start camera on mount — reuse stream from PreCallSetup if available
  useEffect(() => {
    if (cameraStream) {
      // User already granted camera in PreCallSetup — reuse that stream
      setLocalStream(cameraStream);
      setCameraOn(true);
    } else if (cameraMode === 'camera') {
      // PreCallSetup said camera but no stream — request one
      navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      }).then(stream => {
        setLocalStream(stream);
        setCameraOn(true);
      }).catch(err => console.warn('Auto-camera denied:', err));
    }
    // Cleanup camera on unmount
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  async function toggleCamera() {
    if (cameraOn && localStream) {
      localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
      setCameraOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false
        });
        setLocalStream(stream);
        setCameraOn(true);
      } catch (err) {
        console.warn('Camera access denied:', err);
      }
    }
  }

  // Timer
  useEffect(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(0, SESSION_DURATION - elapsed);
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(timerRef.current);
        handleForceEnd();
      }
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, []);

  // Mark session as abandoned if user leaves without ending
  useEffect(() => {
    function handleBeforeUnload() {
      if (!sessionEndedRef.current && sessionId) {
        const payload = JSON.stringify({ sessionId });
        navigator.sendBeacon('/api/interview/abandon', new Blob([payload], { type: 'application/json' }));
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionId]);

  // Speak the first message (guarded against StrictMode double-mount)
  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;
    addToTranscript('interviewer', firstMessage);
    speakAgentMessage(firstMessage);

    return () => {
      cancelSpeaking();
    };
  }, []);

  useEffect(scrollToBottom, [transcript, currentInterim]);

  function addToTranscript(role, text) {
    // For panel interviews, split by speaker tags into separate transcript entries
    if (role === 'interviewer' && isPanel) {
      const segments = parsePanelSpeakers(text);
      if (segments && segments.length > 0) {
        const timestamp = new Date().toISOString();
        setTranscript(prev => [
          ...prev,
          ...segments.map(seg => ({
            role: 'interviewer',
            speaker: seg.name,
            text: seg.text,
            timestamp
          }))
        ]);
        return;
      }
    }
    setTranscript(prev => [...prev, { role, text, timestamp: new Date().toISOString() }]);
  }

  async function speakAgentMessage(text) {
    if (sessionEndedRef.current) return; // Don't speak if session ended
    setIsPreparingAudio(true);
    setIsSpeaking(false);
    setCanSpeak(false);

    // Called once the synthesizer is ready and audio is about to play
    const onSpeakStart = () => {
      setIsPreparingAudio(false);
      setIsSpeaking(true);
    };

    try {
      // Panel: parse speaker tags and use distinct voices per panelist
      if (isPanel) {
        const segments = parsePanelSpeakers(text);
        if (segments && segments.length > 0) {
          const voiceSegments = segments.map(seg => ({
            text: seg.text,
            voice: getVoiceForPanelist(seg.name)
          }));
          await speakSegments(voiceSegments, onSpeakStart, null);
        } else {
          // Fallback: no tags found, speak as single voice
          await speakText(text, onSpeakStart, null);
        }
      } else {
        await speakText(text, onSpeakStart, null);
      }
    } catch (err) {
      console.warn('TTS error:', err);
    }
    if (sessionEndedRef.current) return; // Don't update state if session ended during speech
    setIsPreparingAudio(false);
    setIsSpeaking(false);
    setCanSpeak(true);
  }

  /**
   * Detect if the user is signalling they want to end the interview.
   * Matches common phrases like "end the interview", "I'm done", "let's stop", etc.
   */
  function wantsToEndSession(text) {
    const t = text.toLowerCase();
    const patterns = [
      /\b(end|stop|finish|terminate|quit|exit|leave|close)\b.{0,15}\b(interview|session|call|this)\b/,
      /\b(i'?m|i am)\s+(done|finished|good)\b/,
      /\blet'?s\s+(stop|end|finish|wrap)\b/,
      /\b(that'?s|that is)\s+(all|it|enough)\b/,
      /\bi\s+(want|need|would like|wanna|gotta)\s+to\s+(end|stop|leave|go|finish|quit)/,
      /\bno\s+more\s+questions?\b/,
      /\bwrap\s*(it)?\s*up\b/,
      /\bi\s+don'?t\s+have\s+(any\s+)?(more|other)\s+questions?/,
      /\bcan\s+we\s+(end|stop|finish)/,
      /\bthank\s+you.*\bthat'?s\s+(all|it)\b/,
    ];
    return patterns.some(p => p.test(t));
  }

  // Start listening
  async function handleStartListening() {
    setIsListening(true);
    setCurrentInterim('');
    answerPartsRef.current = [];

    try {
      await startRecognition({
        onRecognizing: (text) => {
          setCurrentInterim(text);
        },
        onRecognized: (text) => {
          if (text.trim()) {
            answerPartsRef.current.push(text.trim());
            setUserAnswer(answerPartsRef.current.join(' '));
          }
          setCurrentInterim('');
        },
        onError: (err) => {
          console.error('STT error:', err);
          alert('Microphone error: ' + err + '\nYou can type your answer instead.');
        }
      });
    } catch (err) {
      console.error('Recognition start error:', err);
      alert('Could not start microphone: ' + (err.message || err) + '\nYou can type your answer instead.');
      setIsListening(false);
    }
  }

  // Stop listening and send answer
  async function handleStopListening() {
    setIsListening(false);
    setCurrentInterim('');
    await stopRecognition();

    const finalAnswer = answerPartsRef.current.join(' ').trim();
    if (!finalAnswer) return;

    addToTranscript('candidate', finalAnswer);
    setUserAnswer('');
    answerPartsRef.current = [];

    // Auto-end if user signals they want to leave
    if (wantsToEndSession(finalAnswer)) {
      handleEndSession();
      return;
    }

    // Get next question
    setIsThinking(true);
    setCanSpeak(false);
    try {
      const result = await sendAnswer({
        sessionId,
        answer: finalAnswer,
        timeRemaining
      });
      addToTranscript('interviewer', result.message);
      setIsThinking(false);
      await speakAgentMessage(result.message);

      // Auto-end if AI signalled the interview is complete
      if (result.interviewComplete) {
        handleEndSession();
        return;
      }
    } catch (err) {
      console.error('Response error:', err);
      setIsThinking(false);
      setCanSpeak(true);
    }
  }

  // Stop camera immediately
  function stopCamera() {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
      setCameraOn(false);
    }
  }

  // End session voluntarily
  async function handleEndSession() {
    if (ending || sessionEnded) return;
    sessionEndedRef.current = true;
    setEnding(true);
    setCanSpeak(false);
    setIsListening(false);
    setIsSpeaking(false);
    cancelSpeaking();
    stopCamera();
    try { await stopRecognition(); } catch (e) { /* ignore */ }

    const durationMinutes = Math.round((Date.now() - startTimeRef.current) / 60000);
    try {
      const result = await endInterview({
        sessionId,
        sessionDurationMinutes: durationMinutes,
        endReason: 'user'
      });
      setSessionEnded(true);
      clearInterval(timerRef.current);
      onEnd(result.feedback);
    } catch (err) {
      console.error('End session error:', err);
      sessionEndedRef.current = false;
      setEnding(false);
    }
  }

  // Force end at 30 minutes
  async function handleForceEnd() {
    if (sessionEnded) return;
    sessionEndedRef.current = true;
    setSessionEnded(true);
    setCanSpeak(false);
    setIsListening(false);
    setIsSpeaking(false);
    cancelSpeaking();
    stopCamera();
    await stopRecognition();

    addToTranscript('interviewer', "That's our time — thank you so much for coming in today. We'll be in touch.");

    try {
      await speakText("That's our time — thank you so much for coming in today. We'll be in touch.", null, null);
    } catch (e) { /* ignore */ }

    const durationMinutes = 30;
    try {
      const result = await forceEndInterview({
        sessionId,
        sessionDurationMinutes: durationMinutes
      });
      onEnd(result.feedback);
    } catch (err) {
      console.error('Force end error:', err);
    }
  }

  // Send typed answer (fallback)
  async function handleSendTyped() {
    const text = userAnswer.trim();
    if (!text) return;

    addToTranscript('candidate', text);
    setUserAnswer('');
    answerPartsRef.current = [];

    // Auto-end if user signals they want to leave
    if (wantsToEndSession(text)) {
      handleEndSession();
      return;
    }

    setIsThinking(true);
    setCanSpeak(false);
    try {
      const result = await sendAnswer({
        sessionId,
        answer: text,
        timeRemaining
      });
      addToTranscript('interviewer', result.message);
      setIsThinking(false);
      await speakAgentMessage(result.message);

      // Auto-end if AI signalled the interview is complete
      if (result.interviewComplete) {
        handleEndSession();
        return;
      }
    } catch (err) {
      console.error('Response error:', err);
      setIsThinking(false);
      setCanSpeak(true);
    }
  }

  const displayAnswer = isListening
    ? (answerPartsRef.current.join(' ') + ' ' + currentInterim).trim()
    : userAnswer;

  // Timer display
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timerText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const timerClass = timeRemaining <= 120 ? 'critical' : timeRemaining <= 300 ? 'warning' : '';

  // AI status
  const aiStatus = isPreparingAudio ? 'preparing' : isSpeaking ? 'speaking' : isThinking ? 'thinking' : 'idle';
  // User status
  const userStatus = isListening ? 'listening' : 'idle';

  return (
    <div className="session fade-in">
      {/* Video Grid */}
      <div className="video-grid">
        {/* AI Interviewer Tile */}
        <div className="video-tile tile-ai">
          <div className="tile-avatar">
            <AIAvatar persona={persona} isSpeaking={isSpeaking} size="lg" />
          </div>
          <div className={`tile-status status-${aiStatus}`}>
            {isPreparingAudio && (
              <>
                <div className="preparing-spinner" />
                Preparing audio…
              </>
            )}
            {isSpeaking && !isPreparingAudio && (
              <>
                <div className="speaking-bars">
                  <span /><span /><span /><span />
                </div>
                Speaking
              </>
            )}
            {isThinking && (
              <>
                <div className="thinking-dots">
                  <span /><span /><span />
                </div>
                Thinking...
              </>
            )}
            {!isSpeaking && !isThinking && !isPreparingAudio && 'Listening'}
          </div>
        </div>

        {/* User Tile */}
        <div className="video-tile tile-user">
          {cameraOn && localStream ? (
            <video
              ref={userVideoRef}
              autoPlay
              muted
              playsInline
              className="user-camera-feed"
            />
          ) : (
            <div className="tile-avatar">
              <div className={`avatar-circle avatar-user ${isListening ? 'listening-active' : ''}`}>
                <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
                  <circle cx="32" cy="22" r="14" fill="white" fillOpacity="0.85"/>
                  <path d="M10 56c0-12 10-22 22-22s22 10 22 22" fill="white" fillOpacity="0.6"/>
                </svg>
              </div>
              <span className="tile-name">You</span>
            </div>
          )}
          <div className={`tile-status status-${userStatus}`}>
            {isListening ? (
              <>
                <div className="speaking-bars">
                  <span /><span /><span /><span />
                </div>
                Speaking
              </>
            ) : canSpeak ? 'Ready' : 'Waiting'}
          </div>
        </div>
      </div>

      {/* Transcript Panel */}
      <div className={`transcript-panel ${showTranscript ? '' : 'collapsed'}`}>
        <div className="transcript-header">
          <h3>Transcript</h3>
          <button
            type="button"
            className="transcript-toggle"
            onPointerDown={(e) => { e.preventDefault(); setShowTranscript(false); }}
            onClick={() => setShowTranscript(false)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="transcript-scroll">
          {transcript.map((entry, i) => (
            <div key={i} className={`transcript-entry ${entry.role}`}>
              <div className="transcript-role">
                {entry.role === 'interviewer'
                  ? (entry.speaker || 'Interviewer')
                  : 'You'}
              </div>
              <div className="transcript-text">{entry.text}</div>
            </div>
          ))}
          {isListening && currentInterim && (
            <div className="transcript-entry candidate interim">
              <div className="transcript-role">You</div>
              <div className="transcript-text">{displayAnswer}</div>
            </div>
          )}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {!showTranscript && (
        <button className="show-transcript-btn" onClick={() => setShowTranscript(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Transcript
        </button>
      )}

      {/* Control Bar */}
      <div className="control-bar">
        {/* Timer */}
        <div className={`control-timer ${timerClass}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {timerText}
        </div>

        {/* Mic */}
        <button
          className={`control-btn mic ${isListening ? 'active' : ''}`}
          onClick={isListening ? handleStopListening : handleStartListening}
          disabled={(!canSpeak && !isListening) || isThinking || isSpeaking}
          title={isListening ? 'Stop & send' : 'Start speaking'}
        >
          {isListening ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {/* Chat toggle */}
        <button
          className={`control-btn chat ${showTranscript ? 'active' : ''}`}
          onClick={() => setShowTranscript(!showTranscript)}
          title="Toggle transcript"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        {/* Camera toggle */}
        <button
          className={`control-btn camera ${cameraOn ? 'active' : ''}`}
          onClick={toggleCamera}
          title={cameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {cameraOn ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          )}
        </button>

        {/* End Call — onPointerDown for reliable mobile touch */}
        <button
          className="control-btn end-call"
          onPointerDown={handleEndSession}
          disabled={ending}
          title="End interview"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        </button>

        {/* Text input */}
        <div className="control-text-input">
          <input
            type="text"
            placeholder={isListening ? 'Listening...' : 'Type answer...'}
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendTyped()}
            disabled={isListening || isThinking || isSpeaking}
          />
          <button
            className="send-btn"
            onClick={handleSendTyped}
            disabled={!userAnswer.trim() || isListening || isThinking || isSpeaking}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
