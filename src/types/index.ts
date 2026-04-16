export interface ArticleInfo {
  title: string;
  content: string;
  cover?: string;
  summary?: string;
  author?: string;
  original?: boolean;
}

export interface Settings {
  headless: boolean;
  slowMo: number;
  timeout: number;
  viewport: {
    width: number;
    height: number;
  };
}

export interface OutputConfig {
  logDir: string;
  reportDir: string;
  screenshots: boolean;
}

export interface ArticleConfig {
  article: ArticleInfo;
  settings: Settings;
  output: OutputConfig;
  cookiePath?: string;
}

export interface PublishResult {
  success: boolean;
  articleTitle: string;
  timestamp: string;
  duration: number;
  draftUrl?: string;
  error?: string;
  screenshots?: string[];
}
