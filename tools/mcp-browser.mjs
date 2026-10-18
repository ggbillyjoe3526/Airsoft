#!/usr/bin/env node
/**
 * Starts one of the two browser MCP servers `.mcp.json` lists (TL1), with the flags for where it runs, so one entry works
 * on the owner's PC and in a cloud session alike. Dev tooling only: nothing here reaches the game.
 *
 *   node tools/mcp-browser.mjs devtools     Chrome DevTools MCP: performance traces, source-mapped console errors
 *   node tools/mcp-browser.mjs playwright   Playwright MCP: clicking through the real game during a bug pass
 *
 * On a PC each opens its own visible, throwaway Chrome profile (never the owner's own). In a cloud session
 * (CLAUDE_CODE_REMOTE) it runs the container's Chromium headless, without the sandbox root can't use.
 * AIRSOFT_MCP_CHROME overrides the browser either way. Versions are pinned: bump them here, after reading the changelog.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const SERVERS = {
  // No usage statistics to Google, and no trace URLs sent to its real-user (CrUX) API.
  devtools: { pkg: 'chrome-devtools-mcp@1.11.0', flags: ['--no-usage-statistics', '--no-performance-crux', '--isolated'] },
  playwright: { pkg: '@playwright/mcp@0.0.83', flags: ['--isolated', '--output-dir', '.playwright-mcp'] },
};
const CLOUD_CHROMIUM = '/opt/pw-browsers/chromium';

const name = process.argv[2];
const server = SERVERS[name];
if (!server) {
  console.error(`usage: node tools/mcp-browser.mjs ${Object.keys(SERVERS).join('|')}`);
  process.exit(2);
}

const cloud = process.env.CLAUDE_CODE_REMOTE === 'true';
const chrome = process.env.AIRSOFT_MCP_CHROME || (cloud && existsSync(CLOUD_CHROMIUM) ? CLOUD_CHROMIUM : '');
const args = ['-y', server.pkg, ...server.flags];
if (chrome) args.push('--executable-path', chrome);
if (cloud) args.push('--headless', ...(name === 'devtools' ? ['--chrome-arg=--no-sandbox'] : ['--no-sandbox']));

// npx is a .cmd script on Windows, which Node only starts through a shell.
const windows = process.platform === 'win32';
const child = spawn(windows ? 'npx.cmd' : 'npx', args, { stdio: 'inherit', shell: windows });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
