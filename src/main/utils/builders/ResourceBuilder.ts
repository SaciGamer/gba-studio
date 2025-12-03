/**
 * Resource Builder - converts project resources (.gbasres) into C/C++ headers
 * Extracts primitive variables from JSON into `#define` or const declarations
 * and embeds complex objects as JSON string literals when necessary.
 */

import fs from 'fs';
import path from 'path';
import { ResourceFile } from '../types/BuildTypes';

export class ResourceBuilder {
  private srcDir: string;
  private includeDir: string;
  private templateDir: string;

  constructor(buildDir: string, templateDir: string) {
    this.srcDir = path.join(buildDir, 'src');
    this.includeDir = path.join(buildDir, 'include');
    this.templateDir = templateDir;
  }

  /**
   * Process all .gbasres files in a directory and generate header files
   */
  public async processResourceFiles(resourceDir: string): Promise<ResourceFile[]> {
    const resourceFiles: ResourceFile[] = [];

    const walk = async (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.gbasres')) {
          try {
            const resourceFile = await this.processResource(fullPath);
            resourceFiles.push(resourceFile);
          } catch (err) {
            console.warn('..: Failed to process resource:', fullPath, err);
          }
        }
      }
    };

    await walk(resourceDir);
    return resourceFiles;
  }

  /**
   * Process a single .gbasres file and generate corresponding C source
   */
  private async processResource(resourcePath: string): Promise<ResourceFile> {
    const fileContent = fs.readFileSync(resourcePath, 'utf8');
    const baseFileName = path.basename(resourcePath, '.gbasres').toLowerCase().replace(/ /g, '_');
    const headerFileName = `${baseFileName}_res.h`;

    // Parse JSON to extract variables
    let jsonObj: any = null;
    try {
      jsonObj = JSON.parse(fileContent);
    } catch (e) {
      // Fallback: embed as JSON string if parse fails
      jsonObj = null;
    }

    const headerContent = this.generateHeaderFromJson(baseFileName, jsonObj, fileContent);

    // Write header to source directory
    const outputPath = path.join(this.includeDir, headerFileName);
    fs.writeFileSync(outputPath, headerContent, 'utf8');

    console.log('..: Generated resource header:', headerFileName);

    return {
      filename: headerFileName,
      resourceType: 'gbasres',
      content: Buffer.from(headerContent, 'utf8'),
    };
  }

  /**
   * Generate a header file from parsed JSON or raw JSON string
   */
  private generateHeaderFromJson(baseName: string, jsonObj: any, rawJson: string): string {
    const guardName = `${baseName.toUpperCase()}_RES_H`;
    let header = `#ifndef ${guardName}\n#define ${guardName}\n\n`;
    header += `/* Auto-generated resource header for: ${baseName} */\n\n`;

    if (jsonObj && typeof jsonObj === 'object') {
      // Emit primitive keys as defines or constants
      for (const key of Object.keys(jsonObj)) {
        const val = jsonObj[key];
        const cleanKey = `${baseName}_${key}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        if (typeof val === 'string') {
          const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          header += `static const char ${cleanKey}[] = \"${escaped}\";\n`;
        } else if (typeof val === 'number') {
          header += `static const int ${cleanKey} = ${val};\n`;
        } else if (typeof val === 'boolean') {
          header += `static const int ${cleanKey} = ${val ? 1 : 0};\n`;
        } else {
          // For arrays/objects, embed JSON string literal
          const encoded = JSON.stringify(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          header += `static const char ${cleanKey}_JSON[] = \"${encoded}\";\n`;
        }
      }
    } else {
      // Could not parse JSON: embed raw JSON string so consumers can parse at runtime
      const escaped = rawJson.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      header += `static const char ${baseName}_JSON[] = \"${escaped}\";\n`;
    }

    header += `\n#endif // ${guardName}\n`;
    return header;
  }

  /**
   * Generate a header file for resource declarations
   */
  public async generateResourceHeader(resourceFiles: ResourceFile[]): Promise<string> {
    const guardName = 'GENERATED_RESOURCES_H';
    let header = `#ifndef ${guardName}\n#define ${guardName}\n\n`;
    header += `/* Master include for generated resource headers */\n\n`;

    for (const file of resourceFiles) {
      const includeName = file.filename; // e.g. base_res.h
      header += `#include \"${includeName}\"\n`;
    }

    header += `\n#endif // ${guardName}\n`;
    return header;
  }

  /**
   * Generate a header file for graphics build/bn_regular_bg_items_*
   */
  public async generateGraphicsHeader(buildDir: string): Promise<string> {
    const guardName = 'GENERATED_GRAPHICS_H';
    let header = `#ifndef ${guardName}\n#define ${guardName}\n\n`;
    header += `/* Master include for generated graphics headers */\n\n`;

    const entries = fs.readdirSync(buildDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.startsWith('bn_regular_bg_items_') && entry.name.endsWith('.h')) {
        header += `#include "${entry.name}"\n`;
      }
      if (entry.isFile() && entry.name.startsWith('bn_sprite_items_') && entry.name.endsWith('.h')) {
        header += `#include "${entry.name}"\n`;
      }
    }

    header += `\n#endif // ${guardName}\n`;
    return header;
  }


  /**
   * Write resource header file
   */
  public async writeResourceHeader(resourceFiles: ResourceFile[]): Promise<void> {
    const headerContent = await this.generateResourceHeader(resourceFiles);
    const headerPath = path.join(this.includeDir, 'resources.h');
    fs.writeFileSync(headerPath, headerContent, 'utf8');
    console.log('..: Generated resources header:', headerPath);
  }

   /**
   * Write graphics header file
   */
  public async writeGraphicsHeader(buildDir: string) {
    const headerContent = await this.generateGraphicsHeader(buildDir);
    const headerPath = path.join(this.includeDir, 'graphics_items.h');
    fs.writeFileSync(headerPath, headerContent, 'utf8');
    console.log('..: Generated graphics items header:', headerPath);
  }

  /**
   * Generate resource registry C++ class
   */
  public async generateResourceRegistryClass(resourceFiles: ResourceFile[]): Promise<void> {
    const tplPath = path.join(this.templateDir, 'src', 'resource_registry.cpp');

    let registry_template = fs.readFileSync(tplPath, 'utf8');
    let objects = "";


    // for (const file of resourceFiles) {
    //   const baseName = file.filename.replace('_res.h', '');

    //   if (baseName === "settings") {
    //     objects  += `    { "${baseName}", SETTINGS_STARTSCENEID, ResourceType::Settings, 0, nullptr, SETTINGS_STARTX, SETTINGS_STARTY, SETTINGS_STARTMOVESPEED, SETTINGS_STARTANIMSPEED, SETTINGS_STARTDIRECTION },\n`;
    //   } else if (baseName === "castle_novo") {
    //     objects  += `    { "${baseName}", CASTLE_NOVO_ID, ResourceType::Background, CASTLE_NOVO_AUTOCOLOR, CASTLE_NOVO_FILENAME, 0,0,0,0,nullptr },\n`;
    //   } else {
    //     // fallback genérico
    //     objects  += `    { "${baseName}", nullptr, ResourceType::Unknown, 0, nullptr, 0,0,0,0,nullptr },\n`;
    //   }
    // }

    for (const file of resourceFiles) {
      objects += parseResourceFile(file) + "\n";
    }


    // registry_template = registry_template.replace("{{PROJECT_NAME}}", projectName);
    // registry_template = registry_template.replace("{{AUTHOR}}", author);
    // registry_template = registry_template.replace("{{VERSION}}", version);
    registry_template = registry_template.replace("{{OBJECT_CONSTANTS}}", objects);

    const registryPath = path.join(this.srcDir, 'resource_registry.cpp');
    fs.writeFileSync(registryPath, registry_template, 'utf8');
    console.log('..: Tempalte resource registry completed:', registryPath);
  }
}

