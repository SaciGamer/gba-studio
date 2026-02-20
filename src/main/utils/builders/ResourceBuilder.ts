/**
 * Resource Builder - converts project resources (.gbasres) into C/C++ headers
 * Extracts primitive variables from JSON into `#define` or const declarations
 * and embeds complex objects as JSON string literals when necessary.
 */

import fs from 'fs';
import path from 'path';
import { GameConfig, JsonResourceDefault, ResourceFile } from '../types/BuildTypes';
import { json } from 'stream/consumers';

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

            if (resourceFile.resourceType === 'deleted') {
              console.log('..: Skipping deleted or empty resource:', fullPath);
              continue;
            }

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
    // const baseFilename = path.basename(resourcePath, '.gbasres').toLowerCase().replace(/ /g, '_');
    let headerFilename;
    let newFilename;
    const extension = '_res.h';

    // Parse JSON to extract variables
    let jsonObj: JsonResourceDefault | null = null;
    try {
      jsonObj = JSON.parse(fileContent);
    } catch (e) {
      // Fallback: embed as JSON string if parse fails
      jsonObj = null;
    }

    if (!jsonObj || jsonObj?._deleted) {
      return {
        resourceName: '',
        resourceType: 'deleted',
        headerContent: Buffer.from('', 'utf8'),
      };
    } else {
      const idPart = jsonObj?.id ? `_${jsonObj.id}` : "";
      headerFilename = `${jsonObj._resourceType}${idPart}`.replaceAll('-', '_');
      newFilename = `${headerFilename}${extension}`;

      if (jsonObj?.name !== undefined) {
        jsonObj.name = jsonObj?.name?.toLowerCase().replace(/ /g, '_');
      }

      if(jsonObj?.filename !== undefined) {
        jsonObj.filename = jsonObj?.filename?.toLowerCase().replace(/ /g, '_');
      }
    }

    const headerContent = this.generateHeaderFromJson(headerFilename, jsonObj, fileContent);

    // Write header to source directory
    const outputPath = path.join(this.includeDir, newFilename);
    fs.writeFileSync(outputPath, headerContent, 'utf8');

    console.log('..: Generated resource header:', newFilename);

    return {
      resourceName: newFilename,
      resourceType: 'gbasres',
      headerContent: Buffer.from(headerContent, 'utf8'),
      jsonContent: jsonObj,
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
        } else if (Array.isArray(val) && val.every(row => Array.isArray(row) && row.every(v => typeof v === 'number'))) {
          // É um array 2D de números -> gera como int[][]
          const rowCount = val.length;
          const colCount = val[0].length;
          const rows = val.map(row => `{ ${row.join(', ')} }`).join(',\n    ');

          header += `#define ${cleanKey}_ROWS ${rowCount}\n`;
          header += `#define ${cleanKey}_COLS ${colCount}\n`;
          header += `static const int ${cleanKey}[${cleanKey}_ROWS][${cleanKey}_COLS] = {\n    ${rows}\n};\n`;
        } else if (Array.isArray(val) && val.every(v => typeof v === 'number')) {
          // Array 1D de números -> gera como int[]
          const values = val.join(', ');
          header += `static const int ${cleanKey}[] = { ${values} };\n`;
          header += `static const int ${cleanKey}_SIZE = sizeof(${cleanKey}) / sizeof(int);\n`;
        } else {
          // For arrays/objects, embed JSON string literal
          const encoded = JSON.stringify(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          header += `static const char ${cleanKey}_JSON[] = \"${encoded}\";\n`;
        }
      }
    } else {
      // Could not parse JSON: embed raw JSON string so consumers can parse at runtime
      const escaped = rawJson.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      header += `static const char ${baseName}_NO_PARSER[] = \"${escaped}\";\n`;
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
      const includeName = file.resourceName; // e.g. base_res.h
      header += `#include \"${includeName}\"\n`;
    }

    header += `\n#endif // ${guardName}\n`;
    return header;
  }

  /**
   * Generate a header file for graphics build/bn_regular_bg_items_*
   */
  public async generateGraphicsHeader(buildDir: string): Promise<{headerFileContent: string, headersIncluded: string[]}> {
    let graphicHeaderGeneratedByButano = [];

    const guardName = 'GENERATED_GRAPHICS_H';
    let headerFileContent = `#ifndef ${guardName}\n#define ${guardName}\n\n`;
    headerFileContent += `/* Master include for generated graphics headers */\n\n`;

    const entries = fs.readdirSync(buildDir, { withFileTypes: true });

    const prefixes = [
      "bn_regular_bg_items_",
      "bn_sprite_items_",
      "bn_palette_bitmap_items_",
      "bn_direct_bitmap_items_"
    ];
    
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".h")) continue;

      if (prefixes.some(prefix => entry.name.startsWith(prefix))) {
        headerFileContent += `#include "${entry.name}"\n`;
        graphicHeaderGeneratedByButano.push(entry.name);
      }
    }

    headerFileContent += `\n#endif // ${guardName}\n`;
    return {
      headerFileContent,
      headersIncluded: graphicHeaderGeneratedByButano
    };
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
  public async writeGraphicsHeader(buildDir: string): Promise<string[]> {
    const {headerFileContent, headersIncluded} = await this.generateGraphicsHeader(buildDir);
    const headerPath = path.join(this.includeDir, 'graphics_items.h');
    fs.writeFileSync(headerPath, headerFileContent, 'utf8');
    console.log('..: Generated graphics items header:', headerPath);
    return headersIncluded;
  }

  /**
   * Generate resource registry C++ class
   */
  public async generateResourceRegistryClass(resourceFiles: ResourceFile[], config: GameConfig ): Promise<void> {
    const tplPath = path.join(this.templateDir, 'src', 'resource_registry.cpp');

    if (fs.existsSync(tplPath)) {
      let registry_template = fs.readFileSync(tplPath, 'utf8');
      // let objects = "";
      let backgrounds = "";
      let backgroundsLayers = "";
      let scenes = "";
      let settings = "";

      for (const file of resourceFiles) {
        switch(file.jsonContent?._resourceType) {
          case "background":
            backgrounds += parseResourceFile(file) + "\n";
            break;
          case "scene":
            scenes += parseResourceFile(file) + "\n";

            if (file.jsonContent?.backgrounds) {
              let sceneBackgroundsLayerTemplate = `static const SceneLayer {{SCENE_NAME}}_LAYERS[] = {{{BACKGROUNDS_LAYERS_CONTENT}}};\n\n`;
              sceneBackgroundsLayerTemplate = sceneBackgroundsLayerTemplate.replace("{{SCENE_NAME}}", file.resourceName.replace('_res.h', '').toUpperCase());

              file.jsonContent?.backgrounds.forEach((bg: any) => {
                sceneBackgroundsLayerTemplate = sceneBackgroundsLayerTemplate.replace("{{BACKGROUNDS_LAYERS_CONTENT}}", `\n    { ${bg.layerId}, "${bg.backgroundId}", ${bg.name ? `${bg.name.toUpperCase()}_NAME` : 'nullptr'}, ${bg.path ? `${bg.path.toUpperCase()}_FILENAME` : 'nullptr'} },{{BACKGROUNDS_LAYERS_CONTENT}}`);
              });
              
              backgroundsLayers += sceneBackgroundsLayerTemplate;
           }
            break;
          case "settings":
            settings += parseResourceFile(file) + "\n";
            break;
        }

        // objects += parseResourceFile(file) + "\n";
      }

      if (backgroundsLayers) {
        backgroundsLayers = backgroundsLayers.replaceAll("{{BACKGROUNDS_LAYERS_CONTENT}}", '\n');
      }

      registry_template = registry_template.replace("{{PROJECT_NAME}}", config.projectName);
      registry_template = registry_template.replace("{{AUTHOR}}", config.authorName || '');
      registry_template = registry_template.replace("{{VERSION}}", config.version || '1.0.0');
      // registry_template = registry_template.replace("{{OBJECT_CONSTANTS}}", objects);
      registry_template = registry_template.replace("{{BACKGROUNDS_LAYERS_CONSTANTS}}", backgroundsLayers);
      registry_template = registry_template.replace("{{BACKGROUNDS_CONSTANTS}}", backgrounds);
      registry_template = registry_template.replace("{{SCENES_CONSTANTS}}", scenes);
      registry_template = registry_template.replace("{{SETTINGS_CONSTANTS}}", settings);

      const registryPath = path.join(this.srcDir, 'resource_registry.cpp');
      fs.writeFileSync(registryPath, registry_template, 'utf8');
      console.log('..: Tempalte resource registry completed:', registryPath);
    }
  }
}

