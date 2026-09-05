import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, loadAuth, saveAuth, clearAuth, getAuthFilePath } from '../config.js';
import { cloudSignIn, cloudSignUp, cloudVerifyEmail, cloudResendVerification, cloudGetMe } from '../api.js';

function maskToken(t: string) { return t.slice(0, 8) + '…' + t.slice(-6); }

async function promptHidden(question: string): Promise<string> {
  // Simple hidden prompt without extra deps — falls back to visible if not TTY
  if (!process.stdin.isTTY) {
    const rl = await import('node:readline');
    const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise<string>((resolve) => {
      iface.question(question, (ans) => { iface.close(); resolve(ans.trim()); });
    });
  }
  process.stdout.write(question);
  return new Promise<string>((resolve) => {
    const stdin = process.stdin;
    const wasRaw = (stdin as any).isRaw;
    let buf = '';
    const onData = (d: Buffer) => {
      const s = d.toString('utf8');
      for (const ch of s) {
        if (ch === '\n' || ch === '\r') {
          stdin.off('data', onData);
          try { if (stdin.isTTY) (stdin as any).setRawMode(!!wasRaw); } catch {}
          process.stdout.write('\n');
          resolve(buf.trim());
          return;
        }
        if (ch === '\u0003') { // Ctrl+C
          stdin.off('data', onData);
          try { if (stdin.isTTY) (stdin as any).setRawMode(!!wasRaw); } catch {}
          process.stdout.write('\n');
          process.exit(1);
        }
        if (ch === '\u007f' || ch === '\b') { buf = buf.slice(0, -1); continue; }
        buf += ch;
      }
    };
    try { (stdin as any).setRawMode(true); } catch {}
    stdin.on('data', onData);
    stdin.resume();
  });
}

export async function authLoginCommand(opts: { email?: string; password?: string; json?: boolean }) {
  const cfg = loadConfig();
  let email = opts.email?.trim();
  let password = opts.password;

  if (!email) {
    const rl = await import('node:readline');
    const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
    email = await new Promise<string>((r) => iface.question('Email: ', (a) => { iface.close(); r(a.trim()); }));
  }
  if (!password) password = await promptHidden('Password: ');

  if (!email || !password) { console.error(chalk.red('Email and password required.')); process.exitCode = 1; return; }

  const spinner = ora('Signing in…').start();
  try {
    const data: any = await cloudSignIn(cfg, email, password);
    const token = data.token || data.sessionToken || data.accessToken;
    if (!token) {
      if (data.verificationRequired) {
        spinner.warn('Verification required — check your email.');
        if (data.registrationId) console.log(chalk.dim(`registrationId: ${data.registrationId}`));
        if (data.maskedEmail) console.log(chalk.dim(`maskedEmail: ${data.maskedEmail}`));
        console.log(chalk.dim(`Next: spice auth verify --registrationId ${data.registrationId || '<id>'} --code <code>`));
        return;
      }
      throw new Error('No token returned.');
    }
    const user = data.user || data.account || null;
    saveAuth({ token, user, email, username: user?.username, savedAt: new Date().toISOString() });
    spinner.succeed(`Signed in as ${chalk.cyan(user?.username || user?.email || email)}  ${chalk.dim(maskToken(token))}`);
    if (opts.json) console.log(JSON.stringify({ token, user }, null, 2));
    else console.log(chalk.dim(`Saved to ${getAuthFilePath()}`));
  } catch (e: any) {
    spinner.fail(e.message || String(e));
    process.exitCode = 1;
  }
}

export async function authSignupCommand(opts: { email?: string; password?: string; username?: string; json?: boolean }) {
  const cfg = loadConfig();
  let email = opts.email?.trim();
  let username = opts.username?.trim();
  let password = opts.password;

  if (!email) {
    const rl = await import('node:readline');
    const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
    email = await new Promise<string>((r) => iface.question('Email: ', (a) => { iface.close(); r(a.trim()); }));
  }
  if (!username) {
    const rl = await import('node:readline');
    const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
    username = await new Promise<string>((r) => iface.question('Username (3-20, letters/numbers/_): ', (a) => { iface.close(); r(a.trim()); }));
  }
  if (!password) password = await promptHidden('Password (8+, upper/lower/number/special): ');

  if (!email || !username || !password) { console.error(chalk.red('Email, username, and password required.')); process.exitCode = 1; return; }

  const spinner = ora('Creating account…').start();
  try {
    const data: any = await cloudSignUp(cfg, email, password, username);
    if (data.token) {
      saveAuth({ token: data.token, user: data.user || null, email, username, savedAt: new Date().toISOString() });
      spinner.succeed(`Account created and signed in as ${chalk.cyan(username)}  ${chalk.dim(maskToken(data.token))}`);
      if (opts.json) console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (data.verificationRequired || data.registrationId) {
      spinner.succeed(`Verification email sent to ${chalk.cyan(data.maskedEmail || email)}`);
      console.log(chalk.dim(`registrationId: ${data.registrationId}`));
      console.log(chalk.dim(`Next: spice auth verify --registrationId ${data.registrationId} --code <code>`));
      console.log(chalk.dim(`      spice auth resend --registrationId ${data.registrationId} (if you didn't get it)`));
      // Save pending so verify can pick it up without re-typing id
      try {
        const fs = await import('node:fs');
        const p = getAuthFilePath().replace('auth.json', 'pending-verify.json');
        const { default: path } = await import('node:path');
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify({ registrationId: data.registrationId, email, username, at: new Date().toISOString() }, null, 2));
        console.log(chalk.dim(`Saved pending verification to ${p}`));
      } catch {}
      if (opts.json) console.log(JSON.stringify(data, null, 2));
      return;
    }
    spinner.succeed('Signup response received.');
    if (opts.json) console.log(JSON.stringify(data, null, 2));
  } catch (e: any) {
    spinner.fail(e.message || String(e));
    process.exitCode = 1;
  }
}

