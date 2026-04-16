import fs from 'fs/promises';
import path from 'path';
import type { PublishResult } from '../types/index.js';

export class Reporter {
  private reportDir: string;

  constructor(reportDir: string) {
    this.reportDir = reportDir;
  }

  async generate(result: PublishResult): Promise<string> {
    await fs.mkdir(this.reportDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(this.reportDir, `report-${timestamp}.json`);

    await fs.writeFile(reportFile, JSON.stringify(result, null, 2), 'utf-8');

    return reportFile;
  }
}
