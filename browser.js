// src/browser.js — Playwright controller for chat.deepseek.com
'use strict';

const { chromium } = require('playwright');
const path         = require('path');
const config       = require('./config');
const logger       = require('./logger');

// ─────────────────────────────────────────────────────────────────────────────
//  Selector banks
// ─────────────────────────────────────────────────────────────────────────────

const SEL = {
  chatInput: [
    '#chat-input',
    'textarea[placeholder]',
    'textarea',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]',
  ],
  sendButton: [
    'button[aria-label*="Send" i]',
    'button[aria-label*="send" i]',
    '[data-testid="send-button"]',
    'button[type="submit"]',
    '[class*="send-btn"]',
    '[class*="sendBtn"]',
    '[class*="send-button"]',
  ],
  stopButton: [
    'button[aria-label*="Stop" i]',
    '[aria-label*="stop generating" i]',
    '[data-testid="stop-button"]',
    '[class*="stop-btn"]',
    '[class*="stopBtn"]',
  ],
  newChat: [
    'button[aria-label*="New chat" i]',
    'button[aria-label*="New conversation" i]',
    'a[href="/"][aria-label]',
    '[data-testid="new-chat"]',
    '[class*="new-chat"]',
    '[class*="newChat"]',
  ],
  messageContainer: [
    '[class*="chat-content"]',
    '[class*="message-list"]',
    '[class*="conversation"]',
    'main',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
//  DeepSeekBrowser class
// ─────────────────────────────────────────────────────────────────────────────

class DeepSeekBrowser {
  constructor() {
    this.context  = null;
    this.page     = null;
    this._closed  = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async launch() {
    logger.info('Launching browser with persistent session...');

    const sessionDir = path.resolve(config.SESSION_DIR);

    this.context = await chromium.launchPersistentContext(sessionDir, {
      headless      : config.HEADLESS,
      viewport      : { width: 1280, height: 900 },
      userAgent     : [
        'Mozilla/5.0 (X11; Linux x86_64)',
        'AppleWebKit/537.36 (KHTML, like Gecko)',
        'Chrome/124.0.0.0 Safari/537.36',
      ].join(' '),
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--disable-default-apps',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // Prevent the "restore pages" prompt
        '--disable-session-crashed-bubble',
        '--restore-last-session',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    const pages   = this.context.pages();
    this.page     = pages.length > 0 ? pages[0] : await this.context.newPage();

    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await this._navigate(config.DEEPSEEK_URL);
    await this._ensureLoggedIn();
    // Dismiss any restore notification
    await this._dismissRestoreNotification();

    logger.success('Browser ready!');
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    try { await this.context?.close(); } catch {}
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  async goto(url) {
    await this._navigate(url);
  }

  async _navigate(url) {
    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForSelector('textarea, [contenteditable="true"]', { timeout: 10_000 });
      await this.page.waitForTimeout(2_000);
      await this._dismissRestoreNotification();
    } catch (err) {
      logger.warn(`Navigation warning: ${err.message}`);
    }
  }

  // ── Dismiss "Restore Pages" Notification ──────────────────────────────────

  async _dismissRestoreNotification() {
    try {
      // Look for the restore banner and click "Cancel" or "Restore"
      const restoreBtn = await this.page.$(
        'button:has-text("Restore"), button:has-text("Cancel"), button[aria-label*="Restore"], button[aria-label*="Cancel"]'
      );
      if (restoreBtn && await restoreBtn.isVisible()) {
        await restoreBtn.click();
        await this.page.waitForTimeout(500);
        logger.dim('Dismissed "Restore pages" notification');
      }
    } catch {}
  }

  async newChat() {
    try {
      for (const sel of SEL.newChat) {
        try {
          const el = await this.page.$(sel);
          if (el && await el.isVisible()) {
            await el.click();
            await this.page.waitForTimeout(1_000);
            logger.dim('Started new chat session');
            return;
          }
        } catch {}
      }
    } catch {}

    await this._navigate(config.DEEPSEEK_URL);
    logger.dim('Navigated to DeepSeek home (new chat)');
  }

  // ── Login handling ─────────────────────────────────────────────────────────

  async _ensureLoggedIn() {
    await this.page.waitForTimeout(2_000);

    const needsLogin = await this.page.evaluate(() => {
      const url = window.location.href;
      const bodyText = document.body?.innerText || '';
      return (
        url.includes('/auth') ||
        url.includes('/login') ||
        url.includes('/sign') ||
        bodyText.includes('Sign in') ||
        bodyText.includes('Log in') ||
        !!document.querySelector('input[type="password"]')
      );
    });

    if (needsLogin) {
      this._printLoginBanner();
      await this._waitForEnter();
      await this.page.waitForTimeout(2_000);
      await this._dismissRestoreNotification();
    }
  }

  _printLoginBanner() {
    console.log('');
    logger.warn('╔══════════════════════════════════════════════╗');
    logger.warn('║  🔐  LOGIN REQUIRED                          ║');
    logger.warn('║                                              ║');
    logger.warn('║  1. Log in to DeepSeek in the browser window ║');
    logger.warn('║  2. Return here and press  ENTER  to continue║');
    logger.warn('╚══════════════════════════════════════════════╝');
    console.log('');
  }

  async _waitForEnter() {
    return new Promise(resolve => {
      const stdin   = process.stdin;
      const wasRaw  = stdin.isRaw;
      const wasPaused = !stdin.readable;

      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.resume();

      const handler = chunk => {
        const s = chunk.toString();
        if (s.includes('\n') || s.includes('\r')) {
          stdin.removeListener('data', handler);
          if (stdin.isTTY && wasRaw) stdin.setRawMode(true);
          if (wasPaused)            stdin.pause();
          resolve();
        }
      };

      stdin.on('data', handler);
    });
  }

  // ── Sending Messages ───────────────────────────────────────────────────────

  async sendMessage(text) {
    // Dismiss any restore notification first
    await this._dismissRestoreNotification();

    const { el, isTextarea } = await this._findInput();

    // Focus and clear
    await el.click({ force: true });
    await this.page.waitForTimeout(200);
    await this.page.keyboard.press('Control+a');
    await this.page.waitForTimeout(100);

    // Fill the input
    if (isTextarea) {
      await el.fill(text);
    } else {
      // For contenteditable, use a more reliable approach
      await this.page.evaluate((element, content) => {
        element.focus();
        // Clear using execCommand
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        // Insert text
        document.execCommand('insertText', false, content);
        // Ensure the event fires
        element.dispatchEvent(new InputEvent('input', { bubbles: true, data: content }));
      }, el, text);
    }

    await this.page.waitForTimeout(config.SEND_DELAY);

    // Try multiple ways to send
    let sent = false;

    // 1. Try clicking the send button
    const clicked = await this._clickSendButton();
    if (clicked) {
      sent = true;
    }

    // 2. If button didn't work, press Enter
    if (!sent) {
      // For contenteditable, Ctrl+Enter often works
      await this.page.keyboard.press('Enter');
      sent = true;
    }

    // 3. If still not sent, try Shift+Enter (some UIs use this)
    if (!sent) {
      await this.page.keyboard.press('Shift+Enter');
    }

    await this.page.waitForTimeout(500);

    // Verify the message was sent (input should be empty)
    const isCleared = await this.page.evaluate(() => {
      const input = document.querySelector('textarea, [contenteditable="true"]');
      if (!input) return false;
      if (input.value !== undefined) return input.value === '';
      return input.innerText === '';
    });

    if (!isCleared) {
      // If input still has text, press Enter again
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(300);
    }
  }

  async _findInput() {
    for (const sel of SEL.chatInput) {
      try {
        const el = await this.page.waitForSelector(sel, { timeout: 4_000, state: 'visible' });
        if (!el) continue;
        const tagName          = await el.evaluate(e => e.tagName.toLowerCase());
        const isContentEditable = await el.evaluate(e => e.isContentEditable);
        return { el, isTextarea: tagName === 'textarea' && !isContentEditable };
      } catch {}
    }
    throw new Error(
      'Cannot find the DeepSeek chat input box.\n' +
      '  → Make sure the page is fully loaded and you are logged in.\n' +
      '  → Run with --debug to inspect DOM selectors.\n' +
      '  → Run: node src/calibrate.js to auto-detect selectors.'
    );
  }

  async _clickSendButton() {
    for (const sel of SEL.sendButton) {
      try {
        const el = await this.page.$(sel);
        if (el && await el.isVisible() && await el.isEnabled()) {
          await el.click();
          return true;
        }
      } catch {}
    }
    return false;
  }

  // ── Waiting for Response ───────────────────────────────────────────────────

  async waitForResponse() {
    const timeout     = config.RESPONSE_TIMEOUT;
    const stableDelay = config.STABLE_DELAY;
    const start       = Date.now();

    const initialCount = await this._getMessageCount();
    let   appeared     = false;

    while (Date.now() - start < 12_000) {
      const count = await this._getMessageCount();
      if (count > initialCount) { appeared = true; break; }
      await this.page.waitForTimeout(400);
    }

    if (!appeared) logger.warn('Response may have been delayed — continuing to wait...');

    let lastText    = '';
    let stableStart = null;
    let dotCount    = 0;

    while (Date.now() - start < timeout) {
      const text = await this._extractLastMessage();

      if (text !== lastText) {
        lastText    = text;
        stableStart = null;
      } else if (text.length > 0) {
        if (!stableStart) stableStart = Date.now();
        else if (Date.now() - stableStart >= stableDelay) {
          if (!await this._isGenerating()) break;
          stableStart = null;
        }
      }

      dotCount = (dotCount + 1) % 4;
      logger.thinking(`Receiving response${'.'.repeat(dotCount)}  (${text.length} chars)`);

      await this.page.waitForTimeout(500);
    }

    logger.clearLine();

    const final = await this._extractLastMessage();
    return this._cleanText(final);
  }

  // ── DOM Extraction ─────────────────────────────────────────────────────────

  async _getMessageCount() {
    return await this.page.evaluate(() => {
      const candidates = [
        '[class*="assistant"][class*="message"]',
        '[data-role="assistant"]',
        '[class*="markdown-content"]',
        '.ds-markdown',
        '[class*="chat-message"]',
        '[class*="message-bubble"]',
      ];
      for (const sel of candidates) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) return els.length;
      }
      return document.querySelectorAll('[class*="message"]').length;
    });
  }

  async _extractLastMessage() {
    return await this.page.evaluate(() => {

      function getFullText(el) {
        if (!el) return '';
        let result = '';

        function walk(node) {
          if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent;
            return;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          const tag = node.tagName.toLowerCase();

          if (tag === 'pre') {
            const codeEl = node.querySelector('code');
            if (codeEl) {
              const cls  = codeEl.className || '';
              const lang = (cls.match(/language-(\S+)/) || [])[1] || '';
              const body = codeEl.textContent || '';
              result += '\n```' + lang + '\n' + body + '\n```\n';
            } else {
              result += '\n```\n' + node.textContent + '\n```\n';
            }
            return;
          }

          if (tag === 'code') {
            const parentTag = node.parentElement && node.parentElement.tagName
              ? node.parentElement.tagName.toLowerCase() : '';
            if (parentTag !== 'pre') {
              result += '`' + node.textContent + '`';
            }
            return;
          }

          for (const child of node.childNodes) walk(child);

          if (['p','div','li','br','h1','h2','h3','h4','h5','h6'].includes(tag)) {
            result += '\n';
          }
        }

        walk(el);
        return result.trim();
      }

      const directSelectors = [
        '.ds-markdown',
        '[class*="assistant"] [class*="markdown"]',
        '[class*="assistant"] [class*="content"]',
        '[data-role="assistant"] [class*="content"]',
        '[class*="ai-message"] [class*="content"]',
        '[class*="bot-message"] [class*="content"]',
        '[class*="response-content"]',
        '[class*="message-content"]:last-child',
      ];

      for (const sel of directSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          const t = getFullText(els[els.length - 1]);
          if (t.length > 10) return t;
        }
      }

      const markdownEls = document.querySelectorAll(
        '[class*="markdown"], [class*="prose"], [class*="rendered"]'
      );
      if (markdownEls.length > 0) {
        const t = getFullText(markdownEls[markdownEls.length - 1]);
        if (t.length > 10) return t;
      }

      const allBlocks = Array.from(
        document.querySelectorAll('[class*="message"], [class*="chat-item"], [class*="turn"]')
      );
      const candidates = allBlocks.filter(el => {
        const cls = el.className || '';
        return (
          !cls.toLowerCase().includes('input') &&
          !cls.toLowerCase().includes('user') &&
          !el.querySelector('textarea, input[type="text"]') &&
          (el.innerText || '').length > 20
        );
      });

      if (candidates.length > 0) {
        return getFullText(candidates[candidates.length - 1]);
      }

      return '';
    });
  }

  async _isGenerating() {
    return await this.page.evaluate(() => {
      const stopSelectors = [
        'button[aria-label*="Stop" i]',
        '[class*="stop-gen"]',
        '[class*="stopGen"]',
        '[class*="generating"]',
      ];
      for (const sel of stopSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const s = window.getComputedStyle(el);
          if (s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0') return true;
        }
      }

      const loaderSelectors = [
        '[class*="typing"]',
        '[class*="loading"]',
        '[class*="spinner"]',
        '[class*="blink"]',
        '[class*="cursor"]',
        '[class*="pulsing"]',
        'svg[class*="loading"]',
        'svg[class*="spinner"]',
      ];
      for (const sel of loaderSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const s = window.getComputedStyle(el);
          if (s.display !== 'none' && s.visibility !== 'hidden') return true;
        }
      }

      return false;
    });
  }

  // ── Text Cleanup ───────────────────────────────────────────────────────────

  _cleanText(text) {
    if (!text) return '';

    return text
      .replace(/<think>[\s\S]*?<\/think>\n?/gi, '')
      .replace(/^Thinking\.{0,3}\n[\s\S]*?\n\n/m, '')
      .replace(/^\d+(?:Copy|Run|Insert|Edit)\b.*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ── Debug / Calibration Utilities ─────────────────────────────────────────

  async dumpDebugInfo() {
    const info = await this.page.evaluate(() => {
      const classFreq = {};
      document.querySelectorAll('*').forEach(el => {
        el.classList.forEach(c => {
          if (c.match(/message|chat|input|send|stop|markdown|content|assistant|user|bot/i)) {
            classFreq[c] = (classFreq[c] || 0) + 1;
          }
        });
      });

      const inputs = Array.from(document.querySelectorAll('textarea, [contenteditable]')).map(e => ({
        tag         : e.tagName,
        id          : e.id || null,
        class       : e.className?.slice(0, 80) || null,
        placeholder : e.placeholder || null,
        editable    : e.isContentEditable,
        visible     : e.offsetParent !== null,
      }));

      return {
        url    : window.location.href,
        title  : document.title,
        classes: Object.entries(classFreq).sort((a, b) => b[1] - a[1]).slice(0, 40),
        inputs,
      };
    });

    console.log('\n' + '═'.repeat(60));
    console.log('  DOM DEBUG INFO');
    console.log('═'.repeat(60));
    console.log('URL   :', info.url);
    console.log('Title :', info.title);
    console.log('\nInput elements:');
    info.inputs.forEach(i => console.log(' ', JSON.stringify(i)));
    console.log('\nMatching CSS classes (by frequency):');
    info.classes.forEach(([cls, count]) => console.log(`  ${String(count).padStart(3)}x  .${cls}`));
    console.log('═'.repeat(60) + '\n');
  }

  async screenshot(filePath = '/tmp/deepseek-agent-debug.png') {
    await this.page.screenshot({ path: filePath, fullPage: false });
    logger.info(`Screenshot saved: ${filePath}`);
  }
}

module.exports = DeepSeekBrowser;