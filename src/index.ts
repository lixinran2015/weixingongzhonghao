#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { loadConfig } from './utils/config-loader.js';
import { Publisher } from './core/publisher.js';
import { chromium } from 'playwright';
import { CookieManager } from './auth/cookie-manager.js';

const program = new Command();

program
  .name('weixingongzhonghao-publisher')
  .description('微信公众号图文自动发布到草稿箱工具')
  .version('1.0.0');

program
  .command('publish')
  .description('发布图文到微信公众号草稿箱')
  .requiredOption('-c, --config <path>', '配置文件路径')
  .option('--debug', '调试模式（显示浏览器窗口）')
  .action(async (options) => {
    try {
      const configPath = path.resolve(options.config);

      console.log(chalk.blue('📋 加载配置文件...'));
      const config = await loadConfig(configPath);

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
  .command('check-login')
  .description('检查 Cookie 登录状态')
  .option('--debug', '调试模式（显示浏览器窗口）')
  .action(async (options) => {
    try {
      const cookiePath = path.join(process.cwd(), 'cookies', 'cookies.json');
      const cookieManager = new CookieManager(cookiePath, 'mp.weixin.qq.com');

      const isValid = await cookieManager.validateCookies();
      if (!isValid) {
        console.log(chalk.red('❌ Cookie 文件无效或为空'));
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
