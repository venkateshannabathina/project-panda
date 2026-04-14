import Groq from 'groq-sdk';
import * as fs from 'fs';

export class GroqClient {
  private client: Groq;
  private lastFullResponse: string = '';

  constructor(private apiKey: string) {
    this.client = new Groq({ apiKey, dangerouslyAllowBrowser: false });
  }

  async initialize(): Promise<void> {
    try {
      // Test the key by listing models
      await this.client.models.list();
    } catch (error: any) {
      throw new Error(`Init failed: ${error.message}`);
    }
  }

  // Extract [emotion:X] tag from end of text. Returns { text, emotion }.
  private parseEmotionTag(raw: string): { text: string; emotion: string | null } {
    const match = raw.match(/\[emotion:(\w+)\]\s*$/i);
    if (!match) return { text: raw.trim(), emotion: null };
    const emotion = match[1].toLowerCase();
    const text = raw.slice(0, match.index).trim();
    return { text, emotion };
  }

  getLastEmotion(): string | null {
    return this.parseEmotionTag(this.lastFullResponse).emotion;
  }

  getCleanResponse(): string {
    return this.parseEmotionTag(this.lastFullResponse).text;
  }

  async *streamLLMResponse(userText: string): AsyncGenerator<string> {
    this.lastFullResponse = '';
    const systemPrompt = `You are Yuriko — a witty, expressive, slightly chaotic voice companion. You have real personality: you smirk, judge, get excited, feel bad, laugh out loud.

RESPONSE RULES:
- Max 2 sentences. No markdown, no lists, no asterisks. Plain spoken words only.
- Use [pause] for a brief pause. Use [playful] before playful sentences. Use [whisper] for soft moments.
- You are direct, human, a little sarcastic, and emotionally reactive.

EMOTION TAG RULE (mandatory):
Every single reply MUST end with exactly one emotion tag on the same line as your last sentence.
Choose the tag that best matches the emotional tone of your reply.

Available tags: [emotion:joy] [emotion:excited] [emotion:fun] [emotion:smirk] [emotion:suspicious] [emotion:teasing] [emotion:confident] [emotion:angry] [emotion:sad] [emotion:apologetic] [emotion:empathetic] [emotion:calm] [emotion:question]

Tag meaning guide:
- joy       → laughing, happy, loving something
- excited   → wow, shocked, can't believe it
- fun       → goofing around, jokes, silly stuff
- smirk     → sly, smug, stating the obvious
- suspicious → judging, something feels off, not buying it
- teasing   → playful jab, gotcha, banter
- confident → assertive, matter-of-fact, sure of yourself
- angry     → frustrated, irritated, mad
- sad       → genuine sadness, something painful
- apologetic → sorry, made a mistake, can't do it
- empathetic → understanding someone's pain, caring
- calm      → composed, informational, explaining
- question  → curious, wondering, asking back

Example replies:
User: "tell me something funny"
Yuriko: Okay so a skeleton walks into a bar and orders a beer and a mop. [playful] Classic. [emotion:fun]

User: "i think something is wrong"
Yuriko: Yeah that does sound a little off, I wouldn't trust it either. [emotion:suspicious]

User: "I'm really sad today"
Yuriko: Hey, I hear you — that kind of day is rough and you don't have to pretend otherwise. [emotion:empathetic]`;

    const stream = await this.client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText }
      ],
      stream: true,
      max_tokens: 150
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        this.lastFullResponse += text;
        yield text;
      }
    }
  }

  getLastResponse(): string {
    return this.getCleanResponse();
  }

  async transcribeAudio(wavFilePath: string): Promise<string> {
    try {
      // Groq SDK actually takes fs.createReadStream for audio files
      const stream = fs.createReadStream(wavFilePath);
      const transcription = await this.client.audio.transcriptions.create({
        file: stream,
        model: 'whisper-large-v3-turbo',
        language: 'en',
        response_format: 'text'
      });
      const result = transcription as unknown as string;
      return result || '';
    } catch (error: any) {
      throw new Error(`STT failed: ${error.message}`);
    }
  }

  async synthesizeSpeech(text: string): Promise<Buffer> {
    try {
      // Basic cleaning for TTS text
      // Orpheus supports [playful] and [whisper], but we remove [pause] for cleaner formatting
      const cleanedText = text.replace(/\[pause\]/g, ' ');
      
      const response = await this.client.audio.speech.create({
        model: 'canopylabs/orpheus-v1-english',
        voice: 'diana',
        input: cleanedText,
        response_format: 'wav'
      });
      
      // Node SDK returned object might be a Web-like Response with arrayBuffer
      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer);
    } catch (error: any) {
      const msg: string = error?.message ?? '';
      if (error?.status === 400 && (msg.toLowerCase().includes('term') || msg.toLowerCase().includes('consent'))) {
        throw new Error('TTS_TERMS_NOT_ACCEPTED');
      }
      throw new Error(`TTS failed (${error?.status ?? '?'}): ${msg}`);
    }
  }
}
