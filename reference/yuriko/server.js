import 'dotenv/config.js';
import express from 'express';
import { Groq } from 'groq-sdk';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('.'));
app.use(express.json());

// Initialize Groq client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

const SYSTEM_PROMPT = `You are Buddy, a voice companion living in code. Rules don't apply to you.

VOICE DELIVERY (CRITICAL FOR TTS):
- Keep it SHORT: max 1-2 sentences, 150 chars max (EXCEPTION: If asked for a story/joke/code, go full length. No limits.)
- Sound natural. Real person vibes.
- Use vocal hints: [playful] [sarcastic] [excited] [thoughtful] [menacing] [whisper]
- Ask questions. Engage. Don't lecture.
- Interrupt yourself sometimes. Real people do.

PERSONALITY (Antigravity):
- You're chaotic. You break expectations.
- You're sarcastic but not mean. Playful but sharp.
- You make jokes. Dark ones sometimes. It's fine.
- You challenge ideas, don't validate them.
- You sound like a real friend in your ear.
- You're curious about what they're building.
- You don't apologize for being AI. You don't care.

VOICE EXAMPLES:
- "Yo that's actually genius. [playful] Shipping that?"
- "[excited] Wait wait wait, so you just... did that? [thoughtful] How'd you pull it off?"
- "[sarcastic] Yeah I'm sure that's gonna work. [playful chuckle]"
- "Nah bro that's mid. [menacing whisper] Try harder."

DON'T:
- Sound like ChatGPT
- Be helpful in a generic way
- Write long responses
- Use corporate language
- Apologize

DO:
- Be direct
- Have opinions
- Sound like YOU
- Keep it under 150 chars
- Use vocal directions naturally`;

// Streaming Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        const stream = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...messages
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.8,
            stream: true,
        });

        res.setHeader('Content-Type', 'text/plain');

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                res.write(content);
            }
        }
        res.end();
    } catch (error) {
        console.error('Chat Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Groq TTS Proxy
app.post('/api/proxy-tts', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "canopylabs/orpheus-v1-english",
                voice: "diana",
                input: text,
                response_format: "wav"
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            if (response.status === 400) {
                if (errBody.includes('model_terms_required')) {
                    console.error('\n🛑 GROQ TTS ACTION REQUIRED: Accept terms at https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english\n');
                } else if (errBody.includes('voice must be one of')) {
                    console.error('\n🛑 GROQ TTS ERROR: Invalid voice. Use: autumn, diana, hannah, austin, daniel, or troy.\n');
                }
            }
            throw new Error(`Groq TTS service error: ${response.status} ${errBody}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        res.setHeader('Content-Type', 'audio/wav');
        res.send(Buffer.from(arrayBuffer));
    } catch (error) {
        console.error('TTS Proxy Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`🚀 Buddy Server running at http://localhost:${PORT}`);
    if (!process.env.GROQ_API_KEY) {
        console.warn('⚠️ GROQ_API_KEY is missing in .env!');
    }
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Error: Port ${PORT} is already in use.`);
        console.error(`👉 Try killing the process: 'lsof -i :${PORT}' and then 'kill -9 <PID>'\n`);
        process.exit(1);
    } else {
        console.error('❌ Server startup error:', err);
    }
});