// Função auxiliar para analisar o conteúdo do arquivo de recurso e gerar a linha apropriada
function parseResourceFile(file: ResourceFile): string {
  const baseName = file.filename.replace('_res.h', '');
  const upper = baseName.toUpperCase();
  const content = file.content.toString('utf8');

  // Detecta tipo de recurso no header
  let type = "Unknown";
  const key = '__RESOURCETYPE';
  const idx = content.indexOf(key);
  if (idx !== -1) {
    const after = content.slice(idx, idx + 256);
    const quoteMatch = after.match(/=\s*(?:\\")?"([^"\\]*)"/);
    if (quoteMatch) {
      type = quoteMatch[1];
    } else {
      const fallback = after.match(/=\s*"([^"]+)"/);
      if (fallback) type = fallback[1];
    }
  }

  // Helper: verifica existência de símbolo (escapa metacaracteres para regex)
  const escapeForRegExp = (s: string) => s.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const hasSymbol = (sym: string) => new RegExp(`\\b${escapeForRegExp(sym)}\\b`).test(content);

  if (type === "settings") {
    const required = [
      `${upper}_STARTSCENEID`,
      `${upper}_STARTX`,
      `${upper}_STARTY`,
      `${upper}_STARTMOVESPEED`,
      `${upper}_STARTANIMSPEED`,
      `${upper}_STARTDIRECTION`,
    ];
    if (required.every(hasSymbol)) {
      // Format: { name, id, type, auto_color, filename, start_x, start_y, move_speed, anim_speed, direction, background_id }
      return `    { "${baseName}", ${upper}_STARTSCENEID, ResourceType::Settings, 0, nullptr, ${upper}_STARTX, ${upper}_STARTY, ${upper}_STARTMOVESPEED, ${upper}_STARTANIMSPEED, ${upper}_STARTDIRECTION, nullptr },`;
    }
  } else if (type === "background") {
    const required = [
      `${upper}_ID`,
      `${upper}_AUTOCOLOR`,
      `${upper}_FILENAME`,
    ];
    if (required.every(hasSymbol)) {
      // Format: { name, id, type, auto_color, filename, start_x, start_y, move_speed, anim_speed, direction, background_id }
      return `    { "${baseName}", ${upper}_ID, ResourceType::Background, ${upper}_AUTOCOLOR, ${upper}_FILENAME, 0, 0, 0, 0, nullptr, nullptr },`;
    }
  } else if (type === "scene") {
    const required = [
      `${upper}_ID`,
      `${upper}_BACKGROUNDID`
    ];
    if (required.every(hasSymbol)) {
      // Format: { name, id, type, auto_color, filename, start_x, start_y, move_speed, anim_speed, direction, background_id }
      return `    { "${baseName}", ${upper}_ID, ResourceType::Scene, 0, nullptr, 0, 0, 0, 0, nullptr, ${upper}_BACKGROUNDID },`;
    } else {
      return `    { "${baseName}", ${upper}_ID, ResourceType::Scene, 0, nullptr, 0, 0, 0, 0, nullptr, nullptr },`;
    }
  }

  // Fallback genérico
  return `    { "${baseName}", nullptr, ResourceType::Unknown, 0, nullptr, 0, 0, 0, 0, nullptr, nullptr },`;
}

export default ResourceBuilder;
