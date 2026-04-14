# 🎙️ Yuriko: Buddy Voice Companion

Yuriko represents the cutting edge of low-latency AI interaction. Built as a high-performance voice companion ("Buddy"), it combines the power of Groq's Llama 3.3 logic with the expressive Orpheus TTS model for a seamless, natural, and personality-driven user experience.

---

## ✨ Features

- **🚀 Near-Zero Latency**: Powered by Groq's Llama-3.3-70b and Orpheus TTS for instant responses.
- **🗣️ Natural Voice**: Uses advanced bracketed vocal directions (e.g., `[playful]`, `[whisper]`) for human-like delivery.
- **🎭 Chaotic Personality**: Buddy is designed to be direct, sarcastic, and conversational—not just another ChatGPT clone.
- **📡 Real-time Streaming**: Full streaming support for both text generation and audio buffer sequential playback.
- **🔌 Robust Proxy Server**: A Node.js backend handles API orchestration and error management.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express, Groq SDK.
- **Frontend**: Vanilla JavaScript (ES Module), HTML5, CSS3.
- **Recognition**: Web Speech API for real-time transcription.
- **Synthesis**: Groq Audio Speech API (Canopy Labs Orpheus).

---

## 🚀 Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- A [Groq Cloud](https://console.groq.com/) API Key.

### 2. Installation

Clone the repository and install dependencies:

```bash
cd yuriko
npm install
```

### 3. Configuration

Create a `.env` file in the root directory and add your Groq API Key:

```env
GROQ_API_KEY=your_api_key_here
PORT=3000
```

### 4. Running the Application

Start the proxy server:

```bash
npm start
```

Visit the application at: `http://localhost:3000`

---

## ⚠️ Important: Model Terms

The **Orpheus TTS** model requires a one-time terms acceptance in the Groq Console. If you receive a 400 error, visit the link below while logged in to your Groq account:

👉 [Accept Groq Orpheus Terms](https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english)

---

## 🔧 Troubleshooting

### Port 3000 Busy?
If you see `❌ Error: Port 3000 is already in use`, it means a previous instance is still running. You can kill it with:

```bash
# Find the Process ID
lsof -i :3000

# Kill it
kill -9 <PID>
```

### Shaky/Choppy Audio?
The system is configured to buffer the full response before speaking to ensure maximum smoothness. If Buddy is too silent, ensure your Groq API has sufficient rate limits.

---

## 📝 License
ISC License. Built with ❤️ for the future of AI Agents.