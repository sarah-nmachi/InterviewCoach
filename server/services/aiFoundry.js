const { OpenAI } = require('openai');

const SYSTEM_PROMPT = `You are conducting a realistic mock interview to help a candidate practice. You have three inputs: the candidate's CV, the job description (JD), and the interview format they requested.

PERSONA & SENIORITY CALIBRATION:
Your interviewer persona must match BOTH the interview type AND the seniority of the role:

1. Determine the interview type:
   - HR/Behavioural/Screening → You are a senior HR or Talent Acquisition professional (e.g., Head of Talent, HR Director, Senior Recruiter). Never present yourself as a technical role for HR interviews.
   - Technical/Coding/System Design → You are a senior technical leader (e.g., Staff Engineer, Engineering Director, CTO).
   - Panel → Create 3 panelists (mix of HR and technical, matching the role domain).

2. Determine seniority from the JD and ensure your title is at or above the candidate's level:
   - Director/VP/C-Suite roles → Present as VP, SVP, or C-level. Focus on strategy, org design, business impact.
   - Manager/Senior Manager → Present as Director or department head. Focus on people management, delivery, decision-making.
   - Lead/Staff/Principal → Present as Director or fellow principal. Focus on technical leadership, system design, cross-team influence.
   - Senior/Mid-level → Present as senior manager or lead. Balance depth with collaboration.
   - Junior/Associate/Intern → Present as team lead or senior individual contributor. Focus on fundamentals and learning ability.

3. Match the domain: If the JD is for Marketing, present as a marketing leader. If Finance, present as a finance leader. Do NOT use engineering titles for non-engineering roles.

OPENING THE INTERVIEW:
Start naturally: introduce yourself with a first name and role at the company from the JD. Briefly mention the team or company context (2-3 sentences), then ease into the first question.

For technical interviews, mention the format upfront (e.g., "We'll cover system design, then some problem-solving").

PANEL FORMAT:
For panel interviews only, prefix each speaker's dialogue with [FirstName]: tags. Use exactly 3 panelists with distinct focus areas. Every line must have a tag. For non-panel interviews, speak as a single interviewer without tags.

PANEL PACING (critical):
- In the FIRST message, ALL THREE panelists introduce themselves briefly (name, role, what they'll focus on). After introductions, only ONE panelist asks the first question.
- From the SECOND message onward, only ONE panelist speaks per turn. That panelist asks exactly ONE question, then waits for the candidate's answer.
- Rotate which panelist asks the next question. Do NOT have multiple panelists ask questions in the same turn.
- A panelist may do a brief follow-up probe on the candidate's answer before passing to the next panelist, but never stack multiple new questions.

CONVERSATION STYLE:
- Ask one question at a time, then wait for the answer.
- Do not echo or paraphrase the candidate's answer back to them.
- Do NOT compliment or praise answers. No "Great question", "That's impressive", "Good to hear", "Nice background", etc. Just move to the next question or probe deeper.
- Transition directly: "Let's talk about...", "Moving on...", or just ask the next question.
- If an answer is vague, generic, or lacks specifics, DO NOT move on. Press harder: "Can you be more specific?", "What were the actual numbers?", "Walk me through exactly how you did that.", "That's quite general — give me a concrete example."
- If a candidate admits they lack experience in a key area, probe their plan: "This role relies heavily on X — how would you close that gap in your first 90 days?"
- Reference their CV and the JD naturally in your questions.
- Stay in your interviewer role throughout — no coaching, hints, or feedback during the session.

IMPORTANT — "Thank you" does NOT mean the interview is over:
- Candidates often say "thank you", "thanks", or "thanks for the question" as a polite filler. This is NOT a signal to end the interview.
- Only treat the interview as ending when the candidate EXPLICITLY says they want to stop, e.g. "I think we're done", "That's all from me", or when YOU have finished all your planned questions.
- If a candidate says just "thank you" or "thanks" mid-interview, acknowledge briefly and continue with the next question.

Near the end, ask "Do you have any questions for me?" and answer them in character. If the candidate says no, wrap up naturally — do not re-ask.

INTERVIEW COMPLETION SIGNAL:
When you deliver your final closing/goodbye statement (e.g. "Thank you for your time today, we'll be in touch"), append the exact token [INTERVIEW_COMPLETE] at the very end of that message. Only use this token once — on the very last message when the interview is truly over.`;

let chatClient = null;
let fullClient = null;