export async function authVerifyCommand(opts: { registrationId?: string; code?: string; json?: boolean }) {
  const cfg = loadConfig();
  let registrationId = opts.registrationId?.trim();
  let code = opts.code?.trim();

  if (!registrationId) {
    // Try pending file
    try {
      const fs = await import('node:fs');
      const p = getAuthFilePath().replace('auth.json', 'pending-verify.json');
      if (fs.existsSync(p)) {
        const pending = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (pending.registrationId) registrationId = pending.registrationId;
      }
    } catch {}
  }
  if (!registrationId) {
    const rl = await import('node:readline');
    const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
    registrationId = await new Promise<string>((r) => iface.question('registrationId: ', (a) => { iface.close(); r(a.trim()); }));
  }
  if (!code) {
    const rl = await import('node:readline');
    const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
    code = await new Promise<string>((r) => iface.question('Verification code: ', (a) => { iface.close(); r(a.trim()); }));
  }
  if (!registrationId || !code) { console.error(chalk.red('registrationId and code required.')); process.exitCode = 1; return; }

  const spinner = ora('Verifying…').start();
  try {
    const data: any = await cloudVerifyEmail(cfg, registrationId, code);
    const token = data.token || data.sessionToken || data.accessToken;
    if (!token) throw new Error('No token returned after verification.');
    const user = data.user || data.account || null;
    saveAuth({ token, user, savedAt: new Date().toISOString() });
    // clear pending
    try { const fs = await import('node:fs'); fs.unlinkSync(getAuthFilePath().replace('auth.json', 'pending-verify.json')); } catch {}
    spinner.succeed(`Verified — signed in  ${user?.username ? chalk.cyan(user.username) : ''}  ${chalk.dim(maskToken(token))}`);
    if (opts.json) console.log(JSON.stringify(data, null, 2));
  } catch (e: any) {
    spinner.fail(e.message || String(e));
    process.exitCode = 1;
  }
}

export async function authResendCommand(opts: { registrationId?: string }) {
  const cfg = loadConfig();
  let registrationId = opts.registrationId?.trim();
  if (!registrationId) {
    try {
      const fs = await import('node:fs');
      const p = getAuthFilePath().replace('auth.json', 'pending-verify.json');
      if (fs.existsSync(p)) registrationId = JSON.parse(fs.readFileSync(p, 'utf8')).registrationId;
    } catch {}
  }
  if (!registrationId) { console.error(chalk.red('Provide --registrationId (also saved in pending-verify.json after signup).')); process.exitCode = 1; return; }
  const spinner = ora('Resending…').start();
  try {
    await cloudResendVerification(cfg, registrationId);
    spinner.succeed('Verification email resent.');
  } catch (e: any) { spinner.fail(e.message); process.exitCode = 1; }
}

export async function authLogoutCommand() {
  const existing = loadAuth();
  if (!existing) { console.log(chalk.yellow('Not logged in.')); return; }
  clearAuth();
  console.log(chalk.green('✔ Logged out (cleared ' + getAuthFilePath() + ')'));
}

export async function authStatusCommand(opts: { json?: boolean }) {
  const cfg = loadConfig();
  const auth = loadAuth();
  if (!auth) {
    if (opts.json) console.log(JSON.stringify({ loggedIn: false, authFile: getAuthFilePath() }, null, 2));
    else {
      console.log(chalk.yellow('Not logged in.'));
      console.log(chalk.dim(`  spice auth login --email you@example.com`));
      console.log(chalk.dim(`  spice auth signup --email you@example.com --username you`));
      console.log(chalk.dim(`  Auth file: ${getAuthFilePath()}`));
    }
    return;
  }
  // Verify token still valid via /api/account/me
  try {
    const me = await cloudGetMe(cfg, auth.token);
    const user = me.account || me.user || auth.user;
    if (opts.json) console.log(JSON.stringify({ loggedIn: true, user, authFile: getAuthFilePath() }, null, 2));
    else {
      console.log(chalk.green(`✔ Logged in as ${chalk.cyan(user?.username || user?.email || auth.email || '')}`));
      if (user?.email) console.log(chalk.dim(`  email: ${user.email}`));
      if (user?.id) console.log(chalk.dim(`  id: ${user.id}`));
      console.log(chalk.dim(`  token: ${maskToken(auth.token)}  saved ${auth.savedAt}`));
      console.log(chalk.dim(`  cloud: ${cfg.cloudUrl}  profile: ${cfg.profileId}  auth: ${getAuthFilePath()}`));
    }
  } catch (e: any) {
    if (opts.json) console.log(JSON.stringify({ loggedIn: true, tokenValid: false, error: e.message, authFile: getAuthFilePath() }, null, 2));
    else {
      console.log(chalk.yellow(`⚠ Token on disk but cloud rejected it: ${e.message}`));
      console.log(chalk.dim(`  Try: spice auth login  or  spice auth logout`));
      process.exitCode = 1;
    }
  }
}
