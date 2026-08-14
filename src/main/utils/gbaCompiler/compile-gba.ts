import { app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import isDev from 'electron-is-dev';
import { CompileOptions, CompileResult } from '../types/BuildTypes';
import { getPreferences } from '../../handlers/preferenceHandlers';

// Obter o caminho do diretório atual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Compile GBA project using make
 * Handles environment setup, progress reporting, and output detection
 * 
 * @param options - CompileOptions object containing buildDir, devkitPath, parallel, verbose, optimizationLevel
 * @returns Promise<CompileResult> - Resolves with the result of the compilation
 * 
 * Supports both new interface (CompileOptions) and legacy interface (`cwd: string`)
 * 
 * Note: Butano asset generation (graphics, audio) is handled upstream in transcodeProject.
 * This function only invokes make to compile the project.
 */
const compileGBA = (options: CompileOptions | { cwd?: string }): Promise<CompileResult> => {
  // Handle legacy interface
  if (!('buildDir' in options)) {
    const legacyOpts = options as { cwd?: string };
    const cwd = legacyOpts.cwd || path.join(
      path.resolve(__dirname, '..', '..', '..', '..'),
      'gba-project'
    );
    return compileGBA({ buildDir: cwd });
  }

  const compileOptions = options as CompileOptions;
  return new Promise((resolve, reject) => {
    console.log('..: Iniciando compilação com opções:', {
      buildDir: compileOptions.buildDir,
      parallel: compileOptions.parallel,
      verbose: compileOptions.verbose,
    });

    // Validate build directory exists
    if (!fs.existsSync(compileOptions.buildDir)) {
      reject(new Error(`Build directory not found: ${compileOptions.buildDir}`));
      return;
    }

    // Helper to broadcast progress/errors to all renderer windows
    const broadcast = (channel: string, payload: any) => {
      try {
        BrowserWindow.getAllWindows().forEach((win) => {
          try {
            win.webContents.send(channel, payload);
          } catch (e) {
            /* ignore */
          }
        });
      } catch (e) {
        /* ignore */
      }
    };

    // Notify renderer that compilation started
    broadcast('compile-progress', {
      status: 'started',
      message: '>> Iniciando compilação...',
    });

    try {
      // Setup environment
      const env = setupEnvironment(compileOptions);

      // Normalize for make/msys
      const envForMake = normalizeEnvForMake(env);

      // Build make arguments
      const makeArgs = buildMakeArgs(compileOptions);

      console.log('..: Executando: make', makeArgs.join(' '), 'em', compileOptions.buildDir);
      console.log('..: Ambiente:', {
        DEVKITPRO: envForMake.DEVKITPRO,
        DEVKITARM: envForMake.DEVKITARM,
        LIBGBA: envForMake.LIBGBA,
      });

      let fullStdout = '';
      let fullStderr = '';

      const proc = spawn('make', makeArgs, {
        cwd: compileOptions.buildDir,
        env: envForMake,
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        fullStdout += text;
        broadcast('compile-progress', { status: 'running', message: text });
      });

      proc.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        fullStderr += text;
        broadcast('compile-progress', { status: 'running', message: text });
      });

      proc.on('error', (err) => {
        console.error('..: Erro ao executar make:', err);
        broadcast('compile-error', { message: String(err) });
        reject(err);
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          const errMsg = `make exited with code ${code}`;
          console.error('..: ' + errMsg);
          const logsDir = path.join(compileOptions.buildDir, 'build-logs');
          if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
          const logPath = path.join(logsDir, `make.log`);
          fs.writeFileSync(logPath, `=== STDOUT ===\n${fullStdout}\n\n=== STDERR ===\n${fullStderr}\n`, 'utf8');
          console.log('..: Wrote make log to', logPath);
          broadcast('compile-error', { message: errMsg, stdout: fullStdout, stderr: fullStderr, logPath });
          reject(new Error(`${errMsg}\nSee log: ${logPath}\n${stderr}`));
          return;
        }

        broadcast('compile-progress', {
          status: 'finished',
          message: '>> Compilação finalizada',
        });

        const outputResult = locateCompiledOutput(compileOptions.buildDir);
        console.log('..: Compilação completa. Arquivos encontrados:', outputResult);
        resolve({
          success: true,
          stdout,
          stderr,
          gbaPath: outputResult.gbaPath,
          elfPath: outputResult.elfPath,
          mapPath: outputResult.mapPath,
        });
      });
    } catch (err) {
      console.error('..: Erro ao configurar compilação:', err);
      broadcast('compile-error', { message: String(err) });
      reject(err);
    }
  });
};

/**
 * Setup environment variables for compilation
 * @param options - CompileOptions containing buildDir, devkitPath, etc.
 * @returns - Record of environment variables 
 */
