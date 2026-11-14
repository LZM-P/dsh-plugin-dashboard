// How pnpm gets started. A `.mjs` is run by node; a Windows wrapper (`pnpm.cmd`,
// from corepack or a standalone install) cannot be executed by node at all, and
// the cmd.exe quoting that fixes it is the part nobody can eyeball.
//
// Run with: node test/pnpm-command.mjs
import { pnpmInvocation } from '../index.js'

let failures = 0
function check(ok, label) {
  if (ok) console.log('ok   ' + label)
  else {
    failures += 1
    console.error('FAIL ' + label)
  }
}

const execPath = 'C:\\Program Files\\nodejs\\node.exe'

const direct = pnpmInvocation('C:/npm/node_modules/pnpm/bin/pnpm.mjs', ['add', 'a@1.0.0'], execPath)
check(direct.command === execPath, 'a pnpm.mjs is run by node')
check(direct.commandArgs[0] === 'C:/npm/node_modules/pnpm/bin/pnpm.mjs', 'the script is the first argument')
check(direct.commandArgs.slice(1).join(' ') === 'add a@1.0.0', 'arguments are passed through unchanged')
check(direct.electron === false, 'a real node is not run as electron')

const electron = pnpmInvocation('C:/npm/pnpm.mjs', [], process.execPath)
check(electron.electron === true, 'the host binary is flagged for ELECTRON_RUN_AS_NODE')

const batch = pnpmInvocation('C:\\corepack\\shims\\pnpm.cmd', ['add', '@scope/pkg@1.0.0', '--save-exact'], execPath)
check(/cmd\.exe$/i.test(batch.command), 'a pnpm.cmd goes through cmd.exe')
const line = batch.commandArgs[batch.commandArgs.length - 1]
check(line.startsWith('""') && line.endsWith('""'), 'the whole command is wrapped once for /s')
check(line.includes('"C:\\corepack\\shims\\pnpm.cmd"'), 'the wrapper path is quoted')
check(line.includes('"@scope/pkg@1.0.0"'), 'a scoped spec stays a single argument')
check(line.includes('"--save-exact"'), 'flags stay quoted as well')

const powershell = pnpmInvocation('D:\\corepack\\pnpm.ps1', ['add', 'x@1'], execPath)
check(powershell.command === 'powershell.exe', 'a pnpm.ps1 goes through powershell')
check(powershell.commandArgs.includes('-File'), 'powershell is told to run a file')

const standalone = pnpmInvocation('C:\\Users\\me\\AppData\\Local\\pnpm\\pnpm.exe', ['install'], execPath)
check(standalone.command === 'C:\\Users\\me\\AppData\\Local\\pnpm\\pnpm.exe', 'a standalone pnpm.exe runs directly')
check(standalone.commandArgs.join(' ') === 'install', 'the exe gets the arguments as-is')

if (failures > 0) {
  console.error('\nPNPM_COMMAND_FAILED')
  process.exitCode = 1
} else {
  console.log('\nPNPM_COMMAND_OK')
}
