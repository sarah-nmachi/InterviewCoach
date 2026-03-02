import React from 'react';
import './Timer.css';

export default function Timer({ timeRemaining }) {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const isWarning = timeRemaining <= 300; // 5 min
  const isCritical = timeRemaining <= 120; // 2 min

  return (
    <div className={`timer ${isWarning ? 'warning' : ''} ${isCritical ? 'critical' : ''}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>{formatted} remaining</span>
    </div>
  );
}
