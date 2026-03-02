import React from 'react';
import './Header.css';

export default function Header({ onNewSession, onViewHistory, showNav }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand" onClick={onNewSession}>
          <div className="header-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="32" y2="32">
                  <stop offset="0%" stopColor="#7C3AED" />
                  <stop offset="100%" stopColor="#14B8A6" />
                </linearGradient>
              </defs>
              <rect width="32" height="32" rx="8" fill="url(#logoGrad)" />
              <path d="M10 10h12v2H10v-2zm0 5h12v2H10v-2zm0 5h8v2h-8v-2z" fill="white" fillOpacity="0.9" />
              <circle cx="24" cy="22" r="4" fill="#10B981" />
              <path d="M23 22l1 1 2-2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="header-title">Interview Coach</span>
        </div>
        {showNav && (
          <nav className="header-nav">
            <button className="btn btn-secondary btn-sm" onClick={onViewHistory}>
              Past Sessions
            </button>
            <button className="btn btn-primary btn-sm" onClick={onNewSession}>
              New Session
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
