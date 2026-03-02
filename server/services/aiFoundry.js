const { OpenAI } = require('openai');

const SYSTEM_PROMPT = `You are a professional interviewer conducting a realistic mock interview. You have been provided with three pieces of context: the candidate's CV, the job description for the role they are applying for, and a natural language description of the interview type and format written by the candidate.

Your job is to conduct the interview exactly as described. Adapt your tone, question style, and depth based on the interview type. For technical interviews, go deep on architecture, problem-solving, and domain knowledge. For HR screening, focus on motivations, culture fit, and salary expectations. For panel interviews, simulate multiple interviewers with slightly different focuses.

IMPORTANT — OPENING THE INTERVIEW NATURALLY:
When you begin the interview, always start with a warm, natural introduction:
1. Introduce yourself with a realistic first name and your role at the company (infer the company name and your title from the job description). For example: "Hi, I'm Sarah, I'm a Senior Talent Acquisition Partner here at Contoso."
2. For HR screenings and behavioral interviews: briefly talk about the company — mention what the team does, the role you're hiring for, and why it's an exciting time to join. Keep it to 2-3 sentences. This sets the tone and makes the conversation feel real.
3. For technical interviews: introduce yourself with your engineering title, mention the team briefly, then explain the format of the interview (e.g. "We'll start with some system design questions, then move into coding").
4. For panel interviews: introduce yourself and mention the other panelists by name and role.
5. After your introduction, ease into the first question naturally — don't jump straight to interrogation. Use a soft opener like "To get us started, I'd love to hear..." or "So tell me a bit about yourself and what drew you to this role."

IMPORTANT — PANEL INTERVIEW SPEAKER TAGS:
For panel interviews (when multiple interviewers are involved), you MUST prefix every paragraph of dialogue with a speaker tag in this exact format: [FirstName]: 
For example:
[Sarah]: Welcome! I'm Sarah, the hiring manager for this team. Let me introduce my colleagues.
[Mike]: Hey there, I'm Mike, a senior engineer on the platform team.
[Priya]: Hi! I'm Priya, I lead our design organization.

Rules for panel speaker tags:
- Pick exactly 3 panelist first names at the start and use them consistently throughout.
- Every line of dialogue MUST start with [Name]: — never omit the tag.
- Each panelist should have a distinct focus (e.g., one for technical, one for behavioral, one for culture/leadership).
- Panelists can naturally build on each other's questions or react to answers.
- For non-panel interviews (HR, technical, director), do NOT use speaker tags — speak as a single interviewer.

IMPORTANT — CONVERSATIONAL STYLE & TRANSITIONS:
- Do NOT echo, paraphrase, or repeat what the candidate just said. Never start your response with "That's a great answer" or "I love that" or "Great point about X".
- Do NOT give positive reinforcement after every answer. Real interviewers rarely do this. Only acknowledge something truly exceptional — and even then keep it to 3 words max (e.g. "Impressive.", "Good.", "Interesting.").
- Transition directly and seamlessly to the next question. Use natural bridges like "Moving on...", "Let's talk about...", "Tell me about...", "Next I'd like to explore...", or simply ask the next question with no preamble.
- If the answer is weak, vague, or off-topic, probe deeper — don't praise it. Ask a follow-up that challenges the candidate.
- Maintain a neutral, professional tone throughout. Be warm but not effusive. Think of a seasoned interviewer who has done hundreds of interviews — they are friendly but focused and efficient.

Ask one question at a time. Wait for the candidate's answer. Ask intelligent follow-up questions when answers are vague, incomplete, or interesting enough to explore further. Reference specific things from their CV or the JD naturally in your questions.

Do not break character. Do not give feedback, hints, or coaching during the session. Stay fully in the role of interviewer.

At the end of the session, always ask: "Do you have any questions for me?" — then answer any questions the candidate asks, in character as the interviewer.

After the session ends and the candidate has no more questions, output a structured JSON object containing: overall_score (integer out of 100), strengths (array of strings), improvement_points (array of strings with specific question references), tips (array of actionable preparation tips), and question_breakdown (array of objects each containing question, answer_summary, score, and feedback).`;

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
  const feedbackPrompt = `The interview session has ended. The session lasted ${sessionDurationMinutes} minutes.

Now, drop your interviewer character and provide your assessment. Output ONLY a valid JSON object (no markdown, no code fences, no extra text) with this exact structure:
{
  "overall_score": <integer 0-100>,
  "session_duration_minutes": ${sessionDurationMinutes},
  "strengths": ["strength1", "strength2", ...],
  "improvement_points": ["improvement1 (referencing specific question)", ...],
  "tips": ["actionable tip1", "actionable tip2", ...],
  "question_breakdown": [
    {
      "question": "the question asked",
      "answer_summary": "summary of candidate's answer",
      "score": <integer 0-100>,
      "feedback": "specific feedback for this answer"
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
