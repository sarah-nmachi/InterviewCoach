import React, { useMemo } from 'react';
import './AIAvatar.css';

// AI-generated photorealistic avatars stored in Azure Blob Storage
import avatarManifest from '../avatarManifest.json';

/**
 * Persona detection from interview type text
 */
const PERSONA_RULES = [
  {
    id: 'hr',
    label: 'HR Recruiter',
    keywords: ['hr', 'recruiter', 'screening', 'behavioral', 'culture', 'fit', 'phone screen', 'soft skill', 'motivation'],
    color: '#7C3AED',
    avatarStyle: 'formal'
  },
  {
    id: 'director',
    label: 'Engineering Director',
    keywords: ['director', 'vp', 'leadership', 'executive', 'management', 'strategy', 'stakeholder', 'head of', 'manager', 'senior leader'],
    color: '#1E40AF',
    avatarStyle: 'formal'
  },
  {
    id: 'technical',
    label: 'Technical Lead',
    keywords: ['technical', 'coding', 'system design', 'algorithm', 'data structure', 'architecture', 'engineer', 'developer', 'programming', 'leetcode', 'whiteboard', 'live coding'],
    color: '#14B8A6',
    avatarStyle: 'casual'
  },
  {
    id: 'panel',
    label: 'Panel Interviewer',
    keywords: ['panel', 'group', 'multiple', 'team', 'cross-functional', 'committee'],
    color: '#F59E0B',
    avatarStyle: 'mixed'
  }
];

/**
 * Auto-detect persona from interview type text
 */
export function detectPersona(interviewTypeText) {
  if (!interviewTypeText) return PERSONA_RULES[0];
  const lower = interviewTypeText.toLowerCase();

  let bestMatch = null;
  let bestScore = 0;

  for (const persona of PERSONA_RULES) {
    const score = persona.keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = persona;
    }
  }

  return bestMatch || PERSONA_RULES[0];
}

/**
 * Get persona by ID (for InterviewSession lookup)
 */
export function getPersonaById(id) {
  return PERSONA_RULES.find(p => p.id === id) || PERSONA_RULES[0];
}

/**
 * Pick a random photorealistic avatar URL from the manifest.
 * Prefers avatars matching the persona's style (formal / casual / mixed),
 * falls back to any avatar if no style-match found.
 * Selection is stable per persona ID (seeded by persona + session key).
 */
function pickAvatarUrl(persona) {
  if (!avatarManifest || avatarManifest.length === 0) {
    return 'https://api.dicebear.com/9.x/avataaars-neutral/svg?seed=fallback&backgroundColor=transparent';
  }

  const preferred = avatarManifest.filter(a => a.style === persona.avatarStyle);
  const pool = preferred.length > 0 ? preferred : avatarManifest;

  const sessionSeed = typeof window !== 'undefined'
    ? (window.__avatarSeed || (window.__avatarSeed = Date.now()))
    : 0;
  const hash = [...(persona.id + sessionSeed)].reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0);
  const idx = Math.abs(hash) % pool.length;

  return pool[idx].url;
}

/**
 * Pick 3 distinct avatars for the panel round-table layout.
 * Uses a mix of formal and mixed styles for diverse panel look.
 */
function pickPanelAvatars() {
  if (!avatarManifest || avatarManifest.length < 3) {
    return avatarManifest.map(a => a.url);
  }

  const sessionSeed = typeof window !== 'undefined'
    ? (window.__avatarSeed || (window.__avatarSeed = Date.now()))
    : 0;
  const hash = [...('panel' + sessionSeed)].reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0);

  // Pick from formal and mixed pools for a professional panel look
  const formal = avatarManifest.filter(a => a.style === 'formal');
  const mixed = avatarManifest.filter(a => a.style === 'mixed');
  const pool = [...formal, ...mixed];
  const fallbackPool = pool.length >= 3 ? pool : avatarManifest;

  const startIdx = Math.abs(hash) % fallbackPool.length;
  const urls = [];
  for (let i = 0; i < 3; i++) {
    urls.push(fallbackPool[(startIdx + i) % fallbackPool.length].url);
  }
  return urls;
}

/**
 * AIAvatar Component
 * Renders a photorealistic AI-generated avatar — fills the entire tile.
 * For panel interviews, renders a round-table layout with 3 interviewers.
 *
 * Props:
 *  - persona: persona object from detectPersona()
 *  - isSpeaking: boolean
 *  - size: 'sm' | 'md' | 'lg' (default: 'lg')
 *  - className: extra classes
 */
export default function AIAvatar({ persona, isSpeaking = false, size = 'lg', className = '' }) {
  const isPanel = persona.id === 'panel';
  const avatarUrl = useMemo(() => isPanel ? null : pickAvatarUrl(persona), [persona.id]);
  const panelUrls = useMemo(() => isPanel ? pickPanelAvatars() : [], [persona.id]);

  // Panel round-table layout
  if (isPanel) {
    return (
      <div className={`ai-avatar ai-avatar--${size} ${isSpeaking ? 'ai-avatar--speaking' : ''} ${className}`}>
        {isSpeaking && (
          <>
            <div className="ai-avatar__pulse-ring ai-avatar__pulse-ring--1" style={{ borderColor: persona.color }} />
            <div className="ai-avatar__pulse-ring ai-avatar__pulse-ring--2" style={{ borderColor: persona.color }} />
          </>
        )}

        <div className={`panel-roundtable ${isSpeaking ? 'panel-roundtable--speaking' : ''}`}>
          {/* Round conference table */}
          <div className="panel-table" />
          {/* 3 panelists arranged around the table */}
          {panelUrls.map((url, i) => (
            <div key={i} className={`panel-seat panel-seat--${i + 1}`}>
              <img src={url} alt={`Panelist ${i + 1}`} className="panel-seat__img" />
            </div>
          ))}
        </div>

        <span className="ai-avatar__label">{persona.label}</span>
      </div>
    );
  }

  // Single interviewer
  return (
    <div className={`ai-avatar ai-avatar--${size} ${isSpeaking ? 'ai-avatar--speaking' : ''} ${className}`}>
      {/* Speaking ring pulse */}
      {isSpeaking && (
        <>
          <div className="ai-avatar__pulse-ring ai-avatar__pulse-ring--1" style={{ borderColor: persona.color }} />
          <div className="ai-avatar__pulse-ring ai-avatar__pulse-ring--2" style={{ borderColor: persona.color }} />
        </>
      )}

      {/* Avatar container */}
      <div className="ai-avatar__frame" style={{ borderColor: isSpeaking ? persona.color : 'transparent' }}>
        <img
          src={avatarUrl}
          alt={persona.label}
          className="ai-avatar__image"
        />
      </div>

      <span className="ai-avatar__label">{persona.label}</span>
    </div>
  );
}
