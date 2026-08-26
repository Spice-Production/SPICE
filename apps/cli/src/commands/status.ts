import chalk from 'chalk';
import { loadConfig, configFilePath } from '../config.js';
import { probeLocalRuntime } from '../api.js';

export async function statusCommand(opts: { json?: boolean }) {
  const cfg = loadConfig();
  const local = await probeLocalRuntime(cfg);

  const payload: any = {
    configFile: configFilePath(),
    localUrl: cfg.localUrl,
    cloudUrl: cfg.cloudUrl,
    localRuntime: local.ok ? 'up' : 'down',
    localDetail: local.ok ? local.data : { status: (local as any).status, message: (local as any).message },
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.bold('\nSpice CLI — status'));
  console.log(chalk.dim('─'.repeat(24)));
  console.log(`  ${chalk.dim('config:')}  ${configFilePath()}`);
  console.log(`  ${chalk.dim('local:')}   ${cfg.localUrl}  ${local.ok ? chalk.green('● up') : chalk.red('○ down')}`);
  console.log(`  ${chalk.dim('cloud:')}   ${cfg.cloudUrl}`);
  if (local.ok) {
    const d: any = (local as any).data;
    // runtime payload varies — print a couple known fields if present
    if (d?.version) console.log(`  ${chalk.dim('runtime:')} ${d.version}`);
    if (d?.status) console.log(`  ${chalk.dim('detail:')}  ${JSON.stringify(d).slice(0, 200)}`);
    console.log(chalk.green('\n✔ Local runtime is reachable. search/play/download should work.'));
  } else {
    console.log(chalk.red(`\n✖ Local runtime not reachable: ${(local as any).message || 'connection failed'}`));
    console.log(chalk.dim('  Start it with:  npm run backend:dev  — or —  npm run start:native'));
    console.log(chalk.dim('  Or point the CLI elsewhere:  spice config set localUrl http://127.0.0.1:3939'));
    console.log(chalk.dim('  Tip: cloud-only media scraping is disabled; local runtime is required for search/play.'));
  }
  console.log('');
}
