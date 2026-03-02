const API_BASE = '/api';

/**
 * Upload a CV file
 */
export async function uploadCV(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/upload/cv`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
  return res.json();
}

/**
 * Upload/process a job description
 */
export async function uploadJD({ file, url, text }) {
  if (file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/upload/jd`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
    return res.json();
  }
  const body = url ? { url } : { text };
  const res = await fetch(`${API_BASE}/upload/jd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
  return res.json();
}

/**
 * Start an interview session
 */
export async function startInterview({ cvText, jdText, interviewType, userId, cvBlobName, jdBlobName }) {
  const res = await fetch(`${API_BASE}/interview/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cvText, jdText, interviewType, userId, cvBlobName, jdBlobName })
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to start');
  return res.json();
}

/**
 * Send user answer and get next question
 */
export async function sendAnswer({ sessionId, answer, timeRemaining }) {
  const res = await fetch(`${API_BASE}/interview/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, answer, timeRemaining })
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to respond');
  return res.json();
}

/**
 * End session and get feedback
 */
export async function endInterview({ sessionId, sessionDurationMinutes, endReason }) {
  const res = await fetch(`${API_BASE}/interview/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, sessionDurationMinutes, endReason })
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to end');
  return res.json();
}

/**
 * Force end at 30-minute mark
 */
export async function forceEndInterview({ sessionId, sessionDurationMinutes }) {
  const res = await fetch(`${API_BASE}/interview/force-end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, sessionDurationMinutes })
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to force end');
  return res.json();
}

/**
 * Get speech token
 */
export async function getSpeechToken() {
  const res = await fetch(`${API_BASE}/speech/token`);
  if (!res.ok) throw new Error('Failed to get speech token');
  return res.json();
}

/**
 * Get session history
 */
export async function getSessionHistory(userId) {
  const res = await fetch(`${API_BASE}/sessions/${userId}`);
  if (!res.ok) throw new Error('Failed to get sessions');
  return res.json();
}

/**
 * Get session details
 */
export async function getSessionDetail(userId, sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${userId}/${sessionId}`);
  if (!res.ok) throw new Error('Failed to get session');
  return res.json();
}
