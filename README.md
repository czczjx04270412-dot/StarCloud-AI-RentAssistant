# RentLens

RentLens is an AI-powered rental inspection assistant for tenants. It helps users record on-site viewing evidence, save multiple rental homes, analyze housing risks, track signing questions, and generate exportable viewing reports.

## Features

- Guided rental inspection flow
- Photo evidence for each inspection step
- Audio recording and estimated noise levels
- Per-home saved inspection state
- Signing reminder checklist
- AI-backed field inspection analysis through DeepSeek
- Home analysis and viewing report UI
- HTML and Word report export
- OpenID-based data isolation structure for future WeChat Mini Program login

## Local Development

Create an environment file:

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-chat
```

Start the local server:

```bash
node server.js
```

Open:

```text
http://localhost:5174/index.html
```

## Deployment Note

This project includes a local demo backend that stores JSON data and uploads on disk. For real multi-user production use, replace local file storage with:

- a database for homes, reminders, reports, and users
- object storage for photos and audio
- real WeChat Mini Program login to obtain `openid`
- AI request rate limiting and usage control

Vercel can host the demo interface and serverless API structure, but local file persistence is not suitable for production on Vercel.