// Função auxiliar para analisar o conteúdo do arquivo de recurso e gerar a linha apropriada
function parseResourceFile(file: ResourceFile): string {
  const baseName = file.resourceName.replace('_res.h', '');
  const baseNameUpper = baseName.toUpperCase();
  const headerContent = file.headerContent.toString('utf8');

  // Detecta tipo de recurso no jsonContent se disponível
  let type = "unknown";
  let name;
  if(file.jsonContent?._resourceType) {
    type = file.jsonContent._resourceType;
    name = type;
  }

  if(file.jsonContent?.name !== undefined) {
    name = file.jsonContent.name;
  }

  // Helper: verifica existência de símbolo (escapa metacaracteres para regex)
  const escapeForRegExp = (s: string) => s.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const hasSymbol = (sym: string) => new RegExp(`\\b${escapeForRegExp(sym)}\\b`).test(headerContent);

  if (type === "settings") {
    const required = [
      `${baseNameUpper}_STARTSCENEID`,
      `${baseNameUpper}_STARTX`,
      `${baseNameUpper}_STARTY`,
      `${baseNameUpper}_STARTMOVESPEED`,
      `${baseNameUpper}_STARTANIMSPEED`,
      `${baseNameUpper}_STARTDIRECTION`,
      `${baseNameUpper}_COLORMODE`,
    ];
    if (required.every(hasSymbol)) {
      // Format: { name, start_scene_id, start_x, start_y, move_speed, anim_speed, direction }
      return ` { ResourceType::${type}, ${baseNameUpper}_STARTSCENEID, ${baseNameUpper}_STARTX, ${baseNameUpper}_STARTY, ${baseNameUpper}_STARTMOVESPEED, ${baseNameUpper}_STARTANIMSPEED, ${baseNameUpper}_STARTDIRECTION, ${baseNameUpper}_COLORMODE }`;
    }
  } else if (type === "background") {
    const required = [
      `${baseNameUpper}_ID`,
      `${baseNameUpper}_AUTOCOLOR`,
      `${baseNameUpper}_FILENAME`,
    ];
    if (required.every(hasSymbol)) {
      // Format: { name, id, autocolor, name_const, filename, image_width, image_height, tile_colors }
      return `    { ResourceType::${type}, ${baseNameUpper}_ID, ${baseNameUpper}_AUTOCOLOR, ${baseNameUpper}_NAME, ${baseNameUpper}_FILENAME, ${baseNameUpper}_IMAGEWIDTH, ${baseNameUpper}_IMAGEHEIGHT, ${baseNameUpper}_TILECOLORS },`;
    }
  } else if (type === "scene") {
    const required = [
      `${baseNameUpper}_ID`,
      `${baseNameUpper}_BACKGROUNDS_JSON`,
    ];
    if (required.every(hasSymbol)) {
      // Format: { name, id, name_const, background_id, selected_tileset_id, width, height, scene_type, image_type }
      const tilemap = file.jsonContent?.tileMap ? `${baseNameUpper}_TILEMAP_ROWS, ${baseNameUpper}_TILEMAP_COLS, &${baseNameUpper}_TILEMAP[0][0]` : '0, 0, nullptr';
      const tileSetId = file.jsonContent?.selectedTilesetId !== undefined ? `${baseNameUpper}_SELECTEDTILESETID` : '0';
      const imageType = file.jsonContent?.imageType !== undefined ? `${baseNameUpper}_IMAGETYPE` : '0';
      const backgroundLayerCount = file.jsonContent?.backgrounds ? file.jsonContent.backgrounds.length : 0;

      return `    { ResourceType::${type}, ${baseNameUpper}_ID, ${baseNameUpper}_NAME, ${baseNameUpper}_LAYERS, ${backgroundLayerCount}, ${tileSetId}, ${baseNameUpper}_WIDTH, ${baseNameUpper}_HEIGHT, ${baseNameUpper}_SCENETYPE, ${imageType}, ${tilemap} },`;
    } else {
      const backgroundLayerCount = file.jsonContent?.backgrounds ? file.jsonContent.backgrounds.length : 0;

      return `    { ResourceType::${type}, ${baseNameUpper}_ID, "${name}", nullptr, ${backgroundLayerCount}, nullptr, 0, 0, ${baseNameUpper}_SCENETYPE, nullptr, 0, 0, 0 },`;
    }
  }

  // Fallback genérico
  return ``;
}

export default ResourceBuilder;
