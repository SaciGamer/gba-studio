import { app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import isDev from 'electron-is-dev';

import { getPreferences } from '../../handlers/preferenceHandlers';

// Obter o caminho do diretório atual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CompileResult {
  stdout: string;
  stderr: string;
  gbaPath?: string | null;
}

const compileGBA = (options?: { cwd?: string }): Promise<CompileResult> => {
  return new Promise((resolve, reject) => {
    console.log("..: Entrou na compilação :..");
    const gbaProjectPath = options && options.cwd ? options.cwd : path.join(path.resolve(__dirname, '..', '..', '..', '..'), 'gba-project');

    // Helper to broadcast progress/errors to all renderer windows
    const broadcast = (channel: string, payload: any) => {
      try {
        BrowserWindow.getAllWindows().forEach((win) => {
          try { win.webContents.send(channel, payload); } catch (e) { /* ignore */ }
        });
      } catch (e) { /* ignore */ }
    };

    // Notify renderer that compilation started
    broadcast('compile-progress', { status: 'started', message: 'Iniciando compilação...' });

    const prefs = getPreferences();
    const devkitFromPrefs = (prefs && (prefs as any).devkitPath) ? (prefs as any).devkitPath : '';
    
    // Fallback: app userData vendor
    // const userData = path.join(os.homedir(), 'AppData', 'Local', 'gbaStudio');
    // const appDataVendorDevkit = path.join(userData, 'vendor', 'devkitPro', 'devkitARM');
    
    // Prefer project-local vendor/devkitPro/devkitARM
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const appDataVendorDevkit = isDev
      ? path.resolve(repoRoot, 'vendor', 'devkitPro', 'devkitARM') // Em dev, busca na raiz do projeto
      : path.join(app.getAppPath(), 'vendor', 'devkitPro', 'devkitARM');  // Em produção, usa o app.getAppPath()

    let devkitEnv = '';
   
    if (fs.existsSync(appDataVendorDevkit)) {
      devkitEnv = appDataVendorDevkit;
    } else {
      devkitEnv = process.env.DEVKITARM || devkitFromPrefs;
    }

    if (!devkitEnv || devkitEnv.trim() === '') {
      reject(new Error('DEVKITARM not found. Please configure DEVKITARM path in Preferences, import a vendor devkit or set the DEVKITARM environment variable.'));
      return;
    }

    console.log('..: Using DEVKITARM at', devkitEnv);

    // Prefer repo-local vendor/devkitPro top-level
    const repoVendorRoot = path.resolve(path.resolve(__dirname, '..', '..', '..', '..'), 'vendor', 'devkitPro');
    const devkitARMFromVendor = path.join(repoVendorRoot, 'devkitARM');
    const libgbaFromVendor = path.join(repoVendorRoot, 'libgba');
    const libtoncFromVendor = path.join(repoVendorRoot, 'libtonc');

    // Use libgba for LIBGBA env var, but ensure both libgba and libtonc are available
    const env = Object.assign({}, process.env, {
      DEVKITARM: devkitEnv,
      DEVKITPRO: fs.existsSync(repoVendorRoot) ? repoVendorRoot : process.env.DEVKITPRO || '',
      LIBGBA: libgbaFromVendor // Corrigido: LIBGBA deve apontar para libgba, não libtonc
    });

    // Normalize Windows backslashes to forward slashes for make/msys/git-bash
    const normalizeForMake = (p: string) => (p ? p.replace(/\\/g, '/') : p);
    const envForMake = Object.assign({}, env, {
      DEVKITARM: normalizeForMake(env.DEVKITARM),
      DEVKITPRO: normalizeForMake(env.DEVKITPRO),
      LIBGBA: normalizeForMake(env.LIBGBA)
    });

    const makeCmd = 'make';
    const makeArgs = ['rebuild'];
    console.log('..: Running:', makeCmd, makeArgs.join(' '), 'in', gbaProjectPath);
    console.log('..: ENV DEVKITPRO=', envForMake.DEVKITPRO, 'LIBGBA=', envForMake.LIBGBA);

    const proc = spawn(makeCmd, makeArgs, { cwd: gbaProjectPath, env: envForMake, shell: true });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      // Broadcast incremental progress lines
      broadcast('compile-progress', { status: 'running', message: text });
    });

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      broadcast('compile-progress', { status: 'running', message: text });
    });

    proc.on('error', (err) => {
      console.error('Erro ao executar make:', err);
      broadcast('compile-error', { message: String(err) });
      reject(err);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const errMsg = `make exited with code ${code}`;
        console.error(errMsg);
        broadcast('compile-error', { message: errMsg, stdout, stderr });
        reject(new Error(errMsg));
        return;
      }

      // On successful completion, notify renderer
      broadcast('compile-progress', { status: 'finished', message: 'Compilação finalizada' });

      // Try to locate produced .gba under gbaProjectPath/build
      const buildDir = path.join(gbaProjectPath, 'build');
      let foundGba: string | null = null;
      try {
        const walk = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.isFile() && p.toLowerCase().endsWith('.gba')) { foundGba = p; return; }
            if (foundGba) return;
          }
        };
        if (fs.existsSync(buildDir)) walk(buildDir);
      } catch (err) {
        console.warn('Error searching for built gba:', err);
      }
      resolve({ stdout, stderr, gbaPath: foundGba });
    });
  });
}

export default compileGBA;