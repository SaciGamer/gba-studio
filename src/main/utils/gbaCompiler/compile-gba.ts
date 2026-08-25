import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import isDev from 'electron-is-dev';
import { CompileOptions, CompileResult } from '../types/BuildTypes';
import { windows } from '@/main';

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
      path.resolve(__dirname, '..', '..', '..', '..'), 'gba-project'
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
      windows.main?.webContents.send(channel, payload);
    };

    // Notify renderer that compilation started
    broadcast('compile-progress', {
      status: 'started',
      message: '>> Iniciando compilação...',
    });

    try {
      // Setup environment
      const envForMake = setupEnvironmentWithDevkitPro();

      // Build make arguments
      const makeArgs = buildMakeArgs(compileOptions);

      console.log('..: Executando: make', makeArgs.join(' '), 'em', compileOptions.buildDir);
      console.log('..: Ambiente:', {
        DEVKITPRO: envForMake.DEVKITPRO,
        DEVKITARM: envForMake.DEVKITARM,
        LIBGBA: envForMake.LIBGBA,
        BUTANO: envForMake.BUTANO!,
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
 * Setup environment variables for compilation with DevkitPro
 * @returns - Record of environment variables 
 */
function setupEnvironmentWithDevkitPro(): Record<string, string> {
  const devkitProPath = process.env.DEVKITPRO!;

  return {        
    ...process.env,
    PATH: [
      path.join(devkitProPath, 'msys2', 'usr', 'bin'),
      path.join(devkitProPath, 'tools', 'bin'),
      path.join(devkitProPath, 'devkitARM', 'bin'),
      process.env.PATH
    ].join(path.delimiter),
    BUTANO: path.resolve(
      isDev 
      ? path.join(__dirname, '..', '..', '..', '..', 'tools', 'butano')
      : path.join(process.resourcesPath, 'bin', 'tools', 'butano')
    ),
    DEVKITPRO: devkitProPath,
    DEVKITARM: path.join(devkitProPath, 'devkitARM'),
    LIBGBA: path.join(devkitProPath, 'libgba'),
  } as Record<string, string>;
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