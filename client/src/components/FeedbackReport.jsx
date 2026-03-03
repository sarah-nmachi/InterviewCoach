import React, { useState } from 'react';
import ScoreRing from './ScoreRing';
import './FeedbackReport.css';

export default function FeedbackReport({ feedback, onNewSession, onRedoSession }) {
  const [expandedQ, setExpandedQ] = useState(null);

  const handleExport = () => {
    window.print();
  };

  if (!feedback) return null;

  const {
    overall_score = 0,
    session_duration_minutes = 0,
    short_session_notice = '',
    strengths = [],
    improvement_points = [],
    tips = [],
    question_breakdown = []
  } = feedback;

  return (
    <div className="feedback fade-in">
      <div className="feedback-container">
        <div className="feedback-header">
          <h1>Interview Feedback</h1>
          <p>Here's your detailed performance breakdown from this mock interview session.</p>
        </div>

        {/* Score + Duration */}
        <div className="feedback-score-section card">
          <div className="score-main">
            <ScoreRing score={overall_score} size={140} strokeWidth={10} />
            <div className="score-label">
              <h2>Overall Score</h2>
              <p>
                {overall_score >= 80 ? 'Excellent performance!'
                  : overall_score >= 60 ? 'Good effort — room for polish.'
                    : overall_score >= 40 ? 'Needs improvement in key areas.'
                      : 'Significant preparation needed.'}
              </p>
            </div>
          </div>
          {session_duration_minutes > 0 && (
            <div className="duration-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {session_duration_minutes} min session
            </div>
          )}
          {short_session_notice && (
            <div className="short-session-notice" style={{
              marginTop: '12px',
              padding: '10px 16px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '8px',
              color: '#F59E0B',
              fontSize: '0.85rem',
              fontWeight: 500,
              textAlign: 'center'
            }}>
              ⚠ {short_session_notice}
            </div>
          )}
        </div>

        {/* Strengths */}
        {strengths.length > 0 && (
          <div className="feedback-section card">
            <h3 className="section-title section-success">
              <span className="section-icon">✓</span>
              Strengths
            </h3>
            <ul className="feedback-list">
              {strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Improvement Points */}
        {improvement_points.length > 0 && (
          <div className="feedback-section card">
            <h3 className="section-title section-warning">
              <span className="section-icon">△</span>
              Areas for Improvement
            </h3>
            <ul className="feedback-list">
              {improvement_points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Tips */}
        {tips.length > 0 && (
          <div className="feedback-section card">
            <h3 className="section-title section-primary">
              <span className="section-icon">💡</span>
              Preparation Tips
            </h3>
            <ul className="feedback-list">
              {tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Question Breakdown */}
        {question_breakdown.length > 0 && (
          <div className="feedback-section">
            <h3 className="section-title" style={{ marginBottom: '16px' }}>
              Question-by-Question Breakdown
            </h3>
            <div className="accordion">
              {question_breakdown.map((q, i) => (
                <div key={i} className={`accordion-item card ${expandedQ === i ? 'open' : ''}`}>
                  <button
                    className="accordion-header"
                    onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                  >
                    <div className="accordion-header-left">
                      <span className="q-number">Q{i + 1}</span>
                      <span className="q-text">{q.question}</span>
                    </div>
                    <div className="accordion-header-right">
                      <span className={`q-score ${q.score >= 70 ? 'good' : q.score >= 50 ? 'ok' : 'low'}`}>
                        {q.score}/100
                      </span>
                      <svg
                        className="accordion-chevron"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </button>
                  {expandedQ === i && (
                    <div className="accordion-body">
                      <div className="q-detail">
                        <h4>Your Answer Summary</h4>
                        <p>{q.answer_summary}</p>
                      </div>
                      <div className="q-detail">
                        <h4>Feedback</h4>
                        <p>{q.feedback}</p>
                      </div>
                      {q.example_answer && (
                        <div className="q-detail example-answer">
                          <h4>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            Example of a Strong Answer
                          </h4>
                          <p>{q.example_answer}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="feedback-actions">
          <button className="btn btn-secondary btn-lg" onClick={handleExport}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export as PDF
          </button>
          {onRedoSession && (
            <button className="btn btn-accent btn-lg" onClick={onRedoSession}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Redo Interview
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={onNewSession}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            New Session
          </button>
        </div>
      </div>
    </div>
  );
}
