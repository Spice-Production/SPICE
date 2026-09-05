// Static shell completions for the `spice` command tree.
// Kept static (not commander-driven) so output is stable across shells.

const COMMANDS = [
  'search', 'play', 'stream', 'download', 'dl', 'lyrics', 'radio', 'related',
  'album', 'open', 'status', 'doctor', 'config', 'auth', 'playlists', 'pl',
  'queue', 'q', 'likes', 'history', 'library', 'profiles', 'completion', 'help',
];

const SUBCOMMANDS: Record<string, string[]> = {
  auth: ['login', 'signup', 'verify', 'resend', 'logout', 'status', 'whoami'],
  playlists: ['list', 'ls', 'show', 'create', 'delete', 'rm', 'add', 'remove', 'import', 'export', 'play', 'download'],
  pl: ['list', 'ls', 'show', 'create', 'delete', 'rm', 'add', 'remove', 'import', 'export', 'play', 'download'],
  queue: ['add', 'list', 'ls', 'clear', 'remove', 'rm', 'move', 'shuffle', 'dedupe', 'export', 'import', 'play'],
  q: ['add', 'list', 'ls', 'clear', 'remove', 'rm', 'move', 'shuffle', 'dedupe', 'export', 'import', 'play'],
  likes: ['list', 'ls', 'add', 'remove', 'rm'],
  album: ['show', 'play', 'download'],
  config: ['list', 'get', 'set', 'reset', 'path'],
};

export function completionCommand(shell: string) {
  const sh = (shell || 'bash').toLowerCase();
  if (sh === 'zsh') { console.log(zshCompletion()); return; }
  if (sh === 'powershell' || sh === 'pwsh') { console.log(powershellCompletion()); return; }
  console.log(bashCompletion());
}

function bashCompletion() {
  const subs = Object.entries(SUBCOMMANDS)
    .map(([cmd, subs]) => `      ${cmd}) COMPREPLY=( $(compgen -W "${subs.join(' ')}" -- "$cur") ) ;;`)
    .join('\n');
  return `# spice bash completion — add to ~/.bashrc:  eval "$(spice completion bash)"
_spice_completions() {
  local cur prev words cword
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${COMMANDS.join(' ')}" -- "$cur") )
    return 0
  fi
  case "\${COMP_WORDS[1]}" in
${subs}
  esac
}
complete -F _spice_completions spice
complete -F _spice_completions spice-music`;
}

function zshCompletion() {
  return `# spice zsh completion — save as _spice in $fpath, then: autoload -U compinit && compinit
#compdef spice spice-music
_spice() {
  local -a commands=(${COMMANDS.map((c) => `'${c}'`).join(' ')})
  if (( CURRENT == 2 )); then
    _describe 'spice command' commands
    return
  fi
  case "$words[2]" in
${Object.entries(SUBCOMMANDS).map(([cmd, subs]) => `    ${cmd}) _describe '${cmd} subcommand' '(${subs.map((s) => `'${s}'`).join(' ')})' ;;`).join('\n')}
  esac
}
_spice "$@"`;
}

function powershellCompletion() {
  return `# spice PowerShell completion — add to $PROFILE:  spice completion powershell | Out-String | Invoke-Expression
Register-ArgumentCompleter -Native -CommandName @('spice', 'spice-music') -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $words = $commandAst.ToString() -split '\\s+'
  if ($words.Count -le 2) {
    @(${COMMANDS.map((c) => `'${c}'`).join(', ')}) | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
    return
  }
  $subs = @{
${Object.entries(SUBCOMMANDS).map(([cmd, subs]) => `    '${cmd}' = @(${subs.map((s) => `'${s}'`).join(', ')})`).join('\n')}
  }
  $list = $subs[$words[1]]
  if ($null -eq $list) { return }
  $list | Where-Object { $_ -like "$wordToComplete*" } |
    ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
}`;
}
