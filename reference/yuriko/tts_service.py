#!/usr/bin/env python3
"""
Python TTS Service using edge-tts
Runs on port 5000 and serves TTS audio
"""

import asyncio
import sys
from flask import Flask, request, send_file
from edge_tts import Communicate
import io

app = Flask(__name__)

# Voice mapping
VOICES = {
    'female': 'en-US-AriaNeural',
    'male': 'en-US-GuyNeural',
    'aria': 'en-US-AriaNeural',
    'guy': 'en-US-GuyNeural',
    'jenny': 'en-US-JennyNeural',
}

@app.route('/tts', methods=['POST'])
def tts():
    try:
        data = request.json
        text = data.get('text', '')
        voice = data.get('voice', 'female')
        
        if not text:
            return {'error': 'Text is required'}, 400
        
        # Get voice name
        voice_name = VOICES.get(voice.lower(), 'en-US-AriaNeural')
        
        # Generate TTS
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        async def generate_tts():
            communicate = Communicate(text, voice_name)
            audio_buffer = io.BytesIO()
            
            async for chunk in communicate.stream():
                if chunk['type'] == 'audio':
                    audio_buffer.write(chunk['data'])
            
            audio_buffer.seek(0)
            return audio_buffer
        
        audio_buffer = loop.run_until_complete(generate_tts())
        loop.close()
        
        return send_file(
            audio_buffer,
            mimetype='audio/mpeg',
            as_attachment=False
        )
    
    except Exception as e:
        return {'error': str(e)}, 500

@app.route('/health', methods=['GET'])
def health():
    return {'status': 'ok'}

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5050, debug=False)
