import fs from 'fs/promises';
import path from 'path';
import type { Cookie } from 'playwright';

export class CookieManager {
  private cookiePath: string;
  private defaultDomain: string;

  constructor(cookiePath: string, defaultDomain: string = 'mp.weixin.qq.com') {
    this.cookiePath = cookiePath;
    this.defaultDomain = defaultDomain;
  }

  async saveCookies(cookies: Cookie[]): Promise<void> {
    const dir = path.dirname(this.cookiePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.cookiePath, JSON.stringify(cookies, null, 2), 'utf-8');
  }

  async loadCookies(): Promise<Cookie[]> {
    try {
      const content = await fs.readFile(this.cookiePath, 'utf-8');
      const trimmed = content.trim();

      // 尝试解析为 JSON
      try {
        const parsed = JSON.parse(trimmed);

        // 支持两种格式：数组格式 和 键值对格式
        if (Array.isArray(parsed)) {
          return this.validateArrayFormat(parsed);
        } else if (typeof parsed === 'object' && parsed !== null) {
          return this.convertKeyValueToCookies(parsed);
        }
      } catch {
        // JSON 解析失败，尝试 cookie 字符串格式
        return this.parseCookieString(trimmed);
      }

      throw new Error('Cookie 文件格式错误');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Cookie 文件不存在: ${this.cookiePath}`);
      }
      throw error;
    }
  }

  private parseCookieString(cookieString: string): Cookie[] {
    const cookies: Cookie[] = [];

    // 支持格式: "name1=value1; name2=value2" 或 "name1=value1\nname2=value2"
    const pairs = cookieString
      .split(/[;\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.includes('='));

    for (const pair of pairs) {
      const [name, ...valueParts] = pair.split('=');
      const value = valueParts.join('='); // 处理 value 中可能包含 = 的情况

      if (name && value) {
        cookies.push({
          name: name.trim(),
          value: value.trim(),
          domain: this.defaultDomain,
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        });
      }
    }

    if (cookies.length === 0) {
      throw new Error('Cookie 文件格式错误：无法解析 cookie 字符串');
    }

    return cookies;
  }

  private validateArrayFormat(cookies: Cookie[]): Cookie[] {
    const requiredFields = ['name', 'value', 'domain'];
    for (const cookie of cookies) {
      for (const field of requiredFields) {
        if (!(field in cookie)) {
          throw new Error(`Cookie 缺少必要字段: ${field}`);
        }
      }
    }
    return cookies;
  }

  private convertKeyValueToCookies(obj: Record<string, string>): Cookie[] {
    const cookies: Cookie[] = [];

    for (const [name, value] of Object.entries(obj)) {
      cookies.push({
        name,
        value,
        domain: this.defaultDomain,
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
      });
    }

    return cookies;
  }

  async validateCookies(): Promise<boolean> {
    try {
      const cookies = await this.loadCookies();
      return cookies.length > 0;
    } catch {
      return false;
    }
  }
}