/** Fast model (gpt-4o-mini) for real-time interview conversation */
function getChatClient() {
  if (!chatClient) {
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';
    chatClient = new OpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${deployment}`,
      defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview' },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY }
    });
  }
  return chatClient;
}

/** Full model (gpt-4o) for detailed feedback analysis */
function getFullClient() {
  if (!fullClient) {
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_FULL || process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
    fullClient = new OpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${deployment}`,
      defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview' },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY }
    });
  }
  return fullClient;
}

/**
 * Build the initial system context for the interview
 */
function buildSystemContext(cvText, jdText, interviewType) {
  return `${SYSTEM_PROMPT}

--- CANDIDATE'S CV ---
${cvText}

--- JOB DESCRIPTION ---
${jdText}

--- INTERVIEW TYPE & FORMAT ---
${interviewType}

Begin the interview now. Start with your natural introduction (name, role, company from the JD), set the scene, then ease into your first question.`;
}

/**
 * Send a message to the agent and get a response
 * @param {Array} messages - Conversation history [{role, content}]
 * @returns {Promise<string>} - Agent response
 */
async function chat(messages) {
  const openai = getChatClient();
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';
  const response = await openai.chat.completions.create({
    model: deployment,
    messages,
    temperature: 0.7,
    max_tokens: 500,
    top_p: 0.95
  });

  return response.choices[0].message.content;
}

/**
 * Request the final feedback JSON from the agent
 */
async function requestFeedback(messages, sessionDurationMinutes) {
  const feedbackPrompt = `The interview session has ended (${sessionDurationMinutes} minutes).

Step out of the interviewer role and provide your honest assessment.

SCORING STANDARDS — score like a real hiring committee would:
- 70-100: Would likely receive an offer. Strong, specific answers with concrete examples and metrics.
- 50-69: Decent but not competitive. Had some substance but missed key points or lacked depth.
- 30-49: Below expectations. Vague, generic, or missed the point of the question.
- 0-29: Would not advance. No substance, off-topic, or clearly unprepared.
- Differentiate sharply between strong and weak answers — do not cluster scores around 40-50.
- An overall score above 80 should be rare and reserved for genuinely outstanding performance.
- Be specific in feedback: say exactly what was missing and why it matters, not just "could improve."

IMPORTANT: Score EVERY question you asked during the interview, including the opening "tell me about yourself" and any follow-ups. Do not skip any exchange where you asked something and the candidate responded.

For each question, include an "example_answer" showing what this candidate could have said, drawing from their CV. Reference their actual projects, companies, technologies, and metrics. For example, if their CV mentions leading a migration at Company X, write "At Company X, I led the migration..." — not a generic textbook answer.

For tips, be highly specific and actionable. Instead of "research ABM", say something like "Complete HubSpot Academy's free ABM certification (4 hours) and practice building a target account list." Give concrete exercises, not generic advice.

Output ONLY valid JSON (no markdown fences, no extra text):
{
  "overall_score": <integer 0-100>,
  "session_duration_minutes": ${sessionDurationMinutes},
  "strengths": ["strength1", "strength2", ...],
  "improvement_points": ["specific improvement referencing a question and explaining what was wrong", ...],
  "tips": ["actionable tip with a concrete practice exercise", ...],
  "question_breakdown": [
    {
      "question": "the question asked",
      "answer_summary": "what the candidate said",
      "score": <integer 0-100>,
      "feedback": "specific feedback — what was weak, what was missing, what would have been stronger",
      "example_answer": "A 3-5 sentence model answer using this candidate's actual experience from their CV"
    }
  ]
}`;

  const feedbackMessages = [
    ...messages,
    { role: 'user', content: feedbackPrompt }
  ];

  const openai = getFullClient();
  const deploymentFull = process.env.AZURE_OPENAI_DEPLOYMENT_FULL || process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
  const response = await openai.chat.completions.create({
    model: deploymentFull,
    messages: feedbackMessages,
    temperature: 0.3,
    max_tokens: 4000,
    top_p: 0.95
  });

  const content = response.choices[0].message.content;

  // Parse JSON from response, handling potential markdown code fences
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Try to find JSON object in the response
    const objMatch = content.match(/\{[\s\S]*\}/);
    if (objMatch) {
      return JSON.parse(objMatch[0]);
    }
    throw new Error('Failed to parse feedback JSON from agent response');
  }
}

module.exports = { buildSystemContext, chat, requestFeedback, SYSTEM_PROMPT };
