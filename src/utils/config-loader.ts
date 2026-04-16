import YAML from 'yaml';
import fs from 'fs/promises';
import path from 'path';
import type { ArticleConfig } from '../types/index.js';

export async function loadConfig(configPath: string): Promise<ArticleConfig> {
  const absolutePath = path.resolve(configPath);

  try {
    const content = await fs.readFile(absolutePath, 'utf-8');
    const parsed = YAML.parse(content);

    validateConfig(parsed);

    return parsed as ArticleConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`配置文件不存在: ${absolutePath}`);
    }
    throw error;
  }
}

export function validateConfig(config: unknown): asserts config is ArticleConfig {
  const c = config as Record<string, unknown>;

  if (!c.article || typeof c.article !== 'object') {
    throw new Error('配置缺少 article 字段');
  }

  const article = c.article as Record<string, unknown>;

  if (!article.title || typeof article.title !== 'string') {
    throw new Error('article.title 是必填项');
  }

  if (!article.content || typeof article.content !== 'string') {
    throw new Error('article.content 是必填项');
  }

  // 设置默认值
  c.settings = {
    headless: true,
    slowMo: 0,
    timeout: 120000,
    viewport: { width: 1920, height: 1080 },
    ...(c.settings as object || {}),
  };

  c.output = {
    logDir: './logs',
    reportDir: './reports',
    screenshots: true,
    ...(c.output as object || {}),
  };
}
