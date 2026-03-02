import React from 'react';
import './ScoreRing.css';

export default function ScoreRing({ score, size = 120, strokeWidth = 8 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (s) => {
    if (s >= 80) return 'var(--success)';
    if (s >= 60) return 'var(--primary)';
    if (s >= 40) return 'var(--warning)';
    return 'var(--danger)';
  };
  const color = getColor(score);

  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--gray-200)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="score-ring-progress"
        />
      </svg>
      <div className="score-ring-value" style={{ color }}>
        <span className="score-number">{score}</span>
        <span className="score-total">/100</span>
      </div>
    </div>
  );
}
