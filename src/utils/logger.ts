import fs from 'fs/promises';
import path from 'path';

export class Logger {
  private logFile: string;
  private logDir: string;
  private writeQueue: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(logDir: string) {
    this.logDir = logDir;
    const date = new Date().toISOString().split('T')[0];
    this.logFile = path.join(logDir, `publish-${date}.log`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.logDir, { recursive: true });
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toLocaleString('zh-CN');
    return `[${timestamp}] [${level}] ${message}\n`;
  }

  private async flush(): Promise<void> {
    if (this.writeQueue.length === 0) return;

    await this.ensureDir();
    const content = this.writeQueue.join('');
    this.writeQueue = [];

    await fs.appendFile(this.logFile, content, 'utf-8');
  }

  log(level: string, message: string): void {
    const formatted = this.formatMessage(level, message);
    console.log(formatted.trim());
    this.writeQueue.push(formatted);

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => this.flush(), 100);
  }

  info(message: string): void {
    this.log('INFO', message);
  }

  error(message: string): void {
    this.log('ERROR', message);
  }

  warn(message: string): void {
    this.log('WARN', message);
  }

  debug(message: string): void {
    this.log('DEBUG', message);
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    await this.flush();
  }
}
