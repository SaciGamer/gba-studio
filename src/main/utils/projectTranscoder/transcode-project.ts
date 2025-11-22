import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Obter o caminho do diretório atual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Minimal transcode: reads project/*.gbasres and assets/* and generates a basic main.c
 * and copies referenced images into path build/assets.
 */
export async function transcodeProject(projectDir: string) {
  console.log('..: transcodeProject projectDir', projectDir);
  const repoRoot = path.resolve(__dirname, '..', '..');
  const vendorRoot = path.join(repoRoot, '..', '..', 'vendor');
  const tempBuild = path.join(os.tmpdir(), 'gba-studio-temp', 'gba-studio-build');

  const projectFolder = path.join(projectDir, 'project');
  const assetsFolder = path.join(projectDir, 'assets');

  // Collect basic project info
  let projectName = path.basename(projectDir);

  try {
    if (fs.existsSync(projectFolder)) {
      const files = fs.readdirSync(projectFolder);
      // Look for project.gbaproj or project .gbasres
      for (const f of files) {
        if (f.endsWith('.gbasres') || f.endsWith('.gbaproj')) {
          try {
            const content = fs.readFileSync(path.join(projectFolder, f), 'utf8');
            const obj = JSON.parse(content);
            if (obj._resourceType === 'project' && obj.name) projectName = obj.name;
          } catch (e) {
            // ignore parse errors
          }
        }
      }
    }

  // Ensure project build folder (primary output for converted artifacts)
  // const projectBuild = path.join(projectDir, 'build');
  // if (!fs.existsSync(projectBuild)) fs.mkdirSync(projectBuild, { recursive: true });

  // Ensure path build exists inside gba-project
  if (fs.existsSync(tempBuild)) fs.rmSync(tempBuild, { recursive: true, force: true });
  fs.mkdirSync(tempBuild, { recursive: true });

  // Copy the main Makefile from gba-project into path build so path build can be built independently
  try {
    const srcMake = path.join(vendorRoot, 'Makefile');
    const dstMake = path.join(tempBuild, 'Makefile');
    if (fs.existsSync(srcMake)) {
      let content = fs.readFileSync(srcMake, 'utf8');
      // Ensure LIBDIRS and INCLUDES have libtonc and libgba paths
      content = content.replace(
        /LIBDIRS\s*:=\s*\$\(LIBGBA\)/g,
        'LIBDIRS := $(LIBGBA) $(DEVKITPRO)/libtonc $(DEVKITPRO)/libgba'
      );
      content = content.replace(
        /INCLUDES\s*:=\s*include/g,
        'INCLUDES := include $(DEVKITPRO)/libtonc/include $(DEVKITPRO)/libgba/include'
      );
      fs.writeFileSync(dstMake, content, 'utf8');
    }
  } catch (e) {
    console.warn('Could not copy Makefile into path build', e);
  }

    // For each .gbasres in projectFolder and subdirs, emit a C file embedding the JSON
    const walkProject = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walkProject(p);
        else if (e.isFile() && p.endsWith('.gbasres')) {
          try {
            const content = fs.readFileSync(p, 'utf8');
            const base = path.basename(p, '.gbasres').toLowerCase().replace(/ /g, '_');
            const cName = `${base}.c`;
            const jsonBytes = Buffer.from(content, 'utf8');
            const arrayLiteral = Array.from(jsonBytes).map((b) => b.toString()).join(', ');
            const cContent = `#include <stdint.h>\nconst unsigned char ${base}_json[] = { ${arrayLiteral} };\nconst unsigned int ${base}_json_len = sizeof(${base}_json);\n`;

            // Write into project build folder
            // fs.writeFileSync(path.join(projectBuild, cName), cContent, 'utf8');

            // Write into path build/source so Makefile can pick up sources
            try {
              const sourceDir = path.join(tempBuild, 'source');
              if (!fs.existsSync(sourceDir)) fs.mkdirSync(sourceDir, { recursive: true });
              fs.writeFileSync(path.join(sourceDir, cName), cContent, 'utf8');
            } catch (e) {
              console.warn('Could not write to path build/source', path.join(tempBuild, cName), e);
            }
          } catch (e) {
            console.warn('Failed to transcode resource', p, e);
          }
        }
      }
    };

    if (fs.existsSync(projectFolder)) walkProject(projectFolder);

    // Copy assets (images) into project build and into path build/assets for compile
    const destAssets = path.join(tempBuild, 'assets');
    if (fs.existsSync(assetsFolder)) {
      fs.mkdirSync(destAssets, { recursive: true });
      const assetFiles = fs.readdirSync(assetsFolder);
      for (const a of assetFiles) {
        const src = path.join(assetsFolder, a);
        const dst = path.join(destAssets, a);
        // const projectDst = path.join(projectBuild, 'assets', a);
        try {
          fs.copyFileSync(src, dst);
          // also copy into project build assets
          // fs.mkdirSync(path.dirname(projectDst), { recursive: true });
          // fs.copyFileSync(src, projectDst);
        } catch (e) { console.warn('Copy asset failed', src, e); }
      }
    }

    // Generate a minimal main.c that can be compiled by libgba/tonc based Makefile
    //#include <tonc.h>
    const mainC = `#include <gba_systemcalls.h>

// Minimal auto-generated main for project: ${projectName}
int main(void) {
    // Simple demo: infinite loop
    while (1) {
        VBlankIntrWait();
    }
    return 0;
}
`;

  // Write main.c into project build and into path build for compile
  try {
    // Ensure source directory exists
    const sourceDir = path.join(tempBuild, 'source');
    if (!fs.existsSync(sourceDir)) fs.mkdirSync(sourceDir, { recursive: true });

    // Ensure include directory exists for header files
    const includeDir = path.join(tempBuild, 'include');
    if (!fs.existsSync(includeDir)) fs.mkdirSync(includeDir, { recursive: true });

    // Write main.c to source directory
    fs.writeFileSync(path.join(sourceDir, 'main.c'), mainC, 'utf8');

    // Log debug info about paths
    console.log('..: Temp build structure:');
    console.log('  - Source dir:', sourceDir);
    console.log('  - Include dir:', includeDir);
    console.log('  - Main.c path:', path.join(sourceDir, 'main.c'));
  } catch (e) { 
    console.error('Could not create path build structure', e);
    throw e;
  }

  console.log('..: transcodeProject finished. project build and path build populated.');
  return { success: true, message: 'Transcode complete', tempBuild };
  } catch (err) {
    console.error('..: transcodeProject error', err);
  return { success: false, message: String(err) };
  }
}

export default transcodeProject;
