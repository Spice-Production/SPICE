import chalk from 'chalk';
import { Command } from 'commander';

const program = new Command();

program
  .name('spice')
  .description('Spice Music CLI — search, play, download, and control via the Spice local runtime + cloud')
  .version('0.1.0')
  .addHelpText('after', `
Examples:
  ${chalk.dim('$')} spice search "hopes - apashe" -l 5
  ${chalk.dim('$')} spice play "hopes - apashe" --shuffle
  ${chalk.dim('$')} spice play dQw4w9WgXcQ dQw4w9WgXcQ --loop all
  ${chalk.dim('$')} spice stream dQw4w9WgXcQ --raw | mpv --no-video -
  ${chalk.dim('$')} spice download dQw4w9WgXcQ -o ./music -f mp3
  ${chalk.dim('$')} spice lyrics dQw4w9WgXcQ
  ${chalk.dim('$')} spice radio "hopes - apashe" --play
  ${chalk.dim('$')} spice album play MPREabc123 --shuffle
  ${chalk.dim('$')} spice auth login --email you@example.com
  ${chalk.dim('$')} spice playlists list
  ${chalk.dim('$')} spice playlists import "https://www.youtube.com/playlist?list=PL..." --title "My Import"
  ${chalk.dim('$')} spice playlists add <playlistId> "song query" dQw4w9WgXcQ
  ${chalk.dim('$')} spice playlists play <playlistId> --shuffle
  ${chalk.dim('$')} spice queue add "song query" && spice queue play
  ${chalk.dim('$')} spice likes add "hopes - apashe"
  ${chalk.dim('$')} spice doctor

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
  .argument('[key]', 'config key: localUrl | cloudUrl | defaultSource | downloadDir | downloadFormat | profileId')
  .argument('[value...]', 'value for set')
  .action(async (action, key, value) => {
    const { configCommand } = await import('./commands/config.js');
    configCommand(action, key, value);
  });

program
  .command('doctor')
  .description('Full environment check (players, ffmpeg, local runtime, cloud, auth)')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { doctorCommand } = await import('./commands/doctor.js');
    await doctorCommand(opts);
  });

// ---- radio / related / album (local runtime) ----
program
  .command('radio')
  .description('Build a related-tracks station from a seed track (UpNext via local runtime)')
  .argument('<seed>', 'seed track id or search query')
  .option('-l, --limit <n>', 'max related tracks (1-50)', '20')
  .option('--play', 'play the station after showing it', false)
  .option('--shuffle', 'shuffle before playing (with --play)', false)
  .option('--loop <mode>', 'loop mode for --play: off | all | one', 'off')
  .option('--player <bin>', 'force player for --play: mpv | ffplay | vlc')
  .option('-s, --source <src>', 'seed source: yt | sc | all', 'all')
  .option('--json', 'output JSON')
  .action(async (seed, opts) => {
    const { radioCommand } = await import('./commands/radio.js');
    await radioCommand(seed, opts);
  });

program
  .command('related')
  .description('Alias for radio without playback: show tracks related to a seed')
  .argument('<seed>', 'seed track id or search query')
  .option('-l, --limit <n>', 'max related tracks (1-50)', '20')
  .option('--json', 'output JSON')
  .action(async (seed, opts) => {
    const { relatedCommand } = await import('./commands/radio.js');
    await relatedCommand(seed, opts);
  });

const album = program.command('album').description('YouTube Music album via local runtime (show / play / download)');

album
  .command('show')
  .description('Show album tracks')
  .argument('<id>', 'YouTube Music album id')
  .option('--json', 'output JSON')
  .action(async (id, opts) => {
    const { albumShowCommand } = await import('./commands/radio.js');
    await albumShowCommand(id, opts);
  });

album
  .command('play')
  .description('Play an album (resolves streams and plays in mpv/ffplay)')
  .argument('<id>', 'YouTube Music album id')
  .option('--shuffle', 'shuffle before playing', false)
  .option('--loop <mode>', 'loop mode: off | all | one', 'off')
  .option('--player <bin>', 'force player: mpv | ffplay | vlc')
  .action(async (id, opts) => {
    const { albumPlayCommand } = await import('./commands/radio.js');
    await albumPlayCommand(id, opts);
  });

album
  .command('download')
  .alias('dl')
  .description('Download an album')
  .argument('<id>', 'YouTube Music album id')
  .option('-o, --out <dir>', 'output directory (default: ~/Music/Spice or config downloadDir)')
  .option('-f, --format <fmt>', 'output format: original | m4a | mp3 | opus', 'original')
  .option('--lyrics', 'also save .lrc/.txt lyrics alongside audio')
  .action(async (id, opts) => {
    const { albumDownloadCommand } = await import('./commands/radio.js');
    await albumDownloadCommand(id, opts);
  });

program
  .command('open')
  .description('Open a track page in the browser (resolves queries first)')
  .argument('<idOrQuery>', 'track id or search query')
  .option('-s, --source <src>', 'source: yt | sc | all', 'all')
  .action(async (idOrQuery, opts) => {
    const { openCommand } = await import('./commands/open.js');
    await openCommand(idOrQuery, opts);
  });

program
  .command('completion')
  .description('Print shell completion script (bash | zsh | powershell)')
  .argument('[shell]', 'bash (default) | zsh | powershell', 'bash')
  .action(async (shell) => {
    const { completionCommand } = await import('./commands/completion.js');
    completionCommand(shell);
  });

// ---- auth ----
const auth = program.command('auth').description('Spice cloud auth (signin / signup / verify)');

auth
  .command('login')
  .description('Sign in to Spice cloud (saves token to ~/.config/spice/auth.json)')
  .option('--email <email>', 'email')
  .option('--password <password>', 'password (or will prompt hidden)')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { authLoginCommand } = await import('./commands/auth.js');
    await authLoginCommand(opts);
  });

auth
  .command('signup')
  .description('Create a new Spice account (may require email verification)')
  .option('--email <email>', 'email')
  .option('--username <username>', 'username (3-20, letters/numbers/_)')
  .option('--password <password>', 'password')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { authSignupCommand } = await import('./commands/auth.js');
    await authSignupCommand(opts);
  });

auth
  .command('verify')
  .description('Verify email after signup')
  .option('--registrationId <id>', 'registration id from signup')
  .option('--code <code>', 'verification code from email')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { authVerifyCommand } = await import('./commands/auth.js');
    await authVerifyCommand(opts);
  });

auth
  .command('resend')
  .description('Resend verification email')
  .option('--registrationId <id>', 'registration id from signup')
  .action(async (opts) => {
    const { authResendCommand } = await import('./commands/auth.js');
    await authResendCommand(opts);
  });

auth
  .command('logout')
  .description('Clear saved token')
  .action(async () => {
    const { authLogoutCommand } = await import('./commands/auth.js');
    await authLogoutCommand();
  });

auth
  .command('status')
  .alias('whoami')
  .description('Show current auth status (validates token with cloud)')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { authStatusCommand } = await import('./commands/auth.js');
    await authStatusCommand(opts);
  });

// ---- playlists ----
const playlists = program.command('playlists').alias('pl').description('Manage cloud playlists (requires auth)');

playlists
  .command('list')
  .alias('ls')
  .description('List cloud playlists for the active profile')
  .option('--profile <id>', 'profile id (default: config profileId)')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { playlistsListCommand } = await import('./commands/playlist.js');
    await playlistsListCommand(opts);
  });

playlists
  .command('show')
  .description('Show a playlist and its tracks')
  .argument('<id>', 'playlist id or title')
  .option('--json', 'output JSON')
  .action(async (id, opts) => {
    const { playlistsShowCommand } = await import('./commands/playlist.js');
    await playlistsShowCommand(id, opts);
  });

playlists
  .command('create')
  .description('Create a new empty playlist')
  .requiredOption('--title <title>', 'playlist title')
  .option('--description <desc>', 'description')
  .option('--profile <id>', 'profile id')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { playlistsCreateCommand } = await import('./commands/playlist.js');
    await playlistsCreateCommand(opts);
  });

playlists
  .command('delete')
  .alias('rm')
  .description('Delete a playlist (requires --yes)')
  .argument('<id>', 'playlist id')
  .option('--yes', 'confirm deletion')
  .action(async (id, opts) => {
    const { playlistsDeleteCommand } = await import('./commands/playlist.js');
    await playlistsDeleteCommand(id, opts);
  });

playlists
  .command('add')
  .description('Add tracks to a playlist (ids or search queries)')
  .argument('<playlistId>', 'playlist id or title')
  .argument('<inputs...>', 'track ids or search queries')
  .option('--json', 'output JSON')
  .action(async (playlistId, inputs, opts) => {
    const { playlistsAddCommand } = await import('./commands/playlist.js');
    await playlistsAddCommand(playlistId, inputs, opts);
  });

playlists
  .command('remove')
  .description('Remove tracks from a playlist by track id')
  .argument('<playlistId>', 'playlist id or title')
  .argument('<trackIds...>', 'track ids to remove')
  .action(async (playlistId, trackIds) => {
    const { playlistsRemoveCommand } = await import('./commands/playlist.js');
    await playlistsRemoveCommand(playlistId, trackIds);
  });

playlists
  .command('import')
  .description('Import a YouTube playlist via local runtime and save as a cloud playlist')
  .argument('<url>', 'YouTube playlist URL or id (with ?list=PL...)')
  .option('--title <title>', 'override title for the imported playlist')
  .option('--as <title>', 'alias for --title')
  .option('--json', 'output JSON')
  .action(async (url, opts) => {
    const { playlistsImportCommand } = await import('./commands/playlist.js');
    await playlistsImportCommand(url, opts);
  });

playlists
  .command('export')
  .description('Export a cloud playlist to a file (json or m3u)')
  .argument('<id>', 'playlist id or title')
  .option('-o, --out <file>', 'output file (default: <title>.json|.m3u in cwd)')
  .option('-f, --format <fmt>', 'json (default) | m3u', 'json')
  .option('--json', 'output result JSON')
  .action(async (id, opts) => {
    const { playlistsExportCommand } = await import('./commands/playlist.js');
    await playlistsExportCommand(id, opts);
  });

playlists
  .command('play')
  .description('Play a cloud playlist (resolves streams and plays in mpv/ffplay)')
  .argument('<id>', 'playlist id or title')
  .option('--shuffle', 'shuffle before playing', false)
  .option('--loop <mode>', 'loop mode: off | all | one', 'off')
  .option('--player <bin>', 'force player: mpv | ffplay | vlc')
  .action(async (id, opts) => {
    const { playlistsPlayCommand } = await import('./commands/playlist.js');
    await playlistsPlayCommand(id, opts);
  });

playlists
  .command('download')
  .alias('dl')
  .description('Download every track in a cloud playlist')
  .argument('<id>', 'playlist id or title')
  .option('-o, --out <dir>', 'output directory (default: ~/Music/Spice/<playlist title>)')
  .option('-f, --format <fmt>', 'output format: original | m4a | mp3 | opus', 'original')
  .option('--lyrics', 'also save .lrc/.txt lyrics alongside audio')
  .action(async (id, opts) => {
    const { playlistsDownloadCommand } = await import('./commands/playlist.js');
    await playlistsDownloadCommand(id, opts);
  });

// ---- queue (persistent local queue) ----
const queue = program.command('queue').alias('q').description('Persistent local queue (~/.config/spice/queue.json)');

queue
  .command('add')
  .description('Add tracks to the persistent queue (ids or search queries)')
  .argument('<inputs...>', 'track ids or search queries')
  .option('--json', 'output JSON')
  .action(async (inputs, opts) => {
    const { queueAddCommand } = await import('./commands/queue.js');
    await queueAddCommand(inputs, opts);
  });

queue
  .command('list')
  .alias('ls')
  .description('List the persistent queue')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { queueListCommand } = await import('./commands/queue.js');
    queueListCommand(opts);
  });

queue
  .command('clear')
  .description('Clear the persistent queue')
  .action(() => {
    import('./commands/queue.js').then(m => m.queueClearCommand());
  });

queue
  .command('remove')
  .alias('rm')
  .description('Remove a track from the queue by position (1-based)')
  .argument('<position>', 'position in queue')
  .action(async (pos) => {
    const { queueRemoveCommand } = await import('./commands/queue.js');
    queueRemoveCommand(pos);
  });

queue
  .command('move')
  .description('Move a track within the queue (1-based positions)')
  .argument('<from>', 'current position')
  .argument('<to>', 'new position')
  .action(async (from, to) => {
    const { queueMoveCommand } = await import('./commands/queue.js');
    queueMoveCommand(from, to);
  });

queue
  .command('dedupe')
  .description('Remove duplicate tracks from the queue (keeps first occurrence)')
  .action(async () => {
    const { queueDedupeCommand } = await import('./commands/queue.js');
    queueDedupeCommand();
  });

queue
  .command('export')
  .description('Export the queue to an .m3u playlist file')
  .option('-o, --out <file>', 'output file (default: spice-queue.m3u in cwd)')
  .option('--json', 'output result JSON')
  .action(async (opts) => {
    const { queueExportCommand } = await import('./commands/queue.js');
    await queueExportCommand(opts);
  });

queue
  .command('shuffle')
  .description('Shuffle the persistent queue')
  .action(async () => {
    const { queueShuffleCommand } = await import('./commands/queue.js');
    queueShuffleCommand();
  });

queue
  .command('play')
  .description('Play the entire persistent queue (resolves streams and plays in mpv/ffplay)')
  .option('--shuffle', 'shuffle before playing', false)
  .option('--loop <mode>', 'loop mode: off | all | one', 'off')
  .option('--player <bin>', 'force player: mpv | ffplay | vlc')
  .action(async (opts) => {
    const { queuePlayCommand } = await import('./commands/queue.js');
    await queuePlayCommand(opts);
  });

queue
  .command('import')
  .description('Import a cloud playlist into the local queue')
  .argument('<playlistId>', 'cloud playlist id or title')
  .option('--json', 'output JSON')
  .action(async (playlistId, opts) => {
    const { queueImportCommand } = await import('./commands/queue.js');
    await queueImportCommand(playlistId, opts);
  });

// ---- likes ----
const likes = program.command('likes').description('Manage cloud likes (requires auth)');

likes
  .command('list')
  .alias('ls')
  .description('List liked tracks')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { likesListCommand } = await import('./commands/queue.js');
    await likesListCommand(opts);
  });

likes
  .command('add')
  .description('Like tracks (ids or search queries)')
  .argument('<inputs...>', 'track ids or search queries')
  .action(async (inputs) => {
    const { likesAddCommand } = await import('./commands/likes.js');
    await likesAddCommand(inputs);
  });

likes
  .command('remove')
  .alias('rm')
  .description('Unlike tracks by id')
  .argument('<inputs...>', 'track ids')
  .action(async (inputs) => {
    const { likesRemoveCommand } = await import('./commands/likes.js');
    await likesRemoveCommand(inputs);
  });

// ---- history / library / profiles ----
program
  .command('history')
  .description('Show cloud history (requires auth)')
  .option('-l, --limit <n>', 'max to show', '20')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { historyListCommand } = await import('./commands/library.js');
    await historyListCommand(opts);
  });

program
  .command('library')
  .description('Show combined cloud library (likes + history + playlists) for the active profile')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { libraryCommand } = await import('./commands/library.js');
    await libraryCommand(opts);
  });

program
  .command('profiles')
  .description('List cloud profiles (requires auth)')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    const { profilesListCommand } = await import('./commands/library.js');
    await profilesListCommand(opts);
  });

program.parseAsync().catch((err) => {
  console.error(chalk.red(err?.message || String(err)));
  process.exit(1);
});
