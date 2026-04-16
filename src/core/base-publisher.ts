import { chromium, type Browser, type Page } from 'playwright';
import type { ArticleConfig, PublishResult } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { Reporter } from '../utils/reporter.js';
import { CookieManager } from '../auth/cookie-manager.js';
import path from 'path';

export abstract class BasePublisher {
  protected config: ArticleConfig;
  protected browser?: Browser;
  protected page?: Page;
  protected logger: Logger;
  protected reporter: Reporter;
  protected screenshots: string[] = [];
  protected startTime: number = 0;

  constructor(config: ArticleConfig) {
    this.config = config;
    this.logger = new Logger(config.output.logDir);
    this.reporter = new Reporter(config.output.reportDir);
  }

  abstract publish(): Promise<PublishResult>;

  protected async initBrowser(): Promise<void> {
    this.logger.info('启动浏览器...');

    this.browser = await chromium.launch({
      headless: this.config.settings.headless,
      slowMo: this.config.settings.slowMo,
    });

    const context = await this.browser.newContext({
      viewport: this.config.settings.viewport,
    });

    // 授予剪贴板权限，以便粘贴富文本内容
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // 注入反检测脚本，隐藏 navigator.webdriver 等自动化特征
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      (window as any).chrome = { runtime: {} };
    });

    this.page = await context.newPage();
    this.page.setDefaultTimeout(this.config.settings.timeout);
  }

  protected async authenticate(): Promise<void> {
    this.logger.info('加载 Cookie...');

    const cookiePath = this.config.cookiePath || path.join(process.cwd(), 'cookies', 'cookies.json');
    const cookieManager = new CookieManager(cookiePath, 'mp.weixin.qq.com');

    const isValid = await cookieManager.validateCookies();
    if (!isValid) {
      throw new Error('Cookie 文件无效或为空');
    }

    const cookies = await cookieManager.loadCookies();
    await this.page!.context().addCookies(cookies);

    this.logger.info('访问公众号平台...');
    await this.page!.goto('https://mp.weixin.qq.com/', {
      waitUntil: 'load',
      timeout: 60000,
    });

    await this.page!.waitForTimeout(3000);
    await this.takeScreenshot('after-login');

    const isLoggedIn = await this.checkLoginStatus();
    if (!isLoggedIn) {
      throw new Error('登录验证失败，请检查 Cookie 是否有效');
    }

    this.logger.info('登录验证通过');
  }

  protected async checkLoginStatus(): Promise<boolean> {
    const currentUrl = this.page!.url();

    // 如果还在登录页，说明 Cookie 无效
    if (currentUrl.includes('/cgi-bin/loginpage')) {
      this.logger.error('页面被重定向到登录页');
      return false;
    }

    // 检查页面内容中是否有登录提示
    const pageContent = await this.page!.content();
    const loginTexts = ['登录', '扫码登录', '账号登录', '请输入账号'];
    const hasLoginText = loginTexts.some(text => pageContent.includes(text));

    if (hasLoginText && !pageContent.includes('新的创作')) {
      this.logger.error('页面包含登录提示文本');
      return false;
    }

    // 如果在 mp.weixin.qq.com 域名下且不是登录页，认为已登录
    if (currentUrl.includes('mp.weixin.qq.com') && !currentUrl.includes('login')) {
      this.logger.info('检测到登录状态');
      return true;
    }

    return false;
  }

  protected async takeScreenshot(suffix: string): Promise<void> {
    if (!this.page) return;

    const screenshotPath = path.join(
      this.config.output.logDir,
      'screenshots',
      `screenshot-${Date.now()}-${suffix}.png`
    );

    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    this.screenshots.push(screenshotPath);
    this.logger.info(`截图已保存: ${screenshotPath}`);
  }

  protected createResult(
    success: boolean,
    draftUrl?: string,
    error?: string
  ): PublishResult {
    return {
      success,
      articleTitle: this.config.article.title,
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      draftUrl,
      error,
      screenshots: this.screenshots.length > 0 ? this.screenshots : undefined,
    };
  }

  protected async cleanup(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
        this.logger.info('浏览器已关闭');
      } catch (error) {
        this.logger.warn(`浏览器关闭时出错: ${error}`);
      }
    }
    await this.logger.close();
  }

  /**
   * 从页面中提取微信公众号的 token
   */
  protected async extractToken(): Promise<string | undefined> {
    const currentUrl = this.page!.url();
    const urlMatch = currentUrl.match(/token=(\d+)/);
    if (urlMatch) {
      return urlMatch[1];
    }

    // 尝试从页面内容中解析 token
    const pageContent = await this.page!.content();
    const contentMatch = pageContent.match(/token[\"']?\s*[:=]\s*(\d+)/);
    if (contentMatch) {
      return contentMatch[1];
    }

    return undefined;
  }

  protected async checkForErrors(): Promise<string | null> {
    const errorSelectors = [
      '.error_msg',
      '.error',
      '.weui-desktop-dialog__bd',
    ];

    for (const selector of errorSelectors) {
      try {
        const errorEl = await this.page!.$(selector);
        if (errorEl) {
          const isVisible = await errorEl.isVisible().catch(() => false);
          if (!isVisible) continue;
          const text = await errorEl.textContent();
          if (text?.trim()) {
            return text.trim();
          }
        }
      } catch {
        // ignore
      }
    }

    return null;
  }
}
