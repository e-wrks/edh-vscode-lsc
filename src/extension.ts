/// <reference types="node" />
import * as ps from 'process'
import * as cp from 'child_process'
import * as net from 'net'

import * as vscode from 'vscode'


import {
  SocketMessageReader, SocketMessageWriter,
} from 'vscode-jsonrpc/node'

import {
  LanguageClient,
  LanguageClientOptions,
  MessageTransports,
} from 'vscode-languageclient/node'


let debugLSP = false
let noLaunchLS = false

let client: LanguageClient
let psELS: cp.ChildProcess | null = null

function checkKillProcess(ps: cp.ChildProcess | null): void {
  if (null === ps) {
    return;
  }
  try {
    console.debug('Killing els server pid=' + ps.pid)
    process.kill(ps.pid, "SIGKILL");
  } catch (error) {
    // All is fine.
  }
}

function lscLog(msg: string) {
  if (client) {
    console.debug(msg)
    client.outputChannel.append(msg + '\n')
  } else {
    console.warn(msg)
  }
}

async function connectEdhLangServer(elsWorkFolder: string): Promise<MessageTransports> {
  const ElsConnRetry = 10
  const ElsConnWait = 60000 // force retry every miniute

  lscLog('Obtaining els config ...')
  const elsPort: string = await new Promise((resolve, reject) => {
    cp.exec(`epm x edhm els/config/port`, {
      cwd: elsWorkFolder,
    }, (error, stdout, _stderr) => {
      if (null !== error && undefined !== error) {
        reject(error)
      } else {
        resolve(stdout.trim())
      }
    })
  })
  lscLog('Got configured els port ' + elsPort)

  let tryPort = elsPort
  let finalErr: unknown = Error('failed connecting to els')
  for (let retryCntr = 0; retryCntr < ElsConnRetry; retryCntr++) {
    try {
      const trans = await new Promise<MessageTransports>((resolve, reject) => {
        lscLog('Try connecting to els on port ' + tryPort)
        const sock = net.connect(tryPort)
        sock.once('error', reject)
        sock.once('connect', () => resolve({
          reader: new SocketMessageReader(sock),
          writer: new SocketMessageWriter(sock),
        }))
      })
      lscLog('Connected to els on port ' + tryPort)
      return trans
    } catch (err) {
      finalErr = err
    }

    if (noLaunchLS) {
      lscLog('Waiting ' + (ElsConnWait / 1000)
        + ' seconds before try again ...')
      await sleep(ElsConnWait)
      continue
    }

    if (retryCntr > 1) {
      lscLog('Try launching els server again ... ')
    } else {
      lscLog('Launching els server ... ')
    }

    const launchedPort = new Promise<string>((resolve, reject) => {
      try {
        const elsCmdl = debugLSP ? ['stack', 'run', 'els'] : ['epm', 'x', 'els']
        const elsEnv = debugLSP ? Object.assign({}, ps.env, {
          'EDH_LOG_LEVEL': 'DEBUG',
        }) : undefined

        checkKillProcess(psELS)
        psELS = cp.spawn('/usr/bin/env', elsCmdl, {
          shell: false,
          cwd: elsWorkFolder,
          stdio: ['inherit', 'pipe', 'pipe', 'pipe',],
          env: elsEnv,
        })
        lscLog('Launched els server pid=' + psELS.pid)
          // this semicolon is necessary to disambiguate following parenthesis
          ;
        // around the arrow def from call making
        (() => {
          const ps = psELS
          ps.on('exit', () => lscLog('els server crashed pid=' + ps.pid))
          // pump els std output to extension output channel
          const [elsOut, elsErr, elsPort] = ps.stdio.slice(1, 4)
          if (elsOut) {
            elsOut.on('data',
              data => client.outputChannel.append(data.toString()))
          }
          if (elsErr) {
            elsErr.on('data',
              data => client.outputChannel.append(data.toString()))
          }
          if (elsPort) {
            let dynPort = ''
            elsPort.on('data', data => {
              dynPort += data.toString()
              console.debug('Dyn port updated: ' + dynPort + ' from segment ' + data)
            })
            elsPort.on('close', () => {
              const dynPortFinal = dynPort.trim()
              lscLog('Got dynamic els port: ' + dynPortFinal + ' from ' + dynPort)
              if (dynPortFinal) {
                resolve(dynPortFinal)
              }
            })
          }
        })()
      } catch (err) {
        debugger
        reject(err)
      } finally {
        setTimeout(() => resolve(tryPort), ElsConnWait)
      }
    })

    try {
      tryPort = await launchedPort
    } catch (err) {
      console.error(err)
      lscLog('Failed launching els server: ' + err)
    }
  }

  console.error('Can not connect to els server after '
    + ElsConnRetry + ' attempts, giving up.')
  throw finalErr
}

export function activate(_context: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration()
  debugLSP = !!cfg.get("Edh.LanguageServer.debug")
  noLaunchLS = !!cfg.get("Edh.LanguageServer.noLaunch")

  const wsFolders = vscode.workspace.workspaceFolders
  if (!wsFolders) return
  // todo honor difference in els config from multiple ws roots
  const wsFolder = wsFolders[0].uri
  if (wsFolder.scheme !== 'file') {
    console.warn('Not working with non-file workspace: ' + wsFolder)
    return
  }

  let clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'edh' }],
    // synchronize: {
    //   fileEvents: vscode.workspace.createFileSystemWatcher('**/*.edh')
    // },
  }

  client = new LanguageClient(
    'edhLanguageServerClient',
    'Đ (Edh) Language Server',
    () => connectEdhLangServer(wsFolder.fsPath),
    clientOptions
  )

  client.start()
}

export function deactivate() {
  if (client) {
    return client.stop().finally(() => checkKillProcess(psELS))
  } else {
    checkKillProcess(psELS)
  }
}

// workaround described at:
// https://github.com/microsoft/vscode/issues/567#issuecomment-159400247
process.on('SIGTERM', () => {
  if (psELS !== null) {
    psELS.kill("SIGTERM");
  }
})

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
