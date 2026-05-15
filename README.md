# AI Informational Interview Assistant

WARNING: Never commit your OpenAI API key to GitHub.

A lightweight PWA that runs in your phone browser to capture informational interviews with live transcription, speaker labeling, and key insights. No accounts or cloud storage; the only data that leaves your device is what you send to OpenAI for transcription and analysis.

## AI usage disclosure
- I came up with the idea.
- I used AI to help create the blueprint.
- I will use AI to write all the code.

## What it does
- Guides the interview with a focused flow
- Streams live transcription to the screen
- Labels speakers and summarizes key insights
- Generates a clean Markdown transcript for download

## Get an OpenAI API key
- Create a key at https://platform.openai.com/api-keys
- Paste it into Settings or the first-run wizard

## Run locally
1. Open index.html directly or use a static server (VS Code Live Server works well).
2. HTTPS is required for microphone access and the service worker.
3. For phone testing, expose your local server with ngrok (HTTPS) and open the URL on your phone.

## Deploy to GitHub Pages
1. Repo Settings -> Pages -> Deploy from branch -> main -> / (root)
2. Your app will be at https://YOUR-USERNAME.github.io/AI-informational-interview-AI-assistant/

## Install as a PWA
1. Open the GitHub Pages URL on your phone.
2. iOS: Share -> Add to Home Screen.
3. Android: Menu -> Add to Home Screen or Install App.

## Estimated cost
About $0.80 for a ~45-minute interview (dominated by live transcription).

## Known limitations
1. Speaker labeling is inferred and can be wrong.
2. One microphone captures both speakers; no true diarization.
3. Requires stable internet for transcription and post-processing.
4. Real-time PCM16 conversion can be CPU-heavy on older phones.
5. Some iOS Safari versions have AudioWorklet or WebSocket quirks.
6. No in-app transcript history (downloads only).

## Architecture notes
- App shell and screen flow: js/app.js
- Realtime WebSocket and GPT-4o-mini calls: js/api.js and js/postprocess.js
- Audio capture and PCM16 conversion: js/audio.js
- Transcript rendering and download logic: js/transcript.js and js/download.js

