#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { loadConfig } from './utils/config-loader.js';
import { Publisher } from './core/publisher.js';
import { chromium } from 'playwright';
import { CookieManager } from './auth/cookie-manager.js';
import fs from 'fs/promises';

const program = new Command();

function resolveCookiePath(optionPath?: string): string {
  if (optionPath) return path.resolve(optionPath);
  if (process.env.WECHAT_COOKIE_PATH) return path.resolve(process.env.WECHAT_COOKIE_PATH);
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    return path.join(homeDir, '.config', 'weixingongzhonghao', 'cookies.json');
  }
  return path.join(process.cwd(), 'cookies', 'cookies.json');
}

async function performLogin(cookiePath: string, reason?: string): Promise<void> {
  if (reason) {
    console.log(chalk.blue(reason));
  }
  console.log(chalk.blue('🔓 打开浏览器等待扫码登录...'));
  console.log(chalk.yellow('   请在弹出的浏览器窗口中，使用微信扫码登录公众号平台'));

  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();

  await page.goto('https://mp.weixin.qq.com/', {
    waitUntil: 'load',
    timeout: 120000,
  });

  console.log(chalk.blue('⏳ 等待扫码登录...'));

  // 等待登录成功：URL 不再是登录页，或者页面出现"新的创作"
  await page.waitForFunction(
    () => {
      const url = window.location.href;
      const content = document.body?.innerText || '';
      return !url.includes('/cgi-bin/loginpage') && (content.includes('新的创作') || content.includes('图文消息'));
    },
    { timeout: 300000, polling: 500 }
  );

  await page.waitForTimeout(3000);

  const cookies = await context.cookies();
  const cookieManager = new CookieManager(cookiePath, 'mp.weixin.qq.com');
  await cookieManager.saveCookies(cookies);

  console.log(chalk.green(`✅ 登录成功，Cookie 已保存到: ${cookiePath}`));

  await browser.close();
}

async function ensureLogin(cookiePath: string): Promise<void> {
  const cookieManager = new CookieManager(cookiePath, 'mp.weixin.qq.com');
  const isValid = await cookieManager.validateCookies();

  if (isValid) {
    // 快速验证 cookie 是否真的有效
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await context.newPage();
      const cookies = await cookieManager.loadCookies();
      await context.addCookies(cookies);

      await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);

      const currentUrl = page.url();
      const pageContent = await page.content();
      const isLoggedIn = !currentUrl.includes('/cgi-bin/loginpage') &&
        (pageContent.includes('新的创作') || pageContent.includes('图文消息'));

      if (isLoggedIn) {
        return;
      }
    } finally {
      await browser.close();
    }
  }

  await performLogin(cookiePath, '⏳ 未检测到有效登录，等待扫码登录...');
}

program
  .name('weixingongzhonghao-publisher')
  .description('微信公众号图文自动发布到草稿箱工具')
  .version('1.0.0');

program
  .command('publish')
  .description('发布图文到微信公众号草稿箱')
  .option('-c, --config <path>', '配置文件路径')
  .option('-f, --file <path>', '文章 HTML 文件路径')
  .option('-t, --title <title>', '文章标题（不传则自动读取 HTML <title> 或文件名）')
  .option('--cookie <path>', 'Cookie 文件路径')
  .option('--debug', '调试模式（显示浏览器窗口）')
  .action(async (options) => {
    try {
      const cookiePath = resolveCookiePath(options.cookie);
      await ensureLogin(cookiePath);

      let config: import('./types/index.js').ArticleConfig;

      if (options.config) {
        const configPath = path.resolve(options.config);
        console.log(chalk.blue('📋 加载配置文件...'));
        config = await loadConfig(configPath);
        config.cookiePath = cookiePath;
      } else if (options.file) {
        const filePath = path.resolve(options.file);
        let title = options.title;
        if (!title) {
          try {
            const html = await fs.readFile(filePath, 'utf-8');
            const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
            title = match?.[1]?.trim() || path.basename(filePath, '.html');
          } catch {
            title = path.basename(filePath, '.html');
          }
        }
        config = {
          article: {
            title,
            content: filePath,
            summary: title,
            author: '',
            original: false,
          },
          settings: {
            headless: true,
            slowMo: 0,
            timeout: 120000,
            viewport: { width: 1920, height: 1080 },
          },
          output: {
            logDir: './logs',
            reportDir: './reports',
            screenshots: true,
          },
          cookiePath,
        };
      } else {
        throw new Error('请提供 --config <path> 或 --file <path> 参数');
      }

      if (options.debug) {
        config.settings.headless = false;
        config.settings.slowMo = 1000;
      }

      console.log(chalk.blue('🚀 开始发布...'));

      const publisher = new Publisher(config);
      const result = await publisher.publish();

      if (result.success) {
        console.log(chalk.green('✅ 保存草稿成功！'));
        if (result.draftUrl) {
          console.log(chalk.gray(`   链接: ${result.draftUrl}`));
        }
        console.log(chalk.gray(`   耗时: ${result.duration}ms`));
        process.exit(0);
      } else {
        console.log(chalk.red('❌ 保存草稿失败'));
        console.log(chalk.red(`   错误: ${result.error}`));
        if (result.screenshots && result.screenshots.length > 0) {
          console.log(chalk.gray(`   截图: ${result.screenshots.join(', ')}`));
        }
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('💥 程序异常'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('login')
  .description('打开浏览器扫码登录微信公众号，并保存 Cookie')
  .option('--cookie <path>', 'Cookie 保存路径')
  .action(async (options) => {
    try {
      const cookiePath = resolveCookiePath(options.cookie);
      await performLogin(cookiePath);
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('💥 登录失败'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('check-login')
  .description('检查 Cookie 登录状态')
  .option('--cookie <path>', 'Cookie 文件路径')
  .option('--debug', '调试模式（显示浏览器窗口）')
  .action(async (options) => {
    try {
      const cookiePath = resolveCookiePath(options.cookie);
      const cookieManager = new CookieManager(cookiePath, 'mp.weixin.qq.com');

      const isValid = await cookieManager.validateCookies();
      if (!isValid) {
        console.log(chalk.red('❌ Cookie 文件无效或为空'));
        console.log(chalk.yellow(`   预期路径: ${cookiePath}`));
        console.log(chalk.blue('   提示: 运行 npm run login 进行扫码登录'));
        process.exit(1);
      }

      console.log(chalk.blue('🔍 检查 Cookie 登录状态...'));

      const browser = await chromium.launch({
        headless: !options.debug,
        slowMo: options.debug ? 1000 : 0,
      });

      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });

      const page = await context.newPage();
      const cookies = await cookieManager.loadCookies();
      await context.addCookies(cookies);

      await page.goto('https://mp.weixin.qq.com/', {
        waitUntil: 'load',
        timeout: 60000,
      });

      await page.waitForTimeout(3000);

      const currentUrl = page.url();
      const pageContent = await page.content();

      if (currentUrl.includes('/cgi-bin/loginpage')) {
        console.log(chalk.red('❌ Cookie 已失效，页面被重定向到登录页'));
        console.log(chalk.blue('   提示: 运行 npm run login 进行扫码登录'));
        await browser.close();
        process.exit(1);
      }

      if (pageContent.includes('新的创作') || pageContent.includes('图文消息')) {
        console.log(chalk.green('✅ Cookie 有效，登录状态正常'));
      } else {
        console.log(chalk.yellow('⚠️  无法确认登录状态，请检查 Cookie'));
      }

      await browser.close();
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('💥 检查失败'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program.parse();
