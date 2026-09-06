const { spawn } = require("child_process");
const electron = require("electron");

// Remote runtime mode inventory note: this launcher duplicates no service or
// local-runtime lifecycle code. It only starts the shared Electron main
// process (main.js) with SPICE_NATIVE_APP=1, so the remote-mode gating owned
// by main.js (runtime.mode settings, resolveServiceUrl cloud origin, skipped
// local start/stop/health/install/update) applies to this native shell path
// exactly as it does to the standard wrapper shell.

const child = spawn(electron, ["."], {
  stdio: "inherit",
  env: {
    ...process.env,
    SPICE_NATIVE_APP: "1",
  },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code || 0);
});
