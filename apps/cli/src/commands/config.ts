import chalk from 'chalk';
import { loadConfig, saveConfig, resetConfig, configFilePath } from '../config.js';

export function configCommand(action: string | undefined, key: string | undefined, valueParts: string[] | undefined) {
  if (!action || action === 'list' || action === 'get') {
    if (key) {
      const cfg: any = loadConfig();
      if (!(key in cfg)) {
        console.error(chalk.red(`Unknown key "${key}". Known: localUrl, cloudUrl, defaultSource, downloadDir, downloadFormat`));
        process.exitCode = 1;
        return;
      }
      console.log(cfg[key]);
      return;
    }
    const cfg = loadConfig();
    console.log(chalk.bold(`\nSpice config  ${chalk.dim(configFilePath())}`));
    console.log(chalk.dim('─'.repeat(40)));
    for (const [k, v] of Object.entries(cfg)) {
      console.log(`  ${chalk.cyan(k.padEnd(16))} ${chalk.dim(String(v))}`);
    }
    console.log(chalk.dim('\n  spice config set <key> <value>'));
    console.log(chalk.dim('  spice config reset'));
    console.log('');
    return;
  }

  if (action === 'set') {
    if (!key || !valueParts?.length) {
      console.error(chalk.red('Usage: spice config set <key> <value>'));
      console.error(chalk.dim('  Keys: localUrl, cloudUrl, defaultSource (yt|sc|all), downloadDir, downloadFormat (m4a|mp3|opus|original)'));
      process.exitCode = 1;
      return;
    }
    const value = valueParts.join(' ').trim();
    const allowed = new Set(['localUrl', 'cloudUrl', 'defaultSource', 'downloadDir', 'downloadFormat']);
    if (!allowed.has(key)) {
      console.error(chalk.red(`Unknown key "${key}". Allowed: ${[...allowed].join(', ')}`));
      process.exitCode = 1;
      return;
    }
    const patch: any = { [key]: value };
    const next = saveConfig(patch);
    console.log(chalk.green(`✔ ${key} = ${value}`));
    console.log(chalk.dim(`  saved to ${configFilePath()}`));
    if (key === 'downloadFormat' && !['m4a', 'mp3', 'opus', 'original'].includes(value)) {
      console.log(chalk.yellow(`  Note: downloadFormat should be one of m4a, mp3, opus, original`));
    }
    void next;
    return;
  }

  if (action === 'reset') {
    resetConfig();
    console.log(chalk.green(`✔ Config reset (removed ${configFilePath()})`));
    return;
  }

  if (action === 'path') {
    console.log(configFilePath());
    return;
  }

  console.error(chalk.red(`Unknown config action "${action}".`));
  console.error(chalk.dim('  spice config list'));
  console.error(chalk.dim('  spice config get <key>'));
  console.error(chalk.dim('  spice config set <key> <value>'));
  console.error(chalk.dim('  spice config reset'));
  console.error(chalk.dim('  spice config path'));
  process.exitCode = 1;
}
