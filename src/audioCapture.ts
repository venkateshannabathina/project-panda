import * as recorder from 'node-record-lpcm16';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class AudioCapture {
  private recording: any = null;
  private outputPath: string = '';

  async startRecording(): Promise<void> {
    // Inject homebrew paths into the extension host's PATH so 'rec'/'sox' binary is found
    if (!process.env.PATH?.includes('/opt/homebrew/bin')) {
      process.env.PATH = `${process.env.PATH || ''}:/opt/homebrew/bin:/usr/local/bin`;
    }

    this.outputPath = path.join(os.tmpdir(), `buddy_${Date.now()}.wav`);
    
    const recordOptions: any = {
      sampleRate: 16000,
      channels: 1,
      audioType: 'wav'
    };
    if (os.platform() === 'win32') {
      recordOptions.recorder = 'sox';
    }
    
    this.recording = recorder.record(recordOptions);
    const fileStream = fs.createWriteStream(this.outputPath);
    this.recording.stream().pipe(fileStream);
  }

  async stopRecording(): Promise<string> {
    if (!this.recording) {
      console.warn('stopRecording called before startRecording');
      return '';
    }
    
    this.recording.stop();
    this.recording = null;
    
    // Wait for the file to flush completely to disk
    await new Promise((resolve) => setTimeout(resolve, 300));
    
    if (fs.existsSync(this.outputPath)) {
      return this.outputPath;
    }
    return '';
  }

  cleanup(filePath: string): void {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, () => {}); // silent cleanup
    }
  }
}
