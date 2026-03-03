import React, { useState, useRef, useEffect, useMemo } from 'react';
import AIAvatar, { detectPersona } from './AIAvatar';
import { unlockAudio } from '../services/speechService';
import './PreCallSetup.css';

export default function PreCallSetup({ sessionData, onJoin }) {
  const [cameraMode, setCameraMode] = useState('avatar'); // 'camera' | 'avatar'
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);

  // Auto-detect AI persona from interview type text
  const interviewTypeText = sessionData?.materials?.interviewType || '';
  const persona = useMemo(() => detectPersona(interviewTypeText), [interviewTypeText]);

  // Start/stop camera preview
  useEffect(() => {
    if (cameraMode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [cameraMode]);

  // Attach stream to video element
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  async function startCamera() {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      });
      setCameraStream(stream);
    } catch (err) {
      setCameraError('Camera access denied. You can still use an avatar.');
      setCameraMode('avatar');
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
  }

  function handleJoin() {
    // Unlock audio on iOS — must happen inside a direct user-gesture handler
    unlockAudio();
    onJoin({
      cameraMode,
      cameraStream: cameraMode === 'camera' ? cameraStream : null,
      aiPersona: persona.id
    });
  }

  return (
    <div className="precall fade-in">
      <div className="precall-container">
        <h1 className="precall-title">Set Up Your Interview</h1>
        <p className="precall-subtitle">Choose how you'd like to appear. Your AI interviewer has been matched to your interview type.</p>

        <div className="precall-grid">
          {/* Your Preview */}
          <div className="precall-section">
            <h3>Your Appearance</h3>
            <div className="precall-preview user-preview">
              {cameraMode === 'camera' && cameraStream ? (
                <video ref={videoRef} autoPlay muted playsInline className="precall-video" />
              ) : (
                <div className="precall-avatar-preview avatar-user-preview">
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="22" r="14" fill="white" fillOpacity="0.85"/>
                    <path d="M10 56c0-12 10-22 22-22s22 10 22 22" fill="white" fillOpacity="0.6"/>
                  </svg>
                </div>
              )}
            </div>
            {cameraError && <p className="precall-error">{cameraError}</p>}
            <div className="precall-toggle-row">
              <button
                className={`precall-toggle-btn ${cameraMode === 'camera' ? 'active' : ''}`}
                onClick={() => setCameraMode('camera')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 7l-7 5 7 5V7z"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
                Camera
              </button>
              <button
                className={`precall-toggle-btn ${cameraMode === 'avatar' ? 'active' : ''}`}
                onClick={() => setCameraMode('avatar')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="5"/>
                  <path d="M3 21v-2a7 7 0 0 1 14 0v2"/>
                </svg>
                Avatar
              </button>
            </div>
          </div>

          {/* AI Interviewer Preview (auto-detected) */}
          <div className="precall-section">
            <h3>Your AI Interviewer</h3>
            <div className="precall-ai-preview">
              <AIAvatar persona={persona} isSpeaking={false} size="lg" />
              <p className="precall-ai-match">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                Auto-matched to your interview type
              </p>
            </div>
          </div>
        </div>

        {/* Data notice */}
        <div className="precall-notice">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>Your data is not stored permanently. Session data is automatically deleted after 24 hours. Closing your browser clears your local history.</span>
        </div>

        <button className="btn btn-primary btn-lg precall-join" onClick={handleJoin}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Join Interview
        </button>
      </div>
    </div>
  );
}
