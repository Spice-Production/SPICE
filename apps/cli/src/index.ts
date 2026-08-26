#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('spice')
  .description('Spice Music CLI — search, play, and download via the Spice local runtime')
  .version('0.1.0')
  .addHelpText('after', `
Examples:
  ${chalk.dim('$')} spice search "hopes - apashe" -l 5
  ${chalk.dim('$')} spice play "hopes - apashe" --shuffle
  ${chalk.dim('$')} spice play dQw4w9WgXcQ dQw4w9WgXcQ --loop all
  ${chalk.dim('$')} spice stream dQw4w9WgXcQ --raw | mpv --no-video -
  ${chalk.dim('$')} spice download dQw4w9WgXcQ -o ./music -f mp3
  ${chalk.dim('$')} spice lyrics dQw4w9WgXcQ
  ${chalk.dim('$')} spice status
  ${chalk.dim('$')} spice config set downloadDir ~/Music/Spice

Local runtime: ${chalk.cyan('http://127.0.0.1:3939')}  (override with SPICE_LOCAL_RUNTIME_URL or spice config)
Cloud:         ${chalk.cyan('https://music.spice-app.xyz')}
Requires:      mpv (recommended), or ffplay/vlc, and ffmpeg for downloads with -f mp3/opus/m4a
`);

// search
program
  .command('search')
  .description('Search tracks (YouTube Music / SoundCloud via local runtime)')
  .argument('<query...>', 'search query')
  .option('-l, --limit <n>', 'max results (1-50)', '20')
  .option('-s, --source <src>', 'source: yt | sc | all', 'all')
  .option('--web', 'search YouTube web videos (regular uploads) instead of Music catalog')
  .option('--json', 'output JSON')
  .action(async (query, opts) => {
    const { searchCommand } = await import('./commands/search.js');
    await searchCommand(query, opts);
  });

// play
program
  .command('play')
  .description('Play tracks — resolves ids or search queries, then plays in mpv/ffplay/vlc')
  .argument('<inputs...>', 'track ids, YouTube URLs, or search queries (each arg is one item; use quotes for queries with spaces)')
  .option('--shuffle', 'shuffle the queue', false)
  .option('--loop <mode>', 'loop mode: off | all | one', 'off')
  .option('--player <bin>', 'force player: mpv | ffplay | vlc')
  .option('-s, --source <src>', 'preferred source: yt | sc | all', 'all')
  .option('-f, --format <fmt>', 'preferred stream: original | m4a | opus | mp3', 'original')
  .action(async (inputs, opts) => {
    const { playCommand } = await import('./commands/play.js');
    await playCommand(inputs, opts);
  });

// stream
program
  .command('stream')
  .description('Resolve a track id (or query) to signed stream URLs')
  .argument('<idOrQuery>', 'track id or search query')
  .option('-s, --source <src>', 'source hint: yt | sc', 'yt')
  .option('-f, --format <fmt>', 'preferred stream: original | m4a | opus | mp3', 'original')
  .option('--json', 'output JSON (all variants + best)')
  .option('--raw', 'output only the best stream URL (for piping)')
  .action(async (idOrQuery, opts) => {
    const { streamCommand } = await import('./commands/stream.js');
    await streamCommand(idOrQuery, opts);
  });

// download
program
  .command('download')
  .alias('dl')
  .description('Download tracks — resolves ids/URLs/queries and saves audio')
  .argument('<inputs...>', 'track ids, YouTube URLs, or search queries')
  .option('-o, --out <dir>', 'output directory (default: ~/Music/Spice or config downloadDir)')
  .option('-f, --format <fmt>', 'output format: original | m4a | mp3 | opus  (mp3/opus/m4a need ffmpeg)', 'original')
  .option('-s, --source <src>', 'source: yt | sc | all', 'all')
  .option('--lyrics', 'also save .lrc/.txt lyrics alongside audio')
  .action(async (inputs, opts) => {
    const { downloadCommand } = await import('./commands/download.js');
    await downloadCommand(inputs, opts);
  });

// lyrics
program
  .command('lyrics')
  .description('Fetch synced/plain lyrics (LRCLIB via local runtime)')
  .argument('<idOrQuery>', 'track id or search query')
  .option('-s, --source <src>', 'source hint: yt | sc | all', 'all')
  .option('--json', 'output JSON')
  .action(async (idOrQuery, opts) => {
    const { lyricsCommand } = await import('./commands/lyrics.js');
    await lyricsCommand(idOrQuery, opts);
  });

// status
program
  .command('status')
  .description('Check local runtime and config status')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand(opts);
  });

// config
program
  .command('config')
  .description('View or change CLI config (~/.config/spice/config.json)')
  .argument('[action]', 'list | get | set | reset | path  (default: list)', 'list')
  .argument('[key]', 'config key: localUrl | cloudUrl | defaultSource | downloadDir | downloadFormat')
  .argument('[value...]', 'value for set')
  .action(async (action, key, value) => {
    const { configCommand } = await import('./commands/config.js');
    configCommand(action, key, value);
  });

program
  .command('doctor')
  .description('Alias for status (check setup)')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand(opts);
  });

program.parseAsync().catch((err) => {
  console.error(chalk.red(err?.message || String(err)));
  process.exit(1);
});
