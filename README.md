# AI Interview Coach

A voice-first AI-powered mock interview application built with Microsoft Azure services. Practice realistic interviews with an AI interviewer that adapts to your CV, job description, and interview type.

**Created by [Sarah Anueyiagu](https://www.linkedin.com/in/sarah-anueyiagu/)**

---

## Features

- **Voice-First Experience** — Speak your answers using Azure Speech-to-Text; hear questions via Azure Text-to-Speech
- **Multi-Voice Panel Interviews** — Panel interviews use 3 distinct Azure Neural voices (Andrew, Ava, Brian) for each panelist
- **AI-Generated Avatars** — 15 photorealistic interviewer portraits generated with DALL-E 3
- **Smart CV Parsing** — Upload PDF/DOCX CVs parsed via Azure Document Intelligence
- **Dynamic Interview** — AI generates questions from your CV, the JD, and your described interview format
- **Natural Language Interview Type** — Describe the interview in your own words; no dropdowns
- **30-Minute Timed Sessions** — Countdown timer with automatic wrap-up
- **Structured Feedback** — Score ring, strengths, improvements, tips, and per-question breakdown
- **Session History** — All sessions saved to Azure Cosmos DB for review
- **Privacy-First** — Session data in sessionStorage (per-tab), Cosmos DB 24h TTL, uploaded files deleted after session
- **Mobile Responsive** — Works on phone for on-the-go practice

## Tech Stack

| Component | Service |
|---|---|
| LLM / Agent | Azure AI Foundry (GPT-4o) |
| Speech | Azure AI Speech Services |
| Document Parsing | Azure Document Intelligence |
| File Storage | Azure Blob Storage |
| Database | Azure Cosmos DB |
| Frontend | React + Vite |
| Backend | Node.js + Express |

## Prerequisites

- Node.js 18+
- Azure subscription with the following resources provisioned:
  - Azure OpenAI Service (GPT-4o deployment)
  - Azure AI Speech Services
  - Azure Document Intelligence
  - Azure Blob Storage account
  - Azure Cosmos DB (NoSQL API)

## Setup

1. **Clone and install dependencies:**

```bash
npm run install:all
```

2. **Configure environment variables:**

```bash
cp .env.example .env
# Edit .env with your Azure resource keys and endpoints
```

3. **Run in development mode:**

```bash
npm run dev
```

This starts the Express backend on port 3001 and the Vite dev server on port 5173. The Vite proxy forwards `/api` requests to the backend.

4. **Build for production:**

```bash
npm run build
npm start
```

## Project Structure

```
InterviewCoach/
├── client/                    # React frontend (Vite)
│   ├── src/
│   │   ├── components/        # UI components
│   │   │   ├── Onboarding     # CV/JD upload + interview type
│   │   │   ├── InterviewSession # Live interview with voice
│   │   │   ├── FeedbackReport # Detailed scoring + tips
│   │   │   ├── SessionHistory # Past sessions list
│   │   │   ├── ScoreRing      # Visual score display
│   │   │   ├── Waveform       # Animated mic waveform
│   │   │   ├── Timer          # Session countdown
│   │   │   └── Header         # Navigation bar
│   │   ├── services/
│   │   │   ├── api.js         # Backend API client
│   │   │   └── speechService.js # Azure Speech SDK wrapper
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── index.html
├── server/                    # Express backend
│   ├── routes/
│   │   ├── upload.js          # CV/JD upload & parsing
│   │   ├── interview.js       # Session management
│   │   ├── sessions.js        # History retrieval
│   │   └── speech.js          # Speech token endpoint
│   ├── services/
│   │   ├── aiFoundry.js       # Azure OpenAI integration
│   │   ├── documentIntelligence.js
│   │   ├── blobStorage.js
│   │   └── cosmosDb.js
│   └── server.js
├── .env.example
└── package.json
```

## How It Works

1. **Onboarding** — Upload CV (parsed by Document Intelligence), add JD (paste/URL/file), describe interview type in free text
2. **Interview** — AI agent asks dynamic questions via TTS; you answer via STT or typed text; live transcript shown throughout
3. **Timing** — 30-minute max; at 25 min the agent wraps up; at 28 min it moves to closing; at 30 min session auto-ends
4. **Feedback** — Structured JSON feedback parsed into: overall score, strengths, improvements, tips, per-question breakdown
5. **Privacy** — Uploaded files are deleted from Blob Storage after the session ends

## Deployment

For Azure App Service deployment:

```bash
npm run build
# Deploy the entire project; the Express server serves the React build from client/dist/
```

Set `NODE_ENV=production` in your App Service configuration and add all `.env` variables as Application Settings.

## Security

This project follows security best practices for handling Azure credentials:

- **No secrets in source code** — All API keys, connection strings, and credentials are loaded exclusively from environment variables via `process.env`.
- **`.env` is gitignored** — The `.env` file containing real secrets is excluded from version control via `.gitignore`. Only `.env.example` (with placeholder values) is committed.
- **Speech tokens are server-proxied** — The client never sees Azure Speech keys directly; it requests short-lived tokens from the Express backend (`/api/speech/token`).
- **Session isolation** — User data is stored in `sessionStorage` (per browser tab, cleared on close). Cosmos DB records have a 24-hour TTL.
- **File cleanup** — Uploaded CVs and JDs are deleted from Azure Blob Storage after the interview session ends.
- **No hardcoded endpoints** — Azure resource names and endpoints are configurable via `.env`.

> **Before pushing to GitHub:** Run `git diff --cached` to verify no `.env` file or secrets are staged. Consider using [GitHub secret scanning](https://docs.github.com/en/code-security/secret-scanning) and [Azure Key Vault](https://learn.microsoft.com/en-us/azure/key-vault/) for production deployments.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

**Created by [Sarah Anueyiagu](https://www.linkedin.com/in/sarah-anueyiagu/)** | Built with Microsoft Azure AI Services
