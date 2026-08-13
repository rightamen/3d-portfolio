// Two ways to reach the VPS, behind one interface.
//
// Why two: deploy-vps.mjs was written against ssh2 with password authentication
// (VPS_HOST + VPS_PASSWORD). This workstation has neither -- it authenticates to
// the VPS with an SSH key and nothing else -- so `npm run deploy:vps` simply
// could not run here, and the 2026-08-12 deploy was done by hand-assembling an
// equivalent remote script and piping it to `ssh bash -s`. That worked, but it
// left the real deploy path unexercised and unrepeatable. This module is that
// improvisation made permanent.
//
// Both transports expose:
//   run(command, { stream })  -> { stdout, stderr }; rejects on a non-zero exit
//   upload(localPath, remotePath)
//   end()
//
// The openssh transport shells out to the system `ssh` rather than teaching ssh2
// about keys, because the system client is the thing that already works here: it
// reads ~/.ssh/config, agents, known_hosts and hardware keys without this script
// having to reimplement any of it.

import { createReadStream } from 'node:fs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`

// Commands are handed to a remote `bash -s` over stdin instead of being pasted
// into argv. Nothing then has to survive a second round of shell quoting, and
// the deploy script -- several KB of heredocs -- is not subject to any argv
// length limit.
const spawnSsh = (args, { input, inputStream, stream, label }) =>
  new Promise((resolve, reject) => {
    const child = spawn('ssh', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk
      if (stream) process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      if (stream) process.stderr.write(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(`ssh exited ${code} (${label})\n${stderr || stdout}`))
    })

    if (inputStream) {
      inputStream.on('error', reject)
      inputStream.pipe(child.stdin)
      return
    }
    child.stdin.end(input ?? '')
  })

export const createKeyTransport = ({
  host,
  port = 22,
  username = 'root',
  identityFile,
  connectTimeout = 20,
}) => {
  const target = `${username}@${host}`
  const baseArgs = [
    // BatchMode: a deploy that stops on an invisible password prompt is worse
    // than one that fails immediately with "no key worked".
    '-o',
    'BatchMode=yes',
    '-o',
    `ConnectTimeout=${connectTimeout}`,
    '-p',
    String(port),
  ]
  if (identityFile) baseArgs.push('-i', identityFile)

  return {
    kind: 'key',
    describe: () => `ssh key auth as ${target}:${port}${identityFile ? ` (-i ${identityFile})` : ''}`,
    run: (command, { stream = false } = {}) =>
      spawnSsh([...baseArgs, target, 'bash -s'], {
        input: command,
        stream,
        label: 'remote command',
      }),
    // Streamed over stdin rather than scp: scp on this host has repeatedly been
    // the flaky part of an otherwise fine connection, and `cat >` needs nothing
    // beyond the shell that is already there.
    upload: (localPath, remotePath) =>
      spawnSsh([...baseArgs, target, `cat > ${shellQuote(remotePath)}`], {
        inputStream: createReadStream(localPath),
        label: `upload ${remotePath}`,
      }),
    end: () => {},
  }
}

export const createPasswordTransport = async ({
  host,
  port = 22,
  username = 'root',
  password,
  connectTimeout = 20000,
}) => {
  const { Client } = require('ssh2')
  const connection = new Client()

  await new Promise((resolve, reject) => {
    connection
      .on('ready', resolve)
      .on('keyboard-interactive', (_name, _instructions, _language, _prompts, finish) => {
        finish([password])
      })
      .on('error', reject)
      .connect({
        host,
        port,
        username,
        password,
        tryKeyboard: true,
        readyTimeout: connectTimeout,
      })
  })

  const run = (command, { stream = false } = {}) =>
    new Promise((resolve, reject) => {
      connection.exec(command, (error, remoteStream) => {
        if (error) {
          reject(error)
          return
        }

        let stdout = ''
        let stderr = ''
        remoteStream.on('data', (chunk) => {
          stdout += chunk
          if (stream) process.stdout.write(chunk)
        })
        remoteStream.stderr.on('data', (chunk) => {
          stderr += chunk
          if (stream) process.stderr.write(chunk)
        })
        remoteStream.on('close', (code) => {
          if (code === 0) {
            resolve({ stdout, stderr })
            return
          }
          reject(new Error(`Command failed (${code}): ${command}\n${stderr || stdout}`))
        })
      })
    })

  const upload = (localPath, remotePath) =>
    new Promise((resolve, reject) => {
      connection.sftp((error, sftp) => {
        if (error) {
          reject(error)
          return
        }

        const readStream = createReadStream(localPath)
        const writeStream = sftp.createWriteStream(remotePath)
        writeStream.on('close', resolve)
        writeStream.on('error', reject)
        readStream.on('error', reject)
        readStream.pipe(writeStream)
      })
    })

  return {
    kind: 'password',
    describe: () => `ssh password auth as ${username}@${host}:${port}`,
    run,
    upload,
    end: () => connection.end(),
  }
}

/**
 * Picks a transport from the environment. `key` is the default because it is
 * what a machine with an SSH agent or ~/.ssh key already has; password auth is
 * only chosen when a password is actually supplied, or asked for explicitly.
 */
export const createTransport = async ({ auth, host, port, username, password, identityFile }) => {
  const mode = (auth || (password ? 'password' : 'key')).toLowerCase()

  if (mode === 'password') {
    if (!password) {
      throw new Error('VPS_AUTH=password requires VPS_PASSWORD.')
    }
    return createPasswordTransport({ host, port, username, password })
  }

  if (mode === 'key') {
    return createKeyTransport({ host, port, username, identityFile })
  }

  throw new Error(`Unknown VPS_AUTH=${mode}. Use "key" or "password".`)
}
