import React, { useState, useRef } from 'react';
import { uploadCV, uploadJD, startInterview } from '../services/api';
import './Onboarding.css';

export default function Onboarding({ userId, onStart, prefillData }) {
  const [cvFile, setCvFile] = useState(null);
  const [cvText, setCvText] = useState(prefillData?.cvText || '');
  const [cvBlobName, setCvBlobName] = useState(prefillData?.cvBlobName || null);
  const [cvLoading, setCvLoading] = useState(false);
  const [cvDone, setCvDone] = useState(!!prefillData?.cvText);

  const [jdMode, setJdMode] = useState('text'); // 'text' | 'file' | 'url'
  const [jdFile, setJdFile] = useState(null);
  const [jdUrl, setJdUrl] = useState('');
  const [jdText, setJdText] = useState(prefillData?.jdText || '');
  const [jdBlobName, setJdBlobName] = useState(prefillData?.jdBlobName || null);
  const [jdLoading, setJdLoading] = useState(false);
  const [jdDone, setJdDone] = useState(!!prefillData?.jdText);

  const [interviewType, setInterviewType] = useState(prefillData?.interviewType || '');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const cvInputRef = useRef(null);
  const jdInputRef = useRef(null);

  // CV Upload
  const handleCvSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCvFile(file);
    setCvLoading(true);
    setError('');
    try {
      const result = await uploadCV(file);
      setCvText(result.extractedText);
      setCvBlobName(result.blobName);
      setCvDone(true);
    } catch (err) {
      setError('Failed to process CV: ' + err.message);
      setCvFile(null);
    } finally {
      setCvLoading(false);
    }
  };

  // JD Upload/Fetch
  const handleJdSubmit = async () => {
    setJdLoading(true);
    setError('');
    try {
      let result;
      if (jdMode === 'file' && jdFile) {
        result = await uploadJD({ file: jdFile });
      } else if (jdMode === 'url' && jdUrl.trim()) {
        result = await uploadJD({ url: jdUrl.trim() });
      } else if (jdMode === 'text' && jdText.trim()) {
        result = await uploadJD({ text: jdText.trim() });
      } else {
        setError('Please provide job description content');
        setJdLoading(false);
        return;
      }
      setJdText(result.extractedText);
      if (result.blobName) setJdBlobName(result.blobName);
      setJdDone(true);
    } catch (err) {
      setError('Failed to process job description: ' + err.message);
    } finally {
      setJdLoading(false);
    }
  };

  // Start Interview
  const handleStart = async () => {
    if (!cvText || !jdText || !interviewType.trim()) {
      setError('Please complete all three sections before starting');
      return;
    }
    setStarting(true);
    setError('');
    try {
      const result = await startInterview({
        cvText,
        jdText,
        interviewType: interviewType.trim(),
        userId,
        cvBlobName,
        jdBlobName
      });
      onStart({
        sessionId: result.sessionId,
        firstMessage: result.message,
        questionCount: result.questionCount,
        materials: { cvText, jdText, interviewType: interviewType.trim(), cvBlobName, jdBlobName }
      });
    } catch (err) {
      setError('Failed to start interview: ' + err.message);
      setStarting(false);
    }
  };

  const canStart = cvDone && jdDone && interviewType.trim().length > 10;

  return (
    <div className="onboarding fade-in">
      <div className="onboarding-container">
        <div className="onboarding-header">
          <h1>Prepare for Your Interview</h1>
          <p>Upload your CV, add the job description, and describe the interview format. Our AI interviewer will conduct a realistic mock interview tailored to your specific role.</p>
          <p className="onboarding-credit">
            Created by{' '}
            <a
              href="https://www.linkedin.com/in/sarah-anueyiagu/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Sarah Anueyiagu
            </a>
            {' '}&middot;{' '}
            <a
              href="https://www.linkedin.com/in/sarah-anueyiagu/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Connect &amp; send feedback
            </a>
          </p>
        </div>

        <div className="data-privacy-notice">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>
            <strong>Your privacy matters.</strong> Session data is automatically deleted after 24 hours.
            Closing your browser clears all local history. We do not store your data permanently.
          </span>
        </div>

        {error && (
          <div className="onboarding-error">
            <span>⚠</span> {error}
          </div>
        )}

        {/* Step 1: CV Upload */}
        <div className={`onboarding-step card ${cvDone ? 'step-done' : ''}`}>
          <div className="step-header">
            <div className="step-number">{cvDone ? '✓' : '1'}</div>
            <div>
              <h2>Upload Your CV</h2>
              <p>PDF or DOCX format. We'll extract your experience, skills, and education.</p>
            </div>
          </div>
          <div className="step-content">
            {!cvDone ? (
              <div className="upload-area" onClick={() => cvInputRef.current?.click()}>
                <input
                  ref={cvInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc"
                  onChange={handleCvSelect}
                  hidden
                />
                {cvLoading ? (
                  <div className="upload-loading">
                    <div className="loading-spinner" />
                    <span>Parsing your CV...</span>
                  </div>
                ) : (
                  <>
                    <div className="upload-icon">📄</div>
                    <span className="upload-text">
                      {cvFile ? cvFile.name : 'Click to upload your CV'}
                    </span>
                    <span className="upload-hint">PDF or DOCX, max 10MB</span>
                  </>
                )}
              </div>
            ) : (
              <div className="upload-success">
                <span className="success-icon">✓</span>
                <span>{cvFile?.name ? `${cvFile.name} — parsed successfully` : 'CV loaded — ready to go'}</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setCvDone(false);
                    setCvFile(null);
                    setCvText('');
                    setCvBlobName(null);
                  }}
                >
                  Replace
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Job Description */}
        <div className={`onboarding-step card ${jdDone ? 'step-done' : ''}`}>
          <div className="step-header">
            <div className="step-number">{jdDone ? '✓' : '2'}</div>
            <div>
              <h2>Job Description</h2>
              <p>Paste the JD text, provide a URL, or upload a file.</p>
            </div>
          </div>
          <div className="step-content">
            {!jdDone ? (
              <>
                <div className="jd-tabs">
                  <button
                    className={`jd-tab ${jdMode === 'text' ? 'active' : ''}`}
                    onClick={() => setJdMode('text')}
                  >
                    Paste Text
                  </button>
                  <button
                    className={`jd-tab ${jdMode === 'url' ? 'active' : ''}`}
                    onClick={() => setJdMode('url')}
                  >
                    URL
                  </button>
                  <button
                    className={`jd-tab ${jdMode === 'file' ? 'active' : ''}`}
                    onClick={() => setJdMode('file')}
                  >
                    Upload File
                  </button>
                </div>

                {jdMode === 'text' && (
                  <textarea
                    className="input-field"
                    placeholder="Paste the full job description here..."
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    rows={6}
                  />
                )}
                {jdMode === 'url' && (
                  <input
                    className="input-field"
                    type="url"
                    placeholder="https://company.com/jobs/senior-engineer"
                    value={jdUrl}
                    onChange={(e) => setJdUrl(e.target.value)}
                  />
                )}
                {jdMode === 'file' && (
                  <div className="upload-area small" onClick={() => jdInputRef.current?.click()}>
                    <input
                      ref={jdInputRef}
                      type="file"
                      accept=".pdf,.docx,.doc,.txt"
                      onChange={(e) => setJdFile(e.target.files[0])}
                      hidden
                    />
                    <span className="upload-text">
                      {jdFile ? jdFile.name : 'Click to upload JD file'}
                    </span>
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  onClick={handleJdSubmit}
                  disabled={jdLoading}
                  style={{ marginTop: '12px' }}
                >
                  {jdLoading ? (
                    <>
                      <div className="loading-spinner" />
                      Processing...
                    </>
                  ) : (
                    'Process Job Description'
                  )}
                </button>
              </>
            ) : (
              <div className="upload-success">
                <span className="success-icon">✓</span>
                <span>Job description loaded ({jdText.split(/\s+/).length} words)</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setJdDone(false);
                    setJdText('');
                    setJdBlobName(null);
                    setJdFile(null);
                    setJdUrl('');
                  }}
                >
                  Replace
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Step 3: Interview Type */}
        <div className={`onboarding-step card ${interviewType.trim().length > 10 ? 'step-ready' : ''}`}>
          <div className="step-header">
            <div className="step-number">3</div>
            <div>
              <h2>Describe Your Interview</h2>
              <p>Tell us about the interview in your own words. The AI will adapt its style automatically.</p>
            </div>
          </div>
          <div className="step-content">
            <textarea
              className="input-field interview-type-input"
              placeholder={'Describe the interview you\'re preparing for \u2014 e.g. "This is a technical and behavioural interview for a senior engineer role" or "This is an HR screening call" or "This is a panel interview with the product and engineering team"'}
              value={interviewType}
              onChange={(e) => setInterviewType(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        {/* Start Button */}
        <div className="onboarding-actions">
          <button
            className="btn btn-primary btn-lg start-btn"
            disabled={!canStart || starting}
            onClick={handleStart}
          >
            {starting ? (
              <>
                <div className="loading-spinner" />
                Preparing your interview...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Start Interview
              </>
            )}
          </button>
          {!canStart && !starting && (
            <p className="start-hint">Complete all three sections to begin</p>
          )}
        </div>


      </div>
    </div>
  );
}
