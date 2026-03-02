import React, { useState, useCallback } from 'react';
import Header from './components/Header';
import Onboarding from './components/Onboarding';
import PreCallSetup from './components/PreCallSetup';
import InterviewSession from './components/InterviewSession';
import FeedbackReport from './components/FeedbackReport';
import SessionHistory from './components/SessionHistory';
import './App.css';

const VIEWS = {
  ONBOARDING: 'onboarding',
  PRE_CALL: 'pre_call',
  INTERVIEW: 'interview',
  FEEDBACK: 'feedback',
  HISTORY: 'history'
};

export default function App() {
  const [view, setView] = useState(VIEWS.ONBOARDING);
  const [sessionData, setSessionData] = useState(null);
  const [feedbackData, setFeedbackData] = useState(null);
  const [lastSessionMaterials, setLastSessionMaterials] = useState(null);
  const [prefillData, setPrefillData] = useState(null);
  const [callPrefs, setCallPrefs] = useState(null); // { cameraMode, cameraStream, aiPersona }
  const [userId] = useState(() => {
    let id = sessionStorage.getItem('interviewcoach_userId');
    if (!id) {
      id = 'user_' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem('interviewcoach_userId', id);
    }
    return id;
  });

  const handleStartInterview = useCallback((data) => {
    // Save the materials for redo
    if (data.materials) {
      setLastSessionMaterials(data.materials);
    }
    setSessionData(data);
    setPrefillData(null);
    setView(VIEWS.PRE_CALL);
  }, []);

  const handleJoinCall = useCallback((prefs) => {
    setCallPrefs(prefs);
    setView(VIEWS.INTERVIEW);
  }, []);

  const handleInterviewEnd = useCallback((feedback) => {
    setFeedbackData(feedback);
    setView(VIEWS.FEEDBACK);
  }, []);

  const handleNewSession = useCallback(() => {
    setSessionData(null);
    setFeedbackData(null);
    setPrefillData(null);
    setView(VIEWS.ONBOARDING);
  }, []);

  const handleRedoSession = useCallback(() => {
    setSessionData(null);
    setFeedbackData(null);
    if (lastSessionMaterials) {
      setPrefillData(lastSessionMaterials);
    }
    setView(VIEWS.ONBOARDING);
  }, [lastSessionMaterials]);

  const handleViewHistory = useCallback(() => {
    setView(VIEWS.HISTORY);
  }, []);

  const handleSelectSession = useCallback((session) => {
    if (session.feedback) {
      setFeedbackData(session.feedback);
      setView(VIEWS.FEEDBACK);
    }
  }, []);

  return (
    <div className="app">
      <Header
        onNewSession={handleNewSession}
        onViewHistory={handleViewHistory}
        showNav={view !== VIEWS.INTERVIEW && view !== VIEWS.PRE_CALL}
      />
      <main className="app-main">
        {view === VIEWS.ONBOARDING && (
          <Onboarding
            userId={userId}
            onStart={handleStartInterview}
            prefillData={prefillData}
          />
        )}
        {view === VIEWS.PRE_CALL && sessionData && (
          <PreCallSetup
            sessionData={sessionData}
            onJoin={handleJoinCall}
          />
        )}
        {view === VIEWS.INTERVIEW && sessionData && (
          <InterviewSession
            sessionData={sessionData}
            callPrefs={callPrefs}
            onEnd={handleInterviewEnd}
          />
        )}
        {view === VIEWS.FEEDBACK && feedbackData && (
          <FeedbackReport
            feedback={feedbackData}
            onNewSession={handleNewSession}
            onRedoSession={handleRedoSession}
          />
        )}
        {view === VIEWS.HISTORY && (
          <SessionHistory
            userId={userId}
            onSelect={handleSelectSession}
            onBack={handleNewSession}
          />
        )}
      </main>
      {view !== VIEWS.INTERVIEW && (
        <footer className="app-footer">
          Created by{' '}
          <a
            href="https://www.linkedin.com/in/sarah-anueyiagu/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Sarah Anueyiagu
          </a>
          {' '}| Built with Microsoft Azure AI Services
        </footer>
      )}
    </div>
  );
}
