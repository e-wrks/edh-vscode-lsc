/// <reference types="node" />
import * as ps from 'process'
import * as cp from 'child_process'
import * as net from 'net'

import * as vscode from 'vscode'

import {
  LanguageClient,
  LanguageClientOptions,
  MessageTransports,
} from 'vscode-languageclient'

import {
  SocketMessageReader, SocketMessageWriter,
} from 'vscode-jsonrpc'


let debugLSP = false
let noLaunchLS = false

let client: LanguageClient

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
  const ElsConnWait = 3000

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

  let actPort = elsPort
  let dynPort = ''
  let finalErr = Error('failed connecting to els')
  for (let retryCntr = 0, retryWait = 0; ;) {
    try {
      const trans = await new Promise<MessageTransports>((resolve, reject) => {
        lscLog('Try connecting to els on port ' + actPort)
        const sock = net.connect(actPort)
        sock.once('error', reject)
        sock.once('connect', () => resolve({
          reader: new SocketMessageReader(sock),
          writer: new SocketMessageWriter(sock),
        }))
      })
      lscLog('Connected to els on port ' + actPort)
      return trans
    } catch (err) {
      finalErr = err
      if (++retryCntr > ElsConnRetry) break
      try {

        if (noLaunchLS) {
          continue
        }

        if (retryCntr > 1) {
          lscLog('Try launching els server again ... ')
        } else {
          lscLog('Launching els server ... ')
        }

        const elsCmd = debugLSP ? `stack run els` : `epm x els`
        const elsEnv = debugLSP ? Object.assign({}, ps.env, {
          'EDH_LOG_LEVEL': 'DEBUG',
        }) : undefined

        try {
          const psELS = cp.spawn(elsCmd, {
            shell: true,
            cwd: elsWorkFolder,
            stdio: ['inherit', 'pipe', 'pipe', 'pipe',],
            env: elsEnv,
          })
          // pump els std output to extension output channel
          const [elsOut, elsErr, elsPort] = psELS.stdio.slice(1, 4)
          if (elsOut) {
            elsOut.on('data',
              data => client.outputChannel.append(data.toString()))
          }
          if (elsErr) {
            elsErr.on('data',
              data => client.outputChannel.append(data.toString()))
          }
          if (elsPort) {
            dynPort = ''
            elsPort.on('data', data => {
              dynPort += data.toString()
              console.debug('Dyn port updated: ' + dynPort + ' from segment ' + data)
            })
            elsPort.on('close', () => {
              actPort = dynPort.trim()
              lscLog('Got dynamic els port: ' + actPort + ' from ' + dynPort)
            })
          }
        } catch (err) {
          console.error(err)
          lscLog('Failed launching els server: ' + err)
        }

      } finally {
        retryWait += ElsConnWait
        lscLog('Waiting ' + (retryWait / 1000) + ' seconds before try again ...')
        await sleep(retryWait)
      }
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
    return client.stop()
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

