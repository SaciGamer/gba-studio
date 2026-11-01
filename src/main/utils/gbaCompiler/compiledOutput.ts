import fs from 'fs';
import path from 'path';

export function locateCompiledOutput(buildDir: string): {
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

  const makefile = path.join(buildDir, 'Makefile');
  const target = fs.existsSync(makefile) ? fs.readFileSync(makefile, 'utf8').match(/^TARGET\s*:=\s*(.+)$/m)?.[1]?.trim() : undefined;
  if (target && /^[A-Za-z0-9_-]+$/.test(target)) {
    const find = (extension: string) => searchDirs.map(dir => path.join(dir, target + extension)).find(filename => fs.existsSync(filename)) ?? null;
    return { gbaPath: find('.gba'), elfPath: find('.elf'), mapPath: find('.map') };
  }

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
