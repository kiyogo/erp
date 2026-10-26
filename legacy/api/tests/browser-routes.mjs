import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const origin = process.env.TEST_WEB_URL || 'http://localhost:3011';
const api = process.env.TEST_API_URL || 'http://localhost:3003/api/v1';
if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) throw new Error('Set TEST_EMAIL and TEST_PASSWORD for an authorized test account.');
const response = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD }) });
if (!response.ok) throw new Error(`Login failed: ${response.status}`);
const session = await response.json();
const source = readFileSync(new URL('../../web/src/data/menuData.tsx', import.meta.url), 'utf8');
const routes = process.env.TEST_ROUTES ? process.env.TEST_ROUTES.split(',') : [...new Set([...source.matchAll(/path:\s*['"]([^'"]+)['"]/g)].map(match => match[1]))];
const browser = await puppeteer.launch({ headless: true });
const results = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(session => {
    localStorage.setItem('minepanel_token', session.access_token || session.token);
    localStorage.setItem('minepanel_user', JSON.stringify(session.user));
  }, session);
  let errors = [];
  let apiRequests = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('request', request => {
    if (request.url().includes('/api/v1/')) apiRequests.push({ method: request.method(), path: new URL(request.url()).pathname });
  });
  for (const route of routes) {
    errors = [];
    apiRequests = [];
    try {
      await page.goto(`${origin}${route}`, { waitUntil: 'networkidle2', timeout: 30000 });
      if (process.env.TEST_FORM_VALIDATION === 'true' && route === '/admin/users') {
        await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Thêm tài khoản'))?.click());
        await page.waitForSelector('.ant-modal form');
        const before = apiRequests.length;
        await page.click('.ant-modal button[type="submit"]');
        await page.waitForSelector('.ant-modal [role="alert"]');
        if (apiRequests.slice(before).some(request => request.method === 'POST')) errors.push('Invalid blank form sent a POST request');
        if (!await page.$('.ant-modal input[aria-invalid="true"]')) errors.push('Invalid input lacks accessible error state');
      }
      const text = await page.$eval('body', node => node.innerText);
      if (route.endsWith('/contracts')) {
        if (apiRequests.filter(request => request.method === 'GET' && request.path === '/api/v1/contracts').length > 10) errors.push('Contract API request loop');
        if (apiRequests.some(request => request.method === 'PUT' && request.path === '/api/v1/collections/enterprise_contracts')) errors.push('Opening contracts must not rewrite the contracts collection');
      }
      results.push({ route, finalUrl: page.url(), errors: [...errors], apiRequests, textLength: text.length, blank: text.trim().length < 30 });
    } catch (error) {
      const body = await page.$eval('body', node => node.innerText).catch(() => '');
      results.push({ route, errors: [...errors, error.message], apiRequests, body: body.slice(-1800), blank: true });
    }
    if (results.length % 25 === 0) console.log(`Checked ${results.length}/${routes.length} routes`);
  }
} finally {
  await browser.close();
  const output = path.join(tmpdir(), process.env.TEST_ROUTES ? 'kiyovn-browser-recheck.json' : 'kiyovn-browser-routes.json');
  writeFileSync(output, JSON.stringify(results, null, 2));
  const failed = results.filter(result => result.blank || result.errors.length);
  console.log(JSON.stringify({ checked: results.length, failed: failed.length, output, failures: failed }));
  if (failed.length) process.exitCode = 1;
}