function setupEnvironment(options: CompileOptions): Record<string, string> {
  const prefs = getPreferences();
  const devkitFromPrefs = (prefs && (prefs as any).devkitPath)
    ? (prefs as any).devkitPath
    : '';

  // Prefer project-local tools/devkitPro/devkitARM
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const localDevkitPath = isDev
    ? path.resolve(repoRoot, 'tools', 'devkitPro', 'devkitARM')
    : path.join(app.getAppPath(), 'tools', 'devkitPro', 'devkitARM');

  let devkitArm = options.devkitPath || '';

  if (fs.existsSync(localDevkitPath)) {
    devkitArm = localDevkitPath;
  } else if (fs.existsSync(devkitFromPrefs)) {
    devkitArm = devkitFromPrefs;
  } else {
    devkitArm = process.env.DEVKITARM || '';
  }

  if (!devkitArm || devkitArm.trim() === '') {
    throw new Error(
      'DEVKITARM not found. Please configure DEVKITARM path in Preferences, ' +
        'import a devkit into the tools folder or set the DEVKITARM environment variable.'
    );
  }

  console.log('..: Using DEVKITARM at', devkitArm);

  // Setup DEVKITPRO paths
  const repoToolsRoot = options.devkitPro
    ? options.devkitPro
    : path.resolve(repoRoot, 'tools', 'devkitPro');

  const libgbaPath = path.join(repoToolsRoot, 'libgba');

  return {
    ...process.env,
    DEVKITARM: devkitArm,
    DEVKITPRO: fs.existsSync(repoToolsRoot) ? repoToolsRoot : process.env.DEVKITPRO || '',
    LIBGBA: libgbaPath,
  } as Record<string, string>;
}

/**
 * Normalize environment variables for make/msys (convert backslashes to forward slashes)
 * @param env - Record of environment variables
 * @returns - Normalized environment variables
 */
function normalizeEnvForMake(env: Record<string, string>): Record<string, string> {
  const normalize = (p: string | undefined) => (p ? p.replace(/\\/g, '/') : '');

  return {
    ...env,
    DEVKITARM: normalize(env.DEVKITARM) || env.DEVKITARM,
    DEVKITPRO: normalize(env.DEVKITPRO) || env.DEVKITPRO,
    LIBGBA: normalize(env.LIBGBA) || env.LIBGBA,
  };
}

/**
 * Build make command arguments
 * @param options - CompileOptions containing parallel, optimizationLevel, verbose
 * @returns - Array of make command arguments
 */
function buildMakeArgs(options: CompileOptions): string[] {
  const args: string[] = [];
  // Determine parallel jobs: use provided value if valid, otherwise half of CPU cores
  const parallelJobs: number = (typeof options.parallel === 'number' && options.parallel > 0)
    ? options.parallel
    : Math.max(1, Math.floor(os.cpus().length / 2));

  args.push(`-j${parallelJobs}`);

  // Add optimization level flag if specified and valid
  const lvl = options.optimizationLevel;
  if (typeof lvl === 'string') {
    const validLevels = ['O0', 'O1', 'O2', 'O3', 'Og', 'Os'];
    if (validLevels.includes(lvl)) {
      args.push(`CFLAGS_OPT=-${lvl}`);
    }
  }

  // Add verbose flag if requested
  if (options.verbose) {
    args.push('VERBOSE=1');
  }

  return args;
}

/**
 * Locate compiled output files (gba, elf, map)
 * @param buildDir - The directory where the build output is located
 * @returns - Object containing paths to gba, elf, and map files (or null if not found)
 */
function locateCompiledOutput(buildDir: string): {
  gbaPath: string | null;
  elfPath: string | null;
  mapPath: string | null;
} {
  const result = {
    gbaPath: null as string | null,
    elfPath: null as string | null,
    mapPath: null as string | null,
  };

  // lista de diretórios a procurar: buildDir e buildDir/build
  const searchDirs = [
    buildDir,
    path.join(buildDir, 'build')
  ];

  try {
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) {
        return;
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(fullPath).toLowerCase();

          if (ext === '.gba' && !result.gbaPath) {
            result.gbaPath = fullPath;
          } else if (ext === '.elf' && !result.elfPath) {
            result.elfPath = fullPath;
          } else if (ext === '.map' && !result.mapPath) {
            result.mapPath = fullPath;
          }
        }

        // Stop if all files found
        if (result.gbaPath && result.elfPath && result.mapPath) {
          return;
        }
      }
    };

    // percorre cada diretório da lista
    for (const dir of searchDirs) {
      walk(dir);
      if (result.gbaPath && result.elfPath && result.mapPath) {
        break;
      }
    }
  } catch (err) {
    console.warn('..: Error searching for compiled output:', err);
  }

  return result;
}

export default compileGBA;