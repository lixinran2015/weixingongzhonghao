import type { PublishResult } from '../types/index.js';
import { BasePublisher } from './base-publisher.js';
import fs from 'fs/promises';

export class Publisher extends BasePublisher {
  async publish(): Promise<PublishResult> {
    this.startTime = Date.now();

    try {
      this.logger.info(`开始发布文章: ${this.config.article.title}`);

      await this.initBrowser();
      await this.authenticate();
      await this.navigateToEditor();
      await this.handleDialogs();
      await this.fillTitle();
      await this.handleDialogs();
      await this.fillContent();
      await this.setCover();
      await this.setAuthor();
      const draftUrl = await this.saveDraft();

      this.logger.info('文章已保存到草稿箱');
      return this.createResult(true, draftUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`发布失败: ${errorMessage}`);

      if (this.config.output.screenshots && this.page) {
        await this.takeScreenshot('error');
      }

      return this.createResult(false, undefined, errorMessage);
    } finally {
      await this.cleanup();
    }
  }

  private async navigateToEditor(): Promise<void> {
    this.logger.info('进入图文编辑页面...');

    await this.page!.goto('https://mp.weixin.qq.com/', { waitUntil: 'networkidle', timeout: 60000 });
    await this.page!.waitForTimeout(3000);

    const token = await this.extractToken();
    if (!token) {
      throw new Error('无法从页面提取 token');
    }

    const editorUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&token=${token}&lang=zh_CN&timestamp=${Date.now()}`;
    await this.page!.goto(editorUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await this.page!.waitForTimeout(5000);
    await this.takeScreenshot('editor-page');

    const currentUrl = this.page!.url();
    if (!currentUrl.includes('appmsg_edit')) {
      throw new Error('未能进入文章编辑页面，当前URL: ' + currentUrl);
    }
  }

  private async handleDialogs(): Promise<void> {
    this.logger.info('检查并关闭弹窗...');

    // 处理"我知道了"按钮
    const dialogButtonSelectors = [
      'button:has-text("我知道了")',
      'a:has-text("我知道了")',
      '.weui-desktop-btn_primary:has-text("我知道了")',
    ];

    for (const selector of dialogButtonSelectors) {
      try {
        const btn = await this.page!.waitForSelector(selector, { timeout: 2000 });
        if (btn && await btn.isVisible().catch(() => false)) {
          await btn.click();
          this.logger.info('点击弹窗按钮: 我知道了');
          await this.page!.waitForTimeout(1500);
          return;
        }
      } catch {
        // ignore
      }
    }

    // 处理转载文章弹窗的取消按钮
    try {
      const clicked = await this.page!.evaluate(() => {
        const repostDialog = Array.from(document.querySelectorAll('*'))
          .find(el => el.textContent?.includes('转载文章'))
          ?.closest('[class*="dialog"], [class*="modal"]') as HTMLElement | undefined;
        if (!repostDialog) return null;
        const cancelBtn = Array.from(repostDialog.querySelectorAll('button, a'))
          .find(el => el.textContent?.trim() === '取消') as HTMLElement | undefined;
        if (cancelBtn) {
          cancelBtn.click();
          return 'cancel-repost';
        }
        return null;
      });
      if (clicked) {
        this.logger.info('点击转载弹窗的取消按钮');
        await this.page!.waitForTimeout(1500);
      }
    } catch {
      // ignore
    }
  }

  private async fillTitle(): Promise<void> {
    this.logger.info('填写标题...');

    const titleInput = await this.page!.$('#title');
    if (titleInput && await titleInput.isVisible().catch(() => false)) {
      await titleInput.fill(this.config.article.title);
      this.logger.info('标题填写完成');
      return;
    }

    throw new Error('未找到标题输入框');
  }

  private async fillContent(): Promise<void> {
    this.logger.info('填写正文内容...');

    let content = this.config.article.content;
    if (content.endsWith('.html') || content.endsWith('.htm') || content.endsWith('.md')) {
      try {
        content = await fs.readFile(content, 'utf-8');
        this.logger.info('已从文件读取正文内容');
      } catch {
        throw new Error(`无法读取内容文件: ${content}`);
      }
    }

    const editables = await this.page!.$$('[contenteditable="true"]');
    for (const el of editables) {
      try {
        const textPreview = await el.evaluate((node) => node.textContent?.substring(0, 30) || '');
        const isBody = textPreview.includes('从这里开始写正文');
        if (!isBody) continue;

        const clickable = await el.isVisible().catch(() => false);
        if (clickable) {
          await el.click();
          await this.page!.waitForTimeout(300);
        } else {
          await el.evaluate((node: HTMLElement) => node.focus());
          await this.page!.waitForTimeout(300);
        }

        const pasted = await this.injectViaProseMirrorPaste(el, content);
        if (pasted) {
          await this.triggerEditorEvents(el);
          this.logger.info('正文填写完成');
          return;
        }

        const clipboardPasted = await this.pasteViaClipboard(content);
        if (clipboardPasted) {
          await this.triggerEditorEvents(el);
          this.logger.info('正文填写完成（通过剪贴板）');
          return;
        }
      } catch {
        continue;
      }
    }

    throw new Error('未找到正文编辑器');
  }

  private async pasteViaClipboard(html: string): Promise<boolean> {
    try {
      const isMac = process.platform === 'darwin';

      // 全选现有内容（macOS 用 Meta+a，其他用 Ctrl+a）
      if (isMac) {
        await this.page!.keyboard.down('Meta');
        await this.page!.keyboard.press('a');
        await this.page!.keyboard.up('Meta');
      } else {
        await this.page!.keyboard.down('Control');
        await this.page!.keyboard.press('a');
        await this.page!.keyboard.up('Control');
      }
      await this.page!.waitForTimeout(200);

      // 写入剪贴板（尝试 HTML 格式）
      const written = await this.page!.evaluate(async (content: string) => {
        try {
          if (typeof ClipboardItem !== 'undefined') {
            const blob = new Blob([content], { type: 'text/html' });
            const item = new ClipboardItem({ 'text/html': blob });
            await navigator.clipboard.write([item]);
            return true;
          }
          return false;
        } catch {
          return false;
        }
      }, html);

      if (!written) {
        return false;
      }

      await this.page!.waitForTimeout(300);

      // 粘贴：macOS 用 Meta+v，Windows/Linux 用 Ctrl+v
      if (isMac) {
        await this.page!.keyboard.down('Meta');
        await this.page!.keyboard.press('v');
        await this.page!.keyboard.up('Meta');
      } else {
        await this.page!.keyboard.down('Control');
        await this.page!.keyboard.press('v');
        await this.page!.keyboard.up('Control');
      }
      await this.page!.waitForTimeout(1000);

      return true;
    } catch {
      return false;
    }
  }

  private async injectViaProseMirrorPaste(element: any, html: string): Promise<boolean> {
    try {
      return await element.evaluate((el: HTMLElement, content: string) => {
        try {
          // 1. 尝试找到 ProseMirror view 实例并直接操作
          const pmView = (el as any).__prosemirror_view || (el as any).pmView || (el as any)._pmView || (el as any).editorView;
          if (pmView && pmView.state && pmView.dispatch) {
            const { state, dispatch } = pmView;
            // 创建片段并替换全部内容
            const fragment = state.schema.text(content);
            const tr = state.tr.replaceWith(0, state.doc.content.size, fragment);
            dispatch(tr);
            return true;
          }

          // 2. 模拟带 DataTransfer 的 paste 事件
          el.focus();
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.selectNodeContents(el);
            selection.removeAllRanges();
            selection.addRange(range);
          }

          // 创建 DataTransfer 并写入 HTML
          const dataTransfer = new DataTransfer();
          dataTransfer.setData('text/html', content);
          dataTransfer.setData('text/plain', content.replace(/<[^>]+>/g, ''));

          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dataTransfer,
          });
          el.dispatchEvent(pasteEvent);

          // 额外触发 input 事件
          const inputEvent = new InputEvent('input', {
            bubbles: true,
            inputType: 'insertFromPaste',
          });
          el.dispatchEvent(inputEvent);

          return true;
        } catch {
          return false;
        }
      }, html);
    } catch {
      return false;
    }
  }

  private async triggerEditorEvents(element: any): Promise<void> {
    try {
      await element.evaluate((el: HTMLElement) => {
        const events = ['focus', 'beforeinput', 'input', 'keyup', 'change', 'blur'];
        for (const eventType of events) {
          if (eventType === 'beforeinput' || eventType === 'input') {
            const event = new InputEvent(eventType, { bubbles: true, inputType: 'insertText', data: ' ' });
            el.dispatchEvent(event);
          } else {
            const event = new Event(eventType, { bubbles: true });
            el.dispatchEvent(event);
          }
        }
      });
      await this.page!.waitForTimeout(800);
      // 模拟一次真实键盘输入（空格+退格），强制编辑器更新内部状态
      await this.page!.keyboard.press('End');
      await this.page!.waitForTimeout(200);
      await this.page!.keyboard.press('Space');
      await this.page!.waitForTimeout(200);
      await this.page!.keyboard.press('Backspace');
      await this.page!.waitForTimeout(800);
      await this.page!.keyboard.press('Tab');
      await this.page!.waitForTimeout(500);
    } catch {
      // ignore
    }
  }

  private async setCover(): Promise<void> {
    if (!this.config.article.cover) {
      this.logger.info('未配置封面，跳过');
      return;
    }

    this.logger.info('设置封面...');

    // 检查封面文件是否存在
    try {
      await fs.access(this.config.article.cover);
    } catch {
      this.logger.warn(`封面文件不存在: ${this.config.article.cover}，跳过`);
      return;
    }

    // 尝试点击"选择封面"或上传区域
    const coverSelectors = [
      '.js_cover_url_area',
      '.cover_url_area',
      'a:has-text("选择封面")',
      'span:has-text("选择封面")',
      '.upload_cover',
      '#js_cover_url_area',
    ];

    for (const selector of coverSelectors) {
      try {
        const coverArea = await this.page!.waitForSelector(selector, { timeout: 3000 });
        if (coverArea) {
          await coverArea.click();
          this.logger.info('点击封面选择区域');
          await this.page!.waitForTimeout(2000);
          break;
        }
      } catch {
        continue;
      }
    }

    // 查找文件上传 input
    const fileInputSelectors = [
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
    ];

    for (const selector of fileInputSelectors) {
      try {
        const fileInput = await this.page!.waitForSelector(selector, { timeout: 3000 });
        if (fileInput) {
          await fileInput.setInputFiles(this.config.article.cover);
          this.logger.info('封面上传完成');
          await this.page!.waitForTimeout(3000);
          return;
        }
      } catch {
        continue;
      }
    }

    this.logger.warn('未能自动上传封面，请手动检查');
  }

  private async setAuthor(): Promise<void> {
    if (!this.config.article.author) {
      return;
    }

    this.logger.info('设置作者...');

    const authorSelectors = [
      '#author',
      'input[placeholder*="作者"]',
    ];

    for (const selector of authorSelectors) {
      try {
        const authorInput = await this.page!.$(selector);
        if (authorInput) {
          await authorInput.fill(this.config.article.author);
          this.logger.info('作者设置完成');
          return;
        }
      } catch {
        continue;
      }
    }

    this.logger.warn('未找到作者输入框');
  }

  private async saveDraft(): Promise<string | undefined> {
    this.logger.info('保存草稿...');

    let lastCreateRet: number | null = null;

    // 拦截保存请求以便判断实际保存结果
    await this.page!.route('**/cgi-bin/operate_appmsg**', async (route, request) => {
      const url = request.url();
      const response = await route.fetch();
      const body = await response.text();
      if (url.includes('sub=create')) {
        try {
          const parsed = JSON.parse(body);
          lastCreateRet = parsed?.base_resp?.ret ?? null;
        } catch {
          lastCreateRet = null;
        }
      }
      await route.fulfill({ response, body });
    });

    await this.page!.waitForTimeout(3000);

    const saveBtn = this.page!.getByText('保存为草稿', { exact: false }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.scrollIntoViewIfNeeded();
      await saveBtn.click();
      this.logger.info('点击保存草稿按钮');
    } else {
      throw new Error('未找到保存草稿按钮');
    }

    await this.page!.waitForTimeout(5000);
    await this.takeScreenshot('after-save');

    const error = await this.checkForErrors();
    if (error && error.includes('系统繁忙')) {
      this.logger.warn('检测到系统繁忙，5秒后重试保存...');
      lastCreateRet = null;
      await this.page!.waitForTimeout(5000);
      await saveBtn.click();
      await this.page!.waitForTimeout(5000);
      if (lastCreateRet !== 0) {
        const retryError = await this.checkForErrors();
        if (retryError) {
          throw new Error(`保存草稿失败: ${retryError}`);
        }
      }
    } else if (error) {
      throw new Error(`保存草稿失败: ${error}`);
    }

    if (lastCreateRet === 0) {
      this.logger.info('保存成功');
    }

    return this.page!.url();
  }
}
