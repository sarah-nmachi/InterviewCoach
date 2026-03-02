import React, { useState, useEffect } from 'react';
import { getSessionHistory } from '../services/api';
import './SessionHistory.css';

export default function SessionHistory({ userId, onSelect, onBack }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSessions();
  }, [userId]);

  async function loadSessions() {
    setLoading(true);
    try {
      const result = await getSessionHistory(userId);
      setSessions(result.sessions || []);
    } catch (err) {
      setError('Failed to load session history');
    } finally {
      setLoading(false);
    }
  }

  const getScoreColor = (score) => {
    if (score >= 80) return 'var(--success)';
    if (score >= 60) return 'var(--primary)';
    if (score >= 40) return 'var(--warning)';
    return 'var(--danger)';
  };

  return (
    <div className="history fade-in">
      <div className="history-container">
        <div className="history-header">
          <div>
            <h1>Past Sessions</h1>
            <p>Review your previous interview sessions and track your progress.</p>
          </div>
          <button className="btn btn-primary" onClick={onBack}>
            New Session
          </button>
        </div>

        {loading && (
          <div className="history-loading">
            <div className="loading-spinner" />
            <span>Loading sessions...</span>
          </div>
        )}

        {error && (
          <div className="onboarding-error">{error}</div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="history-empty card">
            <div className="empty-icon">📋</div>
            <h3>No sessions yet</h3>
            <p>Start your first mock interview to see results here.</p>
            <button className="btn btn-primary" onClick={onBack}>
              Start Interview
            </button>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div className="history-list">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="history-item card"
                onClick={() => onSelect(session)}
              >
                <div className="history-item-left">
                  <div className="history-date">
                    {new Date(session.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                  <div className="history-type">
                    {session.interviewType?.slice(0, 80)}
                    {(session.interviewType?.length || 0) > 80 ? '...' : ''}
                  </div>
                  <div className="history-meta">
                    {session.durationMinutes && (
                      <span>{session.durationMinutes} min</span>
                    )}
                    {session.totalQuestions && (
                      <span>{session.totalQuestions} questions</span>
                    )}
                    <span className={`status-badge ${session.status}`}>
                      {session.status}
                    </span>
                  </div>
                </div>
                {session.feedback?.overall_score !== undefined && (
                  <div
                    className="history-score"
                    style={{ color: getScoreColor(session.feedback.overall_score) }}
                  >
                    {session.feedback.overall_score}
                    <span>/100</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
