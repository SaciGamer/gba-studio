/**
 * Resource Builder - converts project resources (.gbasres) into C/C++ headers
 * Extracts primitive variables from JSON into `#define` or const declarations
 * and embeds complex objects as JSON string literals when necessary.
 */

import fs from 'fs';
import path from 'path';
import { GameConfig, JsonResourceDefault, ResourceFile } from '../types/BuildTypes';
import { json } from 'stream/consumers';
import { hasEventCompiler } from '../events/EventCompilerRegistry';
import { compileScriptGraphWithSourceMap } from '../events/ScriptGraphCompiler';

// Mirrors the catalog schema until the main workspace adopts src/shared as a
// configured project reference. Keeping this table local avoids violating the
// main tsconfig rootDir while preserving identical validation semantics.
const EVENT_VALIDATION_SCHEMA: Record<string, Record<string, { type: string; required?: boolean; min?: number; max?: number; options?: string[] }>> = {
  EVENT_WAIT: { units: { type: 'enum', required: true }, frames: { type: 'integer', min: 0 }, time: { type: 'integer', min: 0 } },
  EVENT_FADE_IN: { speed: { type: 'integer', required: true, min: 1, max: 6 } },
  EVENT_FADE_OUT: { speed: { type: 'integer', required: true, min: 1, max: 6 } },
  EVENT_FADE_OPTIONS: { color: { type: 'enum', required: true } },
  EVENT_CHANGE_SCENE: { sceneId: { type: 'string', required: true }, x: { type: 'integer', min: 0 }, y: { type: 'integer', min: 0 }, fadeSpeed: { type: 'integer', min: 1, max: 6 } },
  EVENT_PAN_CAMERA: { x: { type: 'integer', required: true }, y: { type: 'integer', required: true } },
  EVENT_MOVE_ACTOR: { actorId: { type: 'string', required: true }, x: { type: 'integer', required: true }, y: { type: 'integer', required: true } },
  EVENT_SPAWN_ACTOR: { actorId: { type: 'string', required: true }, x: { type: 'integer', required: true }, y: { type: 'integer', required: true } },
  EVENT_REMOVE_ACTOR: { actorId: { type: 'string', required: true } },
  EVENT_VISIBLE_ACTOR: { actorId: { type: 'string', required: true }, visible: { type: 'boolean', required: true } },
  EVENT_HIDE_ACTOR: { actorId: { type: 'string', required: true } },
  EVENT_SHOW_ACTOR: { actorId: { type: 'string', required: true } },
  EVENT_HIDE_ALL_SPRITES: {},
  EVENT_SHOW_ALL_SPRITES: {},
  EVENT_SET_ANIMATION_SPEED: { actorId: { type: 'string', required: true }, speed: { type: 'integer', required: true, min: 0, max: 60 } },
  EVENT_SET_ACTOR_PRIORITY: { actorId: { type: 'string', required: true }, priority: { type: 'integer', required: true, min: 0, max: 3 } },
  EVENT_PLAY_MUSIC: { musicId: { type: 'string', required: true }, volume: { type: 'integer', min: 0, max: 100 } },
  EVENT_PLAY_SOUND: { soundId: { type: 'string', required: true }, volume: { type: 'integer', min: 0, max: 100 } },
  EVENT_SET_MUSIC_VOLUME: { volume: { type: 'integer', required: true, min: 0, max: 100 } },
  EVENT_DISPLAY_DIALOGUE: { text: { type: 'string', required: true }, dialogueFont: { type: 'enum', options: ['fixed8x8', 'fixed8x16'] }, showFrame: { type: 'boolean' }, horizontalAlign: { type: 'enum', options: ['left', 'center', 'right'] }, verticalAlign: { type: 'enum', options: ['top', 'center', 'bottom'] }, animate: { type: 'boolean' }, animationSpeed: { type: 'enum', options: ['slow', 'medium', 'fast'] } },
  EVENT_DISPLAY_VARIABLE_TEXT: { variableId: { type: 'string', required: true }, x: { type: 'integer', required: true, min: 0 }, y: { type: 'integer', required: true, min: 0 }, font: { type: 'enum', options: ['variable8x8', 'variable8x16', 'variable16x16'] } },
  EVENT_DIALOGUE_CHOICE: { prompt: { type: 'string', required: true }, optionA: { type: 'string', required: true }, optionB: { type: 'string', required: true }, resultVariable: { type: 'string', required: true } },
  EVENT_CHANGE_LAYER: { layerId: { type: 'integer', required: true, min: 0, max: 3 }, backgroundId: { type: 'string' } },
  EVENT_VISIBLE_BACKGROUND: { layerId: { type: 'integer', required: true, min: 0, max: 3 }, visible: { type: 'boolean', required: true } },
  EVENT_CHANGE_PALETTE_BACKGROUND: { layerId: { type: 'integer', required: true, min: 0, max: 3 }, restorePaletteLayerDefault: { type: 'boolean' } },
  EVENT_VARIABLE: { variableId: { type: 'string', required: true } },
  EVENT_VARIABLE_RESET_ALL: {},
  EVENT_IF: { operator: { type: 'enum', required: true } },
  EVENT_WHILE: { operator: { type: 'enum', required: true } },
  EVENT_CALL_SCRIPT: { scriptId: { type: 'string', required: true } },
  EVENT_FOR: { variableId: { type: 'string', required: true }, start: { type: 'integer', required: true }, end: { type: 'integer', required: true }, step: { type: 'integer', required: true } },
  EVENT_BREAK: {},
  EVENT_CONTINUE: {},
  EVENT_WAIT_FOR_BUTTON: { button: { type: 'enum' }, buttons: { type: 'array' }, overrideButton: { type: 'boolean' } },
  EVENT_IF_BUTTON_HELD: { button: { type: 'enum', required: true }, buttons: { type: 'array' } },
};

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
            if (fullPath.endsWith('variables.gbasres')) {
              throw err;
            }
          }
        }
      }
    };

    await walk(resourceDir);
    return resourceFiles;
  }

  /**
   * Generates a resource header from an in-memory resource. Build-only derived
   * tile layers use this path so they never need to be written to project/.
   */
  public processResourceObject(resource: JsonResourceDefault): ResourceFile {
    const jsonObj = JSON.parse(JSON.stringify(resource)) as JsonResourceDefault;
    const extension = '_res.h';
    const idPart = jsonObj.id ? `_${jsonObj.id}` : '';
    const headerFilename = `${jsonObj._resourceType}${idPart}`.replaceAll('-', '_');
    const newFilename = `${headerFilename}${extension}`;

    if (jsonObj.name !== undefined) jsonObj.name = jsonObj.name.toLowerCase().replace(/ /g, '_').replaceAll('-', '_');
    if (jsonObj.filename !== undefined) jsonObj.filename = jsonObj.filename.toLowerCase().replace(/ /g, '_').replaceAll('-', '_');

    const fileContent = JSON.stringify(jsonObj);
    const headerContent = this.generateHeaderFromJson(headerFilename, jsonObj, fileContent);
    fs.writeFileSync(path.join(this.includeDir, newFilename), headerContent, 'utf8');
    console.log('..: Generated in-memory resource header:', newFilename);
    return { resourceName: newFilename, resourceType: 'gbasres', headerContent: Buffer.from(headerContent, 'utf8'), jsonContent: jsonObj };
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
      if (jsonObj._resourceType === 'variables') {
        this.validateVariablesResource(jsonObj, resourcePath);
      }
      const idPart = jsonObj?.id ? `_${jsonObj.id}` : "";
      headerFilename = `${jsonObj._resourceType}${idPart}`.replaceAll('-', '_');
      newFilename = `${headerFilename}${extension}`;

      if (jsonObj?.name !== undefined) {
        jsonObj.name = jsonObj?.name?.toLowerCase().replace(/ /g, '_').replaceAll('-', '_');
      }

      if(jsonObj?.filename !== undefined) {
        jsonObj.filename = jsonObj?.filename?.toLowerCase().replace(/ /g, '_').replaceAll('-', '_');
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

  private validateVariablesResource(resource: any, resourcePath: string): void {
    if (!Array.isArray(resource.variables)) {
      throw new Error(`Invalid variables resource ${resourcePath}: variables must be an array`);
    }

    const ids = new Set<string>();
    const symbols = new Set<string>();
    const supportedTypes = new Set(['number', 'boolean', 'string']);

    for (const variable of resource.variables) {
      if (!variable || typeof variable.id !== 'string' || !variable.id) {
        throw new Error(`Invalid variables resource ${resourcePath}: every variable needs an id`);
      }
      if (ids.has(variable.id)) {
        throw new Error(`Invalid variables resource ${resourcePath}: duplicate variable id ${variable.id}`);
      }
      ids.add(variable.id);

      if (typeof variable.symbol !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.symbol)) {
        throw new Error(`Invalid variables resource ${resourcePath}: invalid C++ symbol ${variable.symbol}`);
      }
      if (symbols.has(variable.symbol)) {
        throw new Error(`Invalid variables resource ${resourcePath}: duplicate variable symbol ${variable.symbol}`);
      }
      symbols.add(variable.symbol);

      if (!supportedTypes.has(variable.type)) {
        throw new Error(`Invalid variables resource ${resourcePath}: unsupported type ${variable.type}`);
      }
      if ((variable.type === 'number' && typeof variable.initialValue !== 'number') ||
          (variable.type === 'boolean' && typeof variable.initialValue !== 'boolean') ||
          (variable.type === 'string' && typeof variable.initialValue !== 'string')) {
        throw new Error(`Invalid variables resource ${resourcePath}: initial value type mismatch for ${variable.id}`);
      }
    }
  }

  /**
   * Recursive function to emit C++ code for nested arguments
   * @param name The name of the argument to emit
   * @param value The value of the argument to emit
   * @returns The generated C++ code for the argument
   */
  private emitArgs(name: string, value: any): string {
    // EVENT_CALL_SCRIPT currently uses this generic payload path during the
    // compatibility migration; it is still covered by the runtime registry.
    let code = "";

    if (typeof value === 'string') {
      const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      code += `static const char ${name}[] = \"${escaped}\";\n`;
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        code += `static const int ${name} = ${value};\n`;
      } else {
        code += `static const float ${name} = ${value}f;\n`;
      }
    } else if (typeof value === 'boolean') {
      code += `static const bool ${name} = ${value};\n`;
    } else if (Array.isArray(value)) {
      // array de objetos -> gera arrays separados por campo
      const childRefs: string[] = [];
      let index = 0;

      for (const f of Object.values(value)) {
        // const fieldValues = value.map(obj => obj[f]);
        code += this.emitArgs(`${name}_${index}`, f);
        const memoryRef = typeof f === 'number' || typeof f === 'boolean' ? '&' : '';
        childRefs.push(`${memoryRef}${name}_${index}`);
        index++;
      }

      // criar objeto genérico de ponteiros para os filhos
      code += `static const void* ${name}[] = {\n`;
      for (const ref of childRefs) {
        code += `    ${ref},\n`;
      }
      code += `};\n`;
    } else if (typeof value === "object" && value !== null) {
      const childRefs: string[] = [];
      for (const [k, v] of Object.entries(value)) {
        if (k.startsWith("__")) continue;

        const sufixName = k.toUpperCase();
        code += this.emitArgs(`${name}_${sufixName}`, v);
        const memoryRef = typeof v === 'number' || typeof v === 'boolean' ? '&' : '';
        childRefs.push(`${memoryRef}${name}_${sufixName}`);
      }

      if (childRefs.length > 0) {
        code += `static const void* ${name}[] = {\n`;
        for (const ref of childRefs) {
          code += `    ${ref},\n`;
        }
        code += `};\n`;
      }
    } else {
      code += `static const char* ${name} = nullptr;\n`; 
    }

    return code;
  }

  private emitVariableEventArgs(name: string, script: any): string {
    const args = script.args || {};
    const value = args.value;
    const command = script.command;
    const variableId = typeof args.variableId === 'string' ? args.variableId : '';

    if (!variableId || command === 'EVENT_VARIABLE_RESET_ALL') {
      return `static const void* ${name} = nullptr;\n`;
    }

    const type = value?.type;
    if (type !== 'number' && type !== 'boolean' && type !== 'string') {
      throw new Error(`Invalid variable event ${script.id}: unsupported value type`);
    }

    const sourceVariableId = value?.kind === 'variable' && typeof value.variableId === 'string'
      ? value.variableId
      : '';
    const numberValue = type === 'number' ? Number(value?.value ?? 0) : 0;
    const booleanValue = type === 'boolean' && Boolean(value?.value ?? false);
    const stringValue = type === 'string' && value?.kind !== 'variable' ? String(value?.value ?? '') : '';
    const escapedString = stringValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    return `static const VariableSetValueData ${name}_VALUE = { "${variableId}", VariableType::${type}, ${numberValue}, ${booleanValue}, "${escapedString}", ${sourceVariableId ? `"${sourceVariableId}"` : 'nullptr'} };\n` +
      `static const void* ${name} = &${name}_VALUE;\n`;
  }

  private getRuntimeArgs(args: any): any {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return args;
    return Object.fromEntries(Object.entries(args).filter(([key]) => !key.startsWith('__')));
  }

  /**
   * Wait has a fixed ABI in the Butano runtime. Seconds and frames are both
   * integer values, but the runtime handles seconds independently from frame
   * waits by converting them to video updates.
   */
  private emitWaitArgs(name: string, args: any): string {
    const rawTime = Number(args?.time ?? 0);
    const seconds = Number.isFinite(rawTime) ? Math.max(0, Math.trunc(rawTime)) : 0;
    const rawFrames = Number(args?.frames ?? 0);
    const frames = Number.isFinite(rawFrames) ? Math.max(0, Math.trunc(rawFrames)) : 0;
    const units = args?.units === 'frames' ? 'frames' : 'time';

    return `static const WaitEventData ${name} = { ${seconds}, ${frames}, "${units}" };\n`;
  }

  /**
   * Change Scene has a fixed runtime ABI. Position fields in the editor are
   * CustomField objects, so emit their numeric values rather than serializing
   * the editor metadata as a generic pointer array.
   */
  private emitChangeSceneArgs(name: string, args: any): string {
    const numberValue = (value: any): number => {
      const candidate = typeof value === 'object' && value !== null ? value.value : value;
      const parsed = Number(candidate ?? 0);
      return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
    };
    const sceneId = typeof args?.sceneId === 'string' ? args.sceneId : '';
    const direction = ['left', 'right', 'up', 'down'].includes(args?.direction) ? args.direction : 'right';
    const fadeSpeed = Math.max(1, Math.min(6, numberValue(args?.fadeSpeed ?? 2)));
    const escapedSceneId = sceneId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    return `static const SceneChangeEventData ${name} = { "${escapedSceneId}", ${numberValue(args?.x)}, ${numberValue(args?.y)}, "${direction}", ${fadeSpeed} };\n`;
  }

  private emitCameraArgs(name: string, args: any): string {
    const value = (field: any) => {
      const raw = typeof field === 'object' && field !== null ? field.value : field;
      const number = Number(raw ?? 0);
      return Number.isFinite(number) ? Math.trunc(number) : 0;
    };
    return `static const CameraEventData ${name} = { ${value(args?.x)}, ${value(args?.y)} };\n`;
  }

  private emitFadeArgs(name: string, args: any): string {
    const speedValue = Number(args?.speed ?? 2);
    const speed = Number.isFinite(speedValue) ? Math.max(1, Math.min(6, Math.trunc(speedValue))) : 2;
    return `static const FadeEventData ${name} = { ${speed} };\n`;
  }

  private emitActorMoveArgs(name: string, args: any): string {
    const actorId = JSON.stringify(String(args?.actorId ?? args?.actor_id ?? ''));
    const x = Number(args?.x ?? 0);
    const y = Number(args?.y ?? 0);
    return `static const ActorMoveEventData ${name} = { ${actorId}, ${Number.isFinite(x) ? x : 0}, ${Number.isFinite(y) ? y : 0} };\n`;
  }

  private emitActorArgs(name: string, command: string, args: any): string {
    const actorId = JSON.stringify(String(args?.actorId ?? args?.actor_id ?? ''));
    if (command === 'EVENT_SPAWN_ACTOR') return `static const ActorSpawnEventData ${name} = { ${actorId}, ${Number(args?.x ?? 0)}, ${Number(args?.y ?? 0)} };\n`;
    if (command === 'EVENT_REMOVE_ACTOR') return `static const ActorRemoveEventData ${name} = { ${actorId} };\n`;
    if (command === 'EVENT_SET_ANIMATION_SPEED') return `static const ActorAnimationSpeedEventData ${name} = { ${actorId}, ${Number(args?.speed ?? 0)} };\n`;
    if (command === 'EVENT_SET_ACTOR_PRIORITY') return `static const ActorPriorityEventData ${name} = { ${actorId}, ${Math.max(0, Math.min(3, Number(args?.priority ?? 2)))} };\n`;
    const visible = command === 'EVENT_SHOW_ACTOR' || (command !== 'EVENT_HIDE_ACTOR' && args?.visible !== false);
    return `static const ActorVisibilityEventData ${name} = { ${actorId}, ${visible ? 'true' : 'false'} };\n`;
  }

  private emitPlayMusicArgs(name: string, args: any): string {
    const musicId = JSON.stringify(String(args?.musicId ?? args?.music_id ?? ''));
    const volume = Number(args?.volume ?? 100);
    return `static const PlayMusicEventData ${name} = { ${musicId}, ${Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 100} };\n`;
  }

  private emitPlaySoundArgs(name: string, args: any): string {
    const soundId = JSON.stringify(String(args?.soundId ?? args?.sound_id ?? ''));
    const volume = Number(args?.volume);
    return `static const PlaySoundEventData ${name} = { ${soundId}, ${Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 100} };\n`;
  }

  private emitMusicVolumeArgs(name: string, args: any): string {
    const volume = Number(args?.volume ?? 100);
    return `static const MusicVolumeEventData ${name} = { ${Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 100} };\n`;
  }

  private emitDialogueArgs(name: string, args: any): string {
    const value = JSON.stringify(String(args?.text ?? args?.dialogue ?? ''));
    const horizontal = ['left', 'center', 'right'].includes(args?.horizontalAlign) ? args.horizontalAlign : 'center';
    const vertical = ['top', 'center', 'bottom'].includes(args?.verticalAlign) ? args.verticalAlign : 'bottom';
    const showFrame = args?.showFrame !== false ? 'true' : 'false';
    const animate = args?.animate !== false ? 'true' : 'false';
    const animationSpeed = ['slow', 'medium', 'fast'].includes(args?.animationSpeed) ? args.animationSpeed : 'medium';
    const dialogueFont = ['fixed8x8', 'fixed8x16'].includes(args?.dialogueFont) ? args.dialogueFont : 'fixed8x16';
    return `static const DialogueEventData ${name} = { ${value}, ${JSON.stringify(dialogueFont)}, ${showFrame}, ${JSON.stringify(horizontal)}, ${JSON.stringify(vertical)}, ${animate}, ${JSON.stringify(animationSpeed)} };\n`;
  }

  private emitVariableTextArgs(name: string, args: any): string {
    const variableId = JSON.stringify(String(args?.variableId ?? ''));
    const x = Math.max(0, Math.trunc(Number(args?.x ?? 0)));
    const y = Math.max(0, Math.trunc(Number(args?.y ?? 0)));
    const font = ['variable8x8', 'variable8x16', 'variable16x16'].includes(args?.font) ? args.font : 'variable8x16';
    return `static const VariableTextEventData ${name} = { ${variableId}, ${x}, ${y}, ${JSON.stringify(font)} };\n`;
  }

  private emitDialogueChoiceArgs(name: string, args: any): string {
    const value = (key: string) => JSON.stringify(String(args?.[key] ?? ''));
    return `static const DialogueChoiceEventData ${name} = { ${value('prompt')}, ${value('optionA')}, ${value('optionB')}, ${value('resultVariable')} };\n`;
  }

  /**
   * Background layer events have a stable runtime ABI.  Keeping this separate
   * from the generic object emitter is important because an absent background
   * otherwise becomes a pointer-to-pointer while a selected background is a
   * character array.  The C++ handler must receive the same two slots in both
   * cases (layer/background or layer/visibility).
   */
  private emitBackgroundLayerArgs(name: string, args: any, event: 'change' | 'visibility'): string {
    const rawLayer = Number(args?.layerId ?? 0);
    const layerId = Number.isFinite(rawLayer) ? Math.max(0, Math.min(3, Math.trunc(rawLayer))) : 0;
    const backgroundId = typeof args?.backgroundId === 'string' ? args.backgroundId : '';
    const escapedBackgroundId = backgroundId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    if(event === 'change') {
      return `static const LayerChangeEventData ${name} = { ${layerId}, "${escapedBackgroundId}" };\n`;
    }
    return `static const LayerVisibilityEventData ${name} = { ${layerId}, ${args?.visible !== false} };\n`;
  }

  private emitPaletteLayerArgs(name: string, args: any): string {
    const rawLayer = Number(args?.layerId ?? 0);
    const layerId = Number.isFinite(rawLayer) ? Math.max(0, Math.min(3, Math.trunc(rawLayer))) : 0;
    const restore = args?.restorePaletteLayerDefault === true;
    const paletteIds = Array.isArray(args?.paletteIds) ? args.paletteIds : [];
    const definitions = Array.from({ length: 16 }, (_, index) => {
      const value = typeof paletteIds[index] === 'string' ? paletteIds[index] : '';
      const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `static const char ${name}_PALETTE_${index}[] = "${escaped}";`;
    }).join('\n');
    const pointers = Array.from({ length: 16 }, (_, index) => `${name}_PALETTE_${index}`).join(', ');
    return `${definitions}\n` +
      `static const char* ${name}_PALETTE_IDS[16] = { ${pointers} };\n` +
      `static const PaletteLayerEventData ${name} = { ${layerId}, ${restore}, ${name}_PALETTE_IDS };\n`;
  }

  private emitFadeOptionsArgs(name: string, args: any): string {
    const color = args?.color === 'white' ? 'white' : 'black';
    return `static const char ${name}_COLOR[] = "${color}";\n` +
      `static const void* ${name}[] = { ${name}_COLOR };\n`;
  }

  private emitConditionValue(name: string, value: any): string {
    const type = value?.type === 'boolean' || value?.type === 'string' ? value.type : 'number';
    const isVariable = value?.kind === 'variable' && typeof value.variableId === 'string';
    const variableId = isVariable ? JSON.stringify(value.variableId) : 'nullptr';
    const numberValue = type === 'number' && !isVariable ? Number(value?.value ?? 0) : 0;
    const booleanValue = type === 'boolean' && !isVariable ? Boolean(value?.value ?? false) : false;
    const stringValue = type === 'string' && !isVariable ? JSON.stringify(String(value?.value ?? '')) : 'nullptr';
    const button = value?.kind === 'button' && typeof value.button === 'string' ? JSON.stringify(value.button) : 'nullptr';

    return `static const ScriptValueData ${name} = { VariableType::${type}, ${isVariable}, ${variableId}, ${numberValue}, ${booleanValue}, ${stringValue}, ${button} };\n`;
  }

  private emitScriptCondition(name: string, args: any): string {
    const leftName = `${name}_LEFT`;
    const rightName = `${name}_RIGHT`;
    const operator = ['==', '!=', '>', '>=', '<', '<='].includes(args?.operator) ? args.operator : '==';

    return this.emitConditionValue(leftName, args?.left) +
      this.emitConditionValue(rightName, args?.right) +
      `static const ScriptConditionData ${name}_VALUE = { ${leftName}, ${rightName}, ${JSON.stringify(operator)} };\n` +
      `static const void* ${name} = &${name}_VALUE;\n`;
  }

  private emitSceneScripts(baseName: string, scripts: any[]): string {
    type FlatScript = {
      script: any;
      argsName: string;
      nextIndex: number;
      falseIndex: number;
      loopIndex: number;
    };

    const flatScripts: FlatScript[] = [];
    type LoopContext = { breakTarget: number; continueTarget: number; loopIndex: number };
    const compileSequence = (events: any[], continuation: number, loopContext?: LoopContext): number => {
      let nextIndex = continuation;

      for (let eventIndex = events.length - 1; eventIndex >= 0; eventIndex--) {
        const script = events[eventIndex];
        if (script?.args?.__comment) continue;
        this.validateCatalogEvent(script);

        if (script.command === 'EVENT_IF' || script.command === 'EVENT_IF_BUTTON_HELD' || script.command === 'EVENT_WAIT_FOR_BUTTON') {
          const commandIndex = flatScripts.length;
          flatScripts.push({
            script,
            argsName: `${baseName}_ARGS_${commandIndex}`,
            nextIndex,
            falseIndex: -1,
            loopIndex: -1,
          });
          const thenStart = compileSequence(script.children?.then || [], nextIndex, loopContext);
          const falseStart = script.command === 'EVENT_WAIT_FOR_BUTTON'
            ? thenStart
            : script.command === 'EVENT_IF' || script.command === 'EVENT_IF_BUTTON_HELD'
            ? compileSequence(script.children?.else || [], nextIndex, loopContext)
            : -1;
          flatScripts[commandIndex].nextIndex = script.command === 'EVENT_WAIT_FOR_BUTTON' ? nextIndex : thenStart;
          flatScripts[commandIndex].falseIndex = falseStart;
          nextIndex = commandIndex;
        } else if (script.command === 'EVENT_WHILE' || script.command === 'EVENT_FOR') {
          const commandIndex = flatScripts.length;
          flatScripts.push({ script, argsName: `${baseName}_ARGS_${commandIndex}`, nextIndex: continuation, falseIndex: continuation, loopIndex: commandIndex });
          const bodyStart = compileSequence(script.children?.then || [], commandIndex, { breakTarget: continuation, continueTarget: commandIndex, loopIndex: commandIndex });
          flatScripts[commandIndex].nextIndex = bodyStart;
          nextIndex = commandIndex;
        } else if (script.command === 'EVENT_BREAK' || script.command === 'EVENT_CONTINUE') {
          const commandIndex = flatScripts.length;
          flatScripts.push({
            script,
            argsName: `${baseName}_ARGS_${commandIndex}`,
            nextIndex: loopContext ? (script.command === 'EVENT_BREAK' ? loopContext.breakTarget : loopContext.continueTarget) : continuation,
            falseIndex: -1,
            loopIndex: loopContext?.loopIndex ?? -1,
          });
          nextIndex = commandIndex;
        } else {
          const commandIndex = flatScripts.length;
          flatScripts.push({
            script,
            argsName: `${baseName}_ARGS_${commandIndex}`,
            nextIndex,
            falseIndex: -1,
            loopIndex: -1,
          });
          nextIndex = commandIndex;
        }
      }

      return nextIndex;
    };

    const compiledStartIndex = compileSequence(scripts, -1);
    const orderedScripts: FlatScript[] = [];
    const indexMap = new Map<number, number>();
    const visit = (index: number): void => {
      if (index < 0 || indexMap.has(index)) return;
      indexMap.set(index, orderedScripts.length);
      orderedScripts.push(flatScripts[index]);
      visit(flatScripts[index].nextIndex);
      visit(flatScripts[index].falseIndex);
    };
    visit(compiledStartIndex);

    for (const flatScript of orderedScripts) {
      const nextIndex = flatScript.nextIndex;
      const falseIndex = flatScript.falseIndex;
      flatScript.nextIndex = nextIndex < 0 ? -1 : indexMap.get(nextIndex)!;
      flatScript.falseIndex = falseIndex < 0 ? -1 : indexMap.get(falseIndex)!;
      flatScript.loopIndex = flatScript.loopIndex < 0 ? -1 : indexMap.get(flatScript.loopIndex) ?? -1;
    }

    let response = '';

    for (const flatScript of orderedScripts) {
      const args = flatScript.script.args;
      response += ['EVENT_IF', 'EVENT_WHILE'].includes(flatScript.script.command)
        ? this.emitScriptCondition(flatScript.argsName, args)
        : flatScript.script.command === 'EVENT_IF_BUTTON_HELD'
          ? this.emitButtonHeldArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : ['EVENT_FADE_IN', 'EVENT_FADE_OUT'].includes(flatScript.script.command)
          ? this.emitFadeArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_FADE_OPTIONS'
          ? this.emitFadeOptionsArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_WAIT'
          ? this.emitWaitArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_CHANGE_SCENE'
          ? this.emitChangeSceneArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_PAN_CAMERA'
          ? this.emitCameraArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_MOVE_ACTOR'
          ? this.emitActorMoveArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : ['EVENT_SPAWN_ACTOR', 'EVENT_REMOVE_ACTOR', 'EVENT_VISIBLE_ACTOR', 'EVENT_HIDE_ACTOR', 'EVENT_SHOW_ACTOR', 'EVENT_SET_ANIMATION_SPEED', 'EVENT_SET_ACTOR_PRIORITY'].includes(flatScript.script.command)
          ? this.emitActorArgs(flatScript.argsName, flatScript.script.command, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_PLAY_MUSIC'
          ? this.emitPlayMusicArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_PLAY_SOUND'
          ? this.emitPlaySoundArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_STOP_MUSIC'
          ? `static const void* ${flatScript.argsName} = nullptr;\n`
        : flatScript.script.command === 'EVENT_SET_MUSIC_VOLUME'
          ? this.emitMusicVolumeArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_DISPLAY_DIALOGUE'
          ? this.emitDialogueArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_DISPLAY_VARIABLE_TEXT'
          ? this.emitVariableTextArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_DIALOGUE_CHOICE'
          ? this.emitDialogueChoiceArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_FOR'
          ? `static const ForEventData ${flatScript.argsName} = { ${JSON.stringify(String(this.getRuntimeArgs(args)?.variableId ?? ''))}, ${Math.trunc(Number(this.getRuntimeArgs(args)?.start ?? 0))}, ${Math.trunc(Number(this.getRuntimeArgs(args)?.end ?? 0))}, ${Math.trunc(Number(this.getRuntimeArgs(args)?.step ?? 1)) || 1} };\n`
        : flatScript.script.command === 'EVENT_BREAK'
          ? `static const void* ${flatScript.argsName} = nullptr;\n`
        : flatScript.script.command === 'EVENT_WAIT_FOR_BUTTON'
          ? (() => {
              const selected = Array.isArray(this.getRuntimeArgs(args)?.buttons)
                ? this.getRuntimeArgs(args).buttons.filter((button: unknown): button is string => typeof button === 'string' && button.length > 0)
                : [];
              const buttons = selected.length > 0 ? selected : [String(this.getRuntimeArgs(args)?.button ?? 'A')];
              const values = buttons.map((button: string) => JSON.stringify(button)).join(', ');
              const overrideButton = this.getRuntimeArgs(args)?.overrideButton === true ? 'true' : 'false';
              return `static const char* const ${flatScript.argsName}_BUTTONS[] = { ${values} };\nstatic const ButtonWaitEventData ${flatScript.argsName} = { nullptr, ${flatScript.argsName}_BUTTONS, ${buttons.length}, ${overrideButton} };\n`;
            })()
        : flatScript.script.command === 'EVENT_HIDE_DIALOGUE'
          ? `static const void* ${flatScript.argsName} = nullptr;\n`
        : flatScript.script.command === 'EVENT_CHANGE_LAYER'
          ? this.emitBackgroundLayerArgs(flatScript.argsName, this.getRuntimeArgs(args), 'change')
        : flatScript.script.command === 'EVENT_VISIBLE_BACKGROUND'
          ? this.emitBackgroundLayerArgs(flatScript.argsName, this.getRuntimeArgs(args), 'visibility')
        : flatScript.script.command === 'EVENT_CHANGE_PALETTE_BACKGROUND'
          ? this.emitPaletteLayerArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : ['EVENT_VARIABLE', 'EVENT_VARIABLE_RESET_ALL'].includes(flatScript.script.command)
          ? this.emitVariableEventArgs(flatScript.argsName, flatScript.script)
          : this.emitArgs(flatScript.argsName, this.getRuntimeArgs(args));
    }

    // GCC rejects zero-sized arrays. A scene containing only commented
    // commands still needs a valid pointer because the scene registry is
    // generated from the original script list; its count remains zero.
    if (orderedScripts.length === 0) {
      return response +
        `static const ScriptCommandData ${baseName}_SCRIPTS[1] = {};\n` +
        `static const int ${baseName}_SCRIPTS_COUNT = 0;\n`;
    }

    response += `static const ScriptCommandData ${baseName}_SCRIPTS[] = {\n`;
    const typedPayloadCommands = new Set([
      'EVENT_WAIT', 'EVENT_FADE_IN', 'EVENT_FADE_OUT', 'EVENT_CHANGE_SCENE',
      'EVENT_PAN_CAMERA', 'EVENT_MOVE_ACTOR', 'EVENT_SPAWN_ACTOR',
      'EVENT_REMOVE_ACTOR', 'EVENT_VISIBLE_ACTOR', 'EVENT_HIDE_ACTOR', 'EVENT_SHOW_ACTOR', 'EVENT_SET_ANIMATION_SPEED', 'EVENT_SET_ACTOR_PRIORITY',
      'EVENT_PLAY_MUSIC', 'EVENT_SET_MUSIC_VOLUME', 'EVENT_DISPLAY_DIALOGUE', 'EVENT_DISPLAY_VARIABLE_TEXT',
      'EVENT_PLAY_SOUND',
      'EVENT_DIALOGUE_CHOICE',
      'EVENT_FOR', 'EVENT_WAIT_FOR_BUTTON',
      'EVENT_CHANGE_LAYER', 'EVENT_VISIBLE_BACKGROUND',
      'EVENT_CHANGE_PALETTE_BACKGROUND',
    ]);
    for (const flatScript of orderedScripts) {
      const falseIndex = ['EVENT_IF', 'EVENT_WHILE', 'EVENT_FOR', 'EVENT_IF_BUTTON_HELD', 'EVENT_WAIT_FOR_BUTTON'].includes(flatScript.script.command) ? flatScript.falseIndex : -1;
      const nextIndex = flatScript.nextIndex < 0 ? orderedScripts.length : flatScript.nextIndex;
      const safeFalseIndex = falseIndex < 0 ? orderedScripts.length : falseIndex;
      const schemaVersion = flatScript.script.version ?? 1;
      const argsReference = typedPayloadCommands.has(flatScript.script.command)
        ? `&${flatScript.argsName}`
        : flatScript.argsName;
      response += `    { ${JSON.stringify(flatScript.script.id)}, ${JSON.stringify(flatScript.script.command)}, ${argsReference}, 0, ${schemaVersion}, ${nextIndex}, ${safeFalseIndex}, ${flatScript.loopIndex} },\n`;
    }
    response += `};\nstatic const int ${baseName}_SCRIPTS_COUNT = ${orderedScripts.length};\n`;
    return response;
  }

  private emitButtonHeldArgs(name: string, args: any): string {
    const selected = Array.isArray(args?.buttons) ? args.buttons.filter((button: unknown): button is string => typeof button === 'string' && button.length > 0) : [];
    const buttons = selected.length > 0 ? selected : [String(args?.button ?? 'A')];
    const values = buttons.map((button: string) => JSON.stringify(button)).join(', ');
    return `static const char* const ${name}_BUTTONS[] = { ${values} };\nstatic const ButtonHeldEventData ${name}_VALUE = { ${name}_BUTTONS, ${buttons.length} };\nstatic const void* ${name} = &${name}_VALUE;\n`;
  }

  private validateCatalogEvent(script: any): void {
    const schemaDefinition = EVENT_VALIDATION_SCHEMA[script?.command];
    if (!schemaDefinition) return;
    if (!hasEventCompiler(script.command)) {
      throw new Error(`Event ${script.command} has a schema but no compiler registry entry`);
    }
    if (script.version !== undefined && script.version !== 1) {
      throw new Error(`Invalid ${script.command} ${script.id ?? '<unknown>'}: unsupported schema version ${script.version}`);
    }
    const args = script?.args && typeof script.args === 'object' ? script.args : {};
    for (const [field, schema] of Object.entries(schemaDefinition)) {
      const value = args[field];
      if (value === undefined || value === null) {
        if (schema.required) throw new Error(`Invalid ${script.command} ${script.id}: ${field} is required`);
        continue;
      }
      if (schema.type === 'integer' && (!Number.isInteger(typeof value === 'object' ? value.value : value))) {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} must be an integer`);
      }
      if (schema.type === 'boolean' && typeof value !== 'boolean') {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} must be boolean`);
      }
      if (schema.type === 'string' && typeof value !== 'string') {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} must be string`);
      }
      if (schema.type === 'string' && typeof value === 'string' && Buffer.byteLength(value, 'utf8') > 255) {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} exceeds 255 UTF-8 bytes`);
      }
      const numeric = typeof value === 'object' ? value.value : value;
      if (typeof numeric === 'number' && schema.min !== undefined && numeric < schema.min) {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} is below ${schema.min}`);
      }
      if (typeof numeric === 'number' && schema.max !== undefined && numeric > schema.max) {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} is above ${schema.max}`);
      }
    }
  }

  private generateScriptDefinitionsHeader(baseName: string, resource: any): string {
    const scripts = Array.isArray(resource.scripts) ? resource.scripts : [];
    const symbol = baseName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    let header = '';
    const definitions: Array<{ id: string; symbol: string }> = [];

    scripts.forEach((script: any, index: number) => {
      if (!script || typeof script.id !== 'string') return;
      const scriptSymbol = `${symbol}_SCRIPT_${index}`;
      const events = Array.isArray(script.script) ? script.script
        : Array.isArray(script.events) ? script.events : [];
      header += this.emitSceneScripts(scriptSymbol, events);
      definitions.push({ id: script.id, symbol: scriptSymbol });
    });

    if (definitions.length === 0) {
      return `${header}static const ScriptDefinition SCRIPT_DEFINITIONS[1] = {};\nstatic const int SCRIPT_DEFINITIONS_COUNT = 0;\n`;
    }

    header += `static const ScriptDefinition SCRIPT_DEFINITIONS[] = {\n`;
    header += definitions.map(definition =>
      `    { ${JSON.stringify(definition.id)}, ${definition.symbol}_SCRIPTS, ${definition.symbol}_SCRIPTS_COUNT }`
    ).join(',\n');
    header += `\n};\nstatic const int SCRIPT_DEFINITIONS_COUNT = ${definitions.length};\n`;
    return header;
  }

  private createStructureFromJson(baseName: string, key: string, val: any, resourceType: string): string {
    let response = "";

    switch(resourceType) {
      // case "background":
      //   response += "" + "\n";
      //   break;
      case "scene":
        // Backgrounds layers
        if (key === 'backgrounds' && val && Array.isArray(val)) {
          let sceneBackgroundsLayerTemplate = `static const SceneLayer {{SCENE_NAME}}_LAYERS[] = {{{BACKGROUNDS_LAYERS_CONTENT}}};\n`;
          sceneBackgroundsLayerTemplate = sceneBackgroundsLayerTemplate.replace("{{SCENE_NAME}}", baseName);

          val.forEach((bg: any) => {
            const paletteId = typeof bg.paletteId === 'string' && bg.paletteId ? JSON.stringify(bg.paletteId) : 'nullptr';
            const x = Number.isFinite(Number(bg.x)) ? Math.trunc(Number(bg.x)) : 0;
            const y = Number.isFinite(Number(bg.y)) ? Math.trunc(Number(bg.y)) : 0;
            sceneBackgroundsLayerTemplate = sceneBackgroundsLayerTemplate.replace("{{BACKGROUNDS_LAYERS_CONTENT}}", `\n    { ${bg.layerId}, "${bg.backgroundId ?? ''}", ${bg.name ? `${bg.name.toUpperCase()}_NAME` : 'nullptr'}, ${bg.path ? `${bg.path.toUpperCase()}_FILENAME` : 'nullptr'}, ${paletteId}, ${x}, ${y} },{{BACKGROUNDS_LAYERS_CONTENT}}`);
          });
          
          response += sceneBackgroundsLayerTemplate.replaceAll("{{BACKGROUNDS_LAYERS_CONTENT}}", '\n');
        }
        // Scripts
        if (key === 'script' && val && Array.isArray(val)) {
          const sceneBaseName = baseName.replace(/_SCRIPT$/, '');
          response += this.emitSceneScripts(sceneBaseName, val);
        }

        // Scene triggers keep their own entry/leave programs and runtime
        // policy, so they are emitted as typed records instead of generic JSON.
        if (key === 'triggers' && val && Array.isArray(val)) {
          const triggerBase = baseName.replace(/_TRIGGERS$/, '');
          const activation = (value: unknown) => {
            const allowed = ['enter', 'exit', 'stay', 'interact', 'touch', 'input', 'timer'];
            return allowed.includes(String(value)) ? `TriggerActivation::${String(value)}` : 'TriggerActivation::enter';
          };
          let declarations = '';
          const records = val.map((trigger: any, index: number) => {
            const enter = Array.isArray(trigger.onEnterScript) ? trigger.onEnterScript : [];
            const leave = Array.isArray(trigger.onLeaveScript) ? trigger.onLeaveScript : [];
            const enterSymbol = `${triggerBase}_TRIGGER_${index}_ENTER`;
            const leaveSymbol = `${triggerBase}_TRIGGER_${index}_LEAVE`;
            const enterCode = enter.length ? this.emitSceneScripts(enterSymbol, enter) : '';
            const leaveCode = leave.length ? this.emitSceneScripts(leaveSymbol, leave) : '';
            declarations += enterCode + leaveCode;
            const enterPtr = enter.length ? `${enterSymbol}_SCRIPTS` : 'nullptr';
            const leavePtr = leave.length ? `${leaveSymbol}_SCRIPTS` : 'nullptr';
            return `    { ${JSON.stringify(trigger.id ?? `${index}`)}, ${Number(trigger.x) || 0}, ${Number(trigger.y) || 0}, ${Number(trigger.width) || 0}, ${Number(trigger.height) || 0}, ${activation(trigger.activation)}, ${trigger.enabled !== false ? 'true' : 'false'}, ${trigger.once === true ? 'true' : 'false'}, ${Math.max(0, Number(trigger.cooldownFrames) || 0)}, ${enterPtr}, ${enter.length}, ${leavePtr}, ${leave.length} },\n`;
          }).join('');
          response += `${declarations}${records ? `static const ScriptTrigger ${triggerBase}_TRIGGERS[] = {\n${records}};\n` : ''}static const int ${triggerBase}_TRIGGERS_COUNT = ${val.length};\n`;
        }

        if (key === 'actors' && val && Array.isArray(val)) {
          const actorBase = baseName.replace(/_ACTORS$/, '');
          let declarations = '';
          const records = val.map((actor: any, index: number) => {
            const id = JSON.stringify(String(actor?.id ?? actor?.actorId ?? index));
            const spriteId = JSON.stringify(String(actor?.spriteId ?? actor?.actorId ?? ''));
            const direction = ['left', 'right', 'up', 'down'].includes(actor?.direction) ? actor.direction : 'right';
            // The scene editor stores actors by their canvas anchor. Legacy
            // actors without an explicit anchor were stored by their box's
            // top-left corner, so normalize those to the anchor position.
            const actorWidth = Math.max(1, Number(actor?.width) || 16);
            const actorHeight = Math.max(1, Number(actor?.height) || 16);
            const actorX = Number(actor?.x) || 0;
            const actorY = Number(actor?.y) || 0;
            const runtimeX = actor?.anchor === 'center' ? actorX : actorX + actorWidth / 2;
            const runtimeY = actor?.anchor === 'center' ? actorY : actorY + actorHeight / 2;
            const interact = Array.isArray(actor?.onInteractScript) ? actor.onInteractScript : [];
            const interactSymbol = `${actorBase}_ACTOR_${index}_INTERACT`;
            declarations += interact.length ? this.emitSceneScripts(interactSymbol, interact) : '';
            const interactPtr = interact.length ? `${interactSymbol}_SCRIPTS` : 'nullptr';
            return `    { ${id}, ${spriteId}, ${Math.round(runtimeX)}, ${Math.round(runtimeY)}, ${JSON.stringify(direction)}, ${interactPtr}, ${interact.length} },\n`;
          }).join('');
          response += `${declarations}static const SceneActor ${actorBase}_ACTORS[] = {\n${records}};\nstatic const int ${actorBase}_ACTORS_COUNT = ${val.length};\n`;
        }

        if (key === 'collisions' && val && Array.isArray(val)) {
          const collisionBase = baseName.replace(/_COLLISIONS$/, '');
          const records = val.map((collision: any, index: number) => {
            const side = ['solid', 'top', 'down', 'left', 'right'].includes(collision?.collisionSide)
              ? collision.collisionSide : 'solid';
            // SceneCollision is integer pixel geometry in the Butano runtime.
            // Round editor values so generated aggregate initializers cannot
            // fail with C++ narrowing errors when a fractional tile size leaks in.
            const pixel = (value: unknown, minimum = 0) => Math.max(minimum, Math.round(Number(value) || 0));
            return `    { ${JSON.stringify(String(collision?.id ?? index))}, ${pixel(collision?.x)}, ${pixel(collision?.y)}, ${pixel(collision?.width)}, ${pixel(collision?.height)}, ${JSON.stringify(side)} },\n`;
          }).join('');
          response += `static const SceneCollision ${collisionBase}_COLLISIONS[] = {\n${records}};\nstatic const int ${collisionBase}_COLLISIONS_COUNT = ${val.length};\n`;
        }

        break;
      // case "settings":
      //   response += "" + "\n";
      //   break;
      default:
        const encoded = JSON.stringify(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        response += `static const char ${baseName}_JSON[] = \"${encoded}\";\n`;
        break;
    }

    return response;
  }

  /**
   * Generate a header file from parsed JSON or raw JSON string
   */
  private generateHeaderFromJson(baseName: string, jsonObj: any, rawJson: string): string {
    const guardName = `${baseName.toUpperCase()}_RES_H`;
    let header = `#ifndef ${guardName}\n#define ${guardName}\n\n`;
    header += `#include "resource_types.h"\n\n`;
    header += `/* Auto-generated resource header for: ${baseName} */\n\n`;

    if (jsonObj?.eventGraphs && typeof jsonObj.eventGraphs === 'object') {
      for (const [key, graph] of Object.entries(jsonObj.eventGraphs)) {
        if (graph && typeof graph === 'object') {
          try {
            compileScriptGraphWithSourceMap(graph as any);
          } catch (error) {
            throw new Error(`Invalid event graph '${key}' in ${baseName}: ${(error as Error).message}`);
          }
        }
      }
    }

    if (jsonObj?._resourceType === 'variables') {
      header += this.generateVariablesHeader(jsonObj);
      header += `\n#endif // ${guardName}\n`;
      return header;
    }

    if (jsonObj?._resourceType === 'scripts') {
      header += this.generateScriptDefinitionsHeader(baseName, jsonObj);
      header += `\n#endif // ${guardName}\n`;
      return header;
    }

    if (jsonObj?._resourceType === 'settings' || jsonObj?._resourceType === 'sprite') {
      header += this.generateSpriteCanvasFramesHeader(baseName, jsonObj);
      header += this.generateSpriteAnimationsHeader(baseName, jsonObj);
    }

    if (jsonObj && typeof jsonObj === 'object') {
      // Emit primitive keys as defines or constants
      for (const key of Object.keys(jsonObj)) {
        const val = jsonObj[key];
        const cleanKey = `${baseName}_${key}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        if ((jsonObj._resourceType === 'settings' || jsonObj._resourceType === 'sprite') && (key === 'playerAnimationStates' || key === 'playerAnimations')) {
          continue;
        }
        if (typeof val === 'string') {
          const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          header += `static const char ${cleanKey}[] = \"${escaped}\";\n`;
        } else if (typeof val === 'number') {
          header += `static const int ${cleanKey} = ${val};\n`;
        } else if (typeof val === 'boolean') {
          header += `static const int ${cleanKey} = ${val ? 1 : 0};\n`;
        } else if (key === 'tileMap' && Array.isArray(val) && val.every(row => Array.isArray(row) && row.every(v => typeof v === 'number'))) {
          if (val.length > 0 && val[0].length > 0) {
            // É um array 2D de números -> gera como int[][]
            const rowCount = val.length;
            const colCount = val[0].length;
            const rows = val.map(row => `{ ${row.join(', ')} }`).join(',\n    ');

            header += `#define ${cleanKey}_ROWS ${rowCount}\n`;
            header += `#define ${cleanKey}_COLS ${colCount}\n`;
            header += `static const int ${cleanKey}[${cleanKey}_ROWS][${cleanKey}_COLS] = {\n    ${rows}\n};\n`;
          } 
          // else {
          //   // matriz vazia
          //   header += `static const int* ${cleanKey} = nullptr;\n`;
          //   header += `#define ${cleanKey}_ROWS 0\n`;
          //   header += `#define ${cleanKey}_COLS 0\n`;
          // }
        } else if (Array.isArray(val) && val.every(v => typeof v === 'number')) {
          if (val.length > 0) {
            // Array 1D de números -> gera como int[]
            const values = val.join(', ');
            header += `static const int ${cleanKey}[] = { ${values} };\n`;
            header += `static const int ${cleanKey}_SIZE = sizeof(${cleanKey}) / sizeof(int);\n`;
          } 
          // else {
          //   // lista vazia -> define como NULL
          //   header += `static const int* ${cleanKey} = nullptr;\n`;
          //   header += `static const int ${cleanKey}_SIZE = 0;\n`;
          // }
        } else {
          // Para objetos complexos ou arrays de objetos
          header += this.createStructureFromJson(cleanKey, key, val, jsonObj._resourceType);
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

  private generateSpriteCanvasFramesHeader(baseName: string, resource: any): string {
    const states = Array.isArray(resource.playerAnimationStates) ? resource.playerAnimationStates : [];
    const pieces: Array<{ sourceX: number; sourceY: number; width: number; height: number; x: number; y: number }> = [];
    const frames: Array<{
      stateId: string;
      stateType: string;
      animationId: string;
      frameId: string;
      width: number;
      height: number;
      firstPiece: number;
      piecesCount: number;
    }> = [];

    for (const state of states) {
      for (const animation of Array.isArray(state.animations) ? state.animations : []) {
        for (const frame of Array.isArray(animation.canvasFrames) ? animation.canvasFrames : []) {
          const firstPiece = pieces.length;
          const framePieces = Array.isArray(frame.pieces) ? frame.pieces : [];
          pieces.push(...framePieces);
          frames.push({
            stateId: String(state.id ?? ''),
            stateType: String(state.type ?? ''),
            animationId: String(animation.id ?? ''),
            frameId: String(frame.id ?? ''),
            width: Number(frame.width) || 8,
            height: Number(frame.height) || 8,
            firstPiece,
            piecesCount: framePieces.length,
          });
        }
      }
    }

    if (frames.length === 0) return '';

    const symbol = baseName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    let header = '';
    if (pieces.length > 0) {
      header += `static const SpriteCanvasPiece ${symbol}_PLAYER_CANVAS_PIECES[] = {\n`;
      header += pieces.map(piece => `    { ${piece.sourceX}, ${piece.sourceY}, ${piece.width}, ${piece.height}, ${piece.x}, ${piece.y} }`).join(',\n');
      header += `\n};\nstatic const int ${symbol}_PLAYER_CANVAS_PIECES_COUNT = ${pieces.length};\n`;
    }
    header += `static const SpriteCanvasFrameDefinition ${symbol}_PLAYER_CANVAS_FRAMES[] = {\n`;
    header += frames.map(frame => `    { "${escape(frame.stateId)}", "${escape(frame.stateType)}", "${escape(frame.animationId)}", "${escape(frame.frameId)}", ${frame.width}, ${frame.height}, ${frame.firstPiece}, ${frame.piecesCount} }`).join(',\n');
    header += `\n};\nstatic const int ${symbol}_PLAYER_CANVAS_FRAMES_COUNT = ${frames.length};\n\n`;
    return header;
  }

  private generateSpriteAnimationsHeader(baseName: string, resource: any): string {
    const states = Array.isArray(resource.playerAnimationStates) ? resource.playerAnimationStates : [];
    const animations: Array<{ stateId: string; stateType: string; id: string; type: string; frames: number[]; flipRightToCreateLeftFrames: boolean }> = [];
    const frameWidth = Number(resource.playerFrameWidth) || 16;
    const frameHeight = Number(resource.playerFrameHeight) || 16;
    const sheetColumns = Math.max(1, Math.floor((Number(resource.imageWidth) || frameWidth) / frameWidth));

    for (const state of states) {
      for (const animation of Array.isArray(state.animations) ? state.animations : []) {
        const indexedFrames = Array.isArray(animation.frames)
          ? animation.frames.filter((frame: unknown): frame is number =>
            typeof frame === 'number' && Number.isInteger(frame) && frame >= 0)
          : [];
        const canvasFrames = Array.isArray(animation.canvasFrames) ? animation.canvasFrames : [];
        const frames = indexedFrames.length > 0
          ? indexedFrames
          : canvasFrames.flatMap((frame: any) => {
            const piece = Array.isArray(frame?.pieces) ? frame.pieces[0] : null;
            if (!piece || !Number.isFinite(piece.sourceX) || !Number.isFinite(piece.sourceY)) return [];
            return [Math.floor(piece.sourceY / frameHeight) * sheetColumns + Math.floor(piece.sourceX / frameWidth)];
          });
        if (frames.length > 0) {
          animations.push({ stateId: String(state.id ?? ''), stateType: String(state.type ?? ''),
            id: String(animation.id ?? ''), type: String(animation.type ?? ''), frames,
            flipRightToCreateLeftFrames: state.flipRightToCreateLeftFacingFrames !== false });
        }
      }
    }

    if (animations.length === 0) return '';

    const symbol = baseName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    let header = '';
    animations.forEach((animation, index) => {
      header += `static const int ${symbol}_ANIMATION_${index}_FRAMES[] = { ${animation.frames.join(', ')} };\n`;
    });
    header += `static const SpriteAnimationDefinition ${symbol}_ANIMATIONS[] = {\n`;
    header += animations.map((animation, index) =>
      `    { "${escape(animation.stateId)}", "${escape(animation.stateType)}", "${escape(animation.id)}", "${escape(animation.type)}", ${symbol}_ANIMATION_${index}_FRAMES, ${animation.frames.length}, ${animation.flipRightToCreateLeftFrames} }`
    ).join(',\n');
    header += `\n};\nstatic const int ${symbol}_ANIMATIONS_COUNT = ${animations.length};\n\n`;
    return header;
  }

  private generateVariablesHeader(resource: any): string {
    let header = '';

    for (const variable of resource.variables) {
      const symbol = variable.symbol;
      if (variable.type === 'number') {
        header += `static const int ${symbol}_INITIAL = ${variable.initialValue};\n`;
      } else if (variable.type === 'boolean') {
        header += `static const bool ${symbol}_INITIAL = ${variable.initialValue ? 'true' : 'false'};\n`;
      } else {
        const escaped = variable.initialValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        header += `static const char ${symbol}_INITIAL[] = "${escaped}";\n`;
      }
    }

    header += '\nstatic const VariableDefinition VARIABLES_DEFINITIONS[] = {\n';
    for (const variable of resource.variables) {
      const symbol = variable.symbol;
      const value = variable.type === 'number'
        ? `{ "${variable.id}", VariableType::number, ${symbol}_INITIAL, false, nullptr }`
        : variable.type === 'boolean'
          ? `{ "${variable.id}", VariableType::boolean, 0, ${symbol}_INITIAL, nullptr }`
          : `{ "${variable.id}", VariableType::string, 0, false, ${symbol}_INITIAL }`;
      header += `    ${value},\n`;
    }
    header += '};\n';
    header += `static const int VARIABLES_DEFINITIONS_COUNT = ${resource.variables.length};\n`;
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

    if (!resourceFiles.some(file => file.jsonContent?._resourceType === 'scripts')) {
      header += `\nstatic const ScriptDefinition SCRIPT_DEFINITIONS[1] = {};\n`;
      header += `static const int SCRIPT_DEFINITIONS_COUNT = 0;\n`;
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

  /** Validate script music IDs against the concrete Butano music registry. */
  public validateMusicReferences(resourceFiles: ResourceFile[], buildDir: string): void {
    const ids = new Set<string>();
    const collect = (events: any[]) => {
      for (const event of Array.isArray(events) ? events : []) {
        if (event?.command === 'EVENT_PLAY_MUSIC' && typeof event.args?.musicId === 'string' && event.args.musicId) {
          ids.add(event.args.musicId);
        }
        collect(event?.children?.then);
        collect(event?.children?.else);
      }
    };
    for (const file of resourceFiles) {
      collect(file.jsonContent?.script || []);
      const triggers = (file.jsonContent as any)?.triggers;
      for (const trigger of Array.isArray(triggers) ? triggers : []) {
        collect(trigger?.onEnterScript);
        collect(trigger?.onLeaveScript);
      }
    }
    if (!ids.size) return;
    const headerPath = path.join(buildDir, 'bn_music_items.h');
    if (!fs.existsSync(headerPath)) {
      throw new Error(`Music assets missing: EVENT_PLAY_MUSIC references ${[...ids].join(', ')}`);
    }
    const header = fs.readFileSync(headerPath, 'utf8');
    const symbol = (id: string) => {
      const normalized = id.normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .replace(/[^A-Za-z0-9_]/g, '_').toLowerCase().replace(/_+/g, '_');
      return /^[a-z]/.test(normalized) ? normalized : `a_${normalized}`;
    };
    const missing = [...ids].filter(id => !new RegExp(`\\b${symbol(id)}\\s*\\(`).test(header));
    if (missing.length) {
      throw new Error(`Music assets not found for EVENT_PLAY_MUSIC: ${missing.join(', ')}`);
    }
  }

  /**
   * Generate resource registry C++ class
   */
  public async generateResourceRegistryClass(resourceFiles: ResourceFile[], config: GameConfig ): Promise<void> {
    const tplPath = path.join(this.templateDir, 'src', 'resource_registry.cpp');

    if (fs.existsSync(tplPath)) {
      this.validateSceneReferences(resourceFiles);
      let registry_template = fs.readFileSync(tplPath, 'utf8');
      // let objects = "";
      let backgrounds = "";
      let scenes = "";
      let sprites = "";
      // Projects created before the settings resource was introduced may not
      // provide a settings file. Keep the generated aggregate valid C++ so
      // those projects can still be played with default-initialized settings.
      let settings = "";
      let backgroundsCount = 0;
      let scenesCount = 0;
      let spritesCount = 0;
      let variablesInitialization = '    VariableManager::instance().initialize(nullptr, 0);';
      const paletteDefinitions = new Map<string, string[]>([
        ['preset-gba', ['#000000', '#ffffff', '#b5d8a8', '#73a55c', '#3d6b3d', '#203c56', '#456b8c', '#8fb8d8', '#f4d35e', '#ee964b', '#f95738', '#9e2a2b', '#6a4c93', '#8e7dbe', '#2a9d8f', '#264653']],
        ['preset-gameboy', ['#0f380f', '#306230', '#8bac0f', '#9bbc0f', '#1b1b1b', '#3b4a2f', '#5f7c3b', '#cadc9f', '#283618', '#606c38', '#a3b18a', '#dad7cd', '#344e41', '#588157', '#a3b18a', '#fefae0']],
        ['preset-grayscale', ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888', '#999999', '#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd', '#eeeeee', '#ffffff']],
        ['preset-sunset', ['#16001e', '#301934', '#512b58', '#7b2d5f', '#a44255', '#d05a4e', '#ef8354', '#f6bd60', '#f7ede2', '#84a59d', '#52796f', '#354f52', '#2f3e46', '#e07a5f', '#3d405b', '#81b29a']],
      ]);

      for (const file of resourceFiles) {
        switch(file.jsonContent?._resourceType) {
          case "background":
            backgrounds += parseResourceFile(file) + "\n";
            backgroundsCount++;
            break;
          case "scene":
            scenes += parseResourceFile(file) + "\n";
            scenesCount++;
            break;
          case "sprite":
            sprites += parseResourceFile(file) + "\n";
            spritesCount++;
            break;
          case "settings":
            settings += parseResourceFile(file) + "\n";
            break;
          case "variables":
            variablesInitialization = '    VariableManager::instance().initialize(VARIABLES_DEFINITIONS, VARIABLES_DEFINITIONS_COUNT);';
            break;
          case "palette": {
            const palette = file.jsonContent as any;
            if (typeof palette.id === 'string' && Array.isArray(palette.colors)) {
              paletteDefinitions.set(palette.id, palette.colors.filter((color: unknown) => typeof color === 'string').slice(0, 16));
            }
            break;
          }
        }

        // objects += parseResourceFile(file) + "\n";
      }

      const toButanoColor = (value: string) => {
        const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
        if (!match) return 'bn::color(0, 0, 0)';
        const channel = (part: string) => Math.round(parseInt(part, 16) * 31 / 255);
        return `bn::color(${channel(match[1])}, ${channel(match[2])}, ${channel(match[3])})`;
      };
      const paletteConstants = [...paletteDefinitions.entries()].map(([id, colors], index) => {
        const symbol = `BACKGROUND_PALETTE_${index}_COLORS`;
        const normalized = [...colors];
        while (normalized.length < 16) normalized.push('#000000');
        return { id, symbol, colors: normalized.slice(0, 16) };
      });
      const paletteSource = paletteConstants.map(palette =>
        `static const bn::color ${palette.symbol}[] = { ${palette.colors.map(toButanoColor).join(', ')} };`
      ).join('\n');
      const paletteEntries = paletteConstants.map(palette =>
        `    { ${JSON.stringify(palette.id)}, ${palette.symbol}, 16 },`
      ).join('\n');

      // Emit a bounded resolver for string music IDs used by script events.
      // Butano generates the concrete `bn::music_items::*` symbols only when
      // music assets exist, so the header remains compilable for audio-less
      // projects through __has_include.
      const musicIds = new Set<string>();
      const collectMusicIds = (events: any[]) => {
        for (const event of Array.isArray(events) ? events : []) {
          if (event?.command === 'EVENT_PLAY_MUSIC' && typeof event.args?.musicId === 'string' && event.args.musicId) {
            musicIds.add(event.args.musicId);
          }
          collectMusicIds(event?.children?.then);
          collectMusicIds(event?.children?.else);
        }
      };
      for (const file of resourceFiles) {
        collectMusicIds(file.jsonContent?.script || []);
        const triggers = (file.jsonContent as any)?.triggers;
        for (const trigger of Array.isArray(triggers) ? triggers : []) {
          collectMusicIds(trigger?.onEnterScript);
          collectMusicIds(trigger?.onLeaveScript);
        }
      }

      // Keep valid value-initialization only when a project truly has no
      // settings resource. A real settings initializer must not be appended
      // to the fallback "{}" value.
      if (!settings.trim()) settings = "{}";
      const musicSymbol = (id: string) => {
        const normalized = id.normalize('NFD').replace(/\p{Diacritic}/gu, '')
          .replace(/[^A-Za-z0-9_]/g, '_').toLowerCase().replace(/_+/g, '_');
        return /^[a-z]/.test(normalized) ? normalized : `a_${normalized}`;
      };
      const resolverBranches = [...musicIds].map(id =>
        `    if (bn::string<64>(id) == ${JSON.stringify(id)}) return bn::music_items::${musicSymbol(id)};`
      ).join('\n');
      const soundIds = new Set<string>();
      const collectSoundIds = (events: any[]) => {
        for (const event of Array.isArray(events) ? events : []) {
          if (event?.command === 'EVENT_PLAY_SOUND' && typeof event.args?.soundId === 'string' && event.args.soundId) soundIds.add(event.args.soundId);
          collectSoundIds(event?.children?.then);
          collectSoundIds(event?.children?.else);
        }
      };
      for (const file of resourceFiles) {
        collectSoundIds(file.jsonContent?.script || []);
        const triggers = (file.jsonContent as any)?.triggers;
        for (const trigger of Array.isArray(triggers) ? triggers : []) {
          collectSoundIds(trigger?.onEnterScript);
          collectSoundIds(trigger?.onLeaveScript);
        }
      }
      const soundBranches = [...soundIds].map(id =>
        `    if (bn::string<64>(id) == ${JSON.stringify(id)}) return bn::sound_items::${musicSymbol(id)};`
      ).join('\n');
      const audioRegistry = `#ifndef GENERATED_AUDIO_REGISTRY_H\n#define GENERATED_AUDIO_REGISTRY_H\n#include "bn_optional.h"\n#include "bn_string.h"\n#include "bn_music_item.h"\n#include "bn_sound_item.h"\n#if __has_include("bn_music_items.h")\n#include "bn_music_items.h"\n#endif\n#if __has_include("bn_sound_items.h")\n#include "bn_sound_items.h"\n#endif\ninline bn::optional<bn::music_item> resolve_music_item(const bn::string<64>& id)\n{\n#if __has_include("bn_music_items.h")\n${resolverBranches}\n#endif\n    return bn::nullopt;\n}\ninline bn::optional<bn::sound_item> resolve_sound_item(const bn::string<64>& id)\n{\n#if __has_include("bn_sound_items.h")\n${soundBranches}\n#endif\n    return bn::nullopt;\n}\n#endif\n`;
      fs.writeFileSync(path.join(this.includeDir, 'audio_registry.h'), audioRegistry, 'utf8');

      registry_template = registry_template.replace("{{PROJECT_NAME}}", config.projectName);
      registry_template = registry_template.replace("{{AUTHOR}}", config.authorName || '');
      registry_template = registry_template.replace("{{VERSION}}", config.version || '1.0.0');
      // registry_template = registry_template.replace("{{OBJECT_CONSTANTS}}", objects);
      registry_template = registry_template.replace("{{BACKGROUNDS_CONSTANTS}}", backgrounds);
      registry_template = registry_template.replace("{{SCENES_CONSTANTS}}", scenes);
      registry_template = registry_template.replace("{{SPRITES_CONSTANTS}}", sprites);
      registry_template = registry_template.replace("{{BACKGROUNDS_COUNT}}", String(backgroundsCount));
      registry_template = registry_template.replace("{{SCENES_COUNT}}", String(scenesCount));
      registry_template = registry_template.replace("{{SPRITES_COUNT}}", String(spritesCount));
      registry_template = registry_template.replace("{{BACKGROUNDS_ARRAY_SIZE}}", String(Math.max(1, backgroundsCount)));
      registry_template = registry_template.replace("{{BACKGROUND_PALETTES_CONSTANTS}}", paletteSource);
      registry_template = registry_template.replace("{{BACKGROUND_PALETTES_COUNT}}", String(paletteConstants.length));
      registry_template = registry_template.replace("{{BACKGROUND_PALETTES_ARRAY_SIZE}}", String(Math.max(1, paletteConstants.length)));
      registry_template = registry_template.replace("{{BACKGROUND_PALETTES_ENTRIES}}", paletteEntries || '    { nullptr, nullptr, 0 },');
      registry_template = registry_template.replace("{{SCENES_ARRAY_SIZE}}", String(Math.max(1, scenesCount)));
      registry_template = registry_template.replace("{{SPRITES_ARRAY_SIZE}}", String(Math.max(1, spritesCount)));
      registry_template = registry_template.replace("{{SETTINGS_CONSTANTS}}", settings);
      registry_template = registry_template.replace("{{VARIABLES_INITIALIZATION}}", variablesInitialization);

      const registryPath = path.join(this.srcDir, 'resource_registry.cpp');
      fs.writeFileSync(registryPath, registry_template, 'utf8');
      console.log('..: Tempalte resource registry completed:', registryPath);
    }
  }

  private validateSceneReferences(resourceFiles: ResourceFile[]): void {
    const resourceIds = new Set<string>();
    for (const file of resourceFiles) {
      const id = file.jsonContent?.id;
      if (typeof id !== 'string' || !id) continue;
      if (resourceIds.has(id)) throw new Error(`Duplicate resource id '${id}'`);
      resourceIds.add(id);
    }
    const sceneIds = new Set(resourceFiles
      .filter(file => file.jsonContent?._resourceType === 'scene')
      .map(file => file.jsonContent?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0));
    const backgrounds = new Set(resourceFiles
      .filter(file => file.jsonContent?._resourceType === 'background')
      .map(file => file.jsonContent?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0));
    const visit = (events: any[], owner: string): void => {
      for (const event of events) {
        if (!event || typeof event !== 'object') continue;
        const args = event.args ?? {};
        if (event.command === 'EVENT_CHANGE_SCENE' && typeof args.sceneId === 'string' && args.sceneId && !sceneIds.has(args.sceneId)) {
          throw new Error(`Invalid EVENT_CHANGE_SCENE ${event.id ?? '<unknown>'}: scene '${args.sceneId}' does not exist`);
        }
        if (event.command === 'EVENT_CHANGE_LAYER' && typeof args.backgroundId === 'string' && args.backgroundId && !backgrounds.has(args.backgroundId)) {
          throw new Error(`Invalid EVENT_CHANGE_LAYER ${event.id ?? '<unknown>'}: background '${args.backgroundId}' does not exist`);
        }
        visit(Array.isArray(event.children?.then) ? event.children.then : [], owner);
        visit(Array.isArray(event.children?.else) ? event.children.else : [], owner);
      }
    };
    for (const file of resourceFiles) {
      if (file.jsonContent?._resourceType !== 'scene') continue;
      const scene = file.jsonContent as any;
      const nestedIds = new Set<string>();
      const registerNested = (items: any[], kind: string) => {
        for (const item of Array.isArray(items) ? items : []) {
          if (typeof item?.id !== 'string' || !item.id) continue;
          if (nestedIds.has(item.id)) throw new Error(`Duplicate ${kind} id '${item.id}' in scene '${scene.id ?? ''}'`);
          nestedIds.add(item.id);
        }
      };
      registerNested(scene.actors, 'scene object');
      registerNested(scene.triggers, 'scene object');
      registerNested(scene.collisions, 'collision');
      visit(Array.isArray(scene.script) ? scene.script : [], String(scene.id ?? 'scene'));
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
  const toButanoGraphicsName = (filename: string): string => {
    const base = filename.replace(/\.[^/.]+$/, '')
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^A-Za-z0-9_]/g, '_').toLowerCase().replace(/_+/g, '_');
    return /^[a-z]/.test(base) ? base : `a_${base}`;
  };

  if (type === "settings") {
    // Settings are emitted with the canonical SETTINGS_* symbols even when
    // the source resource filename has a different display-oriented name.
    const settingsSymbolBase = hasSymbol(`${baseNameUpper}_STARTSCENEID`) ? baseNameUpper : 'SETTINGS';
    const required = [
      `${settingsSymbolBase}_STARTSCENEID`,
      `${settingsSymbolBase}_STARTX`,
      `${settingsSymbolBase}_STARTY`,
      `${settingsSymbolBase}_STARTMOVESPEED`,
      `${settingsSymbolBase}_STARTANIMSPEED`,
      `${settingsSymbolBase}_STARTDIRECTION`,
      `${settingsSymbolBase}_COLORMODE`,
    ];
    const colorMode = file.jsonContent?.colorMode === 'mixed' ? 1 : 0;
    const fadeDirection = Number(file.jsonContent?.fadeDirection) === 1 ? 1 : 0;
    const playerSpriteId = file.jsonContent?.playerSpriteId ? `${settingsSymbolBase}_PLAYERSPRITEID` : 'nullptr';
    const uiCursorImage = JSON.stringify(toButanoGraphicsName(String(file.jsonContent?.uiCursorImage || 'cursor.png')));
    // The source frame is converted to a full-width regular background during
    // transcoding, preserving its 8px border without sprite scaling.
    const uiFrameImage = JSON.stringify('dialogue_frame_sprite');
    const playerFrameWidth = file.jsonContent?.playerFrameWidth ?? 16;
    const playerFrameHeight = file.jsonContent?.playerFrameHeight ?? 16;
    const playerFramesPerDirection = file.jsonContent?.playerFramesPerDirection ?? 4;
    const playerAnimSpeed = file.jsonContent?.playerAnimSpeed ?? file.jsonContent?.startAnimSpeed ?? 4;
    const playerIdleFrame = file.jsonContent?.playerIdleFrame ?? 0;
    const canvasAnimations = Array.isArray(file.jsonContent?.playerAnimationStates)
      ? file.jsonContent.playerAnimationStates.flatMap((state: any) => Array.isArray(state.animations) ? state.animations : [])
      : [];
    const canvasFrameDefinitions = canvasAnimations.flatMap((animation: any) => Array.isArray(animation.canvasFrames) ? animation.canvasFrames : []);
    const hasCanvasFrames = canvasFrameDefinitions.length > 0;
    const hasCanvasPieces = canvasFrameDefinitions.some((frame: any) => Array.isArray(frame.pieces) && frame.pieces.length > 0);
    const canvasFrames = hasCanvasFrames ? `${baseNameUpper}_PLAYER_CANVAS_FRAMES` : 'nullptr';
    const canvasFramesCount = hasCanvasFrames ? `${baseNameUpper}_PLAYER_CANVAS_FRAMES_COUNT` : '0';
    const canvasPieces = hasCanvasPieces ? `${baseNameUpper}_PLAYER_CANVAS_PIECES` : 'nullptr';
    const canvasPiecesCount = hasCanvasPieces ? `${baseNameUpper}_PLAYER_CANVAS_PIECES_COUNT` : '0';

    if (required.every(hasSymbol)) {
      return ` { ResourceType::${type}, ${settingsSymbolBase}_STARTSCENEID, ${settingsSymbolBase}_STARTX, ${settingsSymbolBase}_STARTY, ${settingsSymbolBase}_STARTMOVESPEED, ${settingsSymbolBase}_STARTANIMSPEED, ${settingsSymbolBase}_STARTDIRECTION, ${colorMode}, ${fadeDirection}, ${playerSpriteId}, ${uiCursorImage}, ${uiFrameImage}, ${playerFrameWidth}, ${playerFrameHeight}, ${playerFramesPerDirection}, ${playerAnimSpeed}, ${playerIdleFrame}, ${canvasFrames}, ${canvasFramesCount}, ${canvasPieces}, ${canvasPiecesCount} }`;
    }
  } else if (type === "sprite") {
    const required = [
      `${baseNameUpper}_ID`,
      `${baseNameUpper}_NAME`,
      `${baseNameUpper}_FILENAME`,
    ];
    const canvasAnimations = Array.isArray(file.jsonContent?.playerAnimationStates)
      ? file.jsonContent.playerAnimationStates.flatMap((state: any) => Array.isArray(state.animations) ? state.animations : [])
      : [];
    const canvasFrameDefinitions = canvasAnimations.flatMap((animation: any) => Array.isArray(animation.canvasFrames) ? animation.canvasFrames : []);
    const hasCanvasFrames = canvasFrameDefinitions.length > 0;
    const hasCanvasPieces = canvasFrameDefinitions.some((frame: any) => Array.isArray(frame.pieces) && frame.pieces.length > 0);
    const canvasFrames = hasCanvasFrames ? `${baseNameUpper}_PLAYER_CANVAS_FRAMES` : 'nullptr';
    const canvasFramesCount = hasCanvasFrames ? `${baseNameUpper}_PLAYER_CANVAS_FRAMES_COUNT` : '0';
    const canvasPieces = hasCanvasPieces ? `${baseNameUpper}_PLAYER_CANVAS_PIECES` : 'nullptr';
    const canvasPiecesCount = hasCanvasPieces ? `${baseNameUpper}_PLAYER_CANVAS_PIECES_COUNT` : '0';
    const animations = Array.isArray(file.jsonContent?.playerAnimationStates)
      ? file.jsonContent.playerAnimationStates.flatMap((state: any) => Array.isArray(state.animations) ? state.animations : [])
      : [];
    const hasAnimations = animations.some((animation: any) =>
      (Array.isArray(animation.frames) && animation.frames.length > 0) ||
      (Array.isArray(animation.canvasFrames) && animation.canvasFrames.some((frame: any) => Array.isArray(frame?.pieces) && frame.pieces.length > 0)));
    const animationDefinitions = hasAnimations ? `${baseNameUpper}_ANIMATIONS` : 'nullptr';
    const animationDefinitionsCount = hasAnimations ? `${baseNameUpper}_ANIMATIONS_COUNT` : '0';
    const graphicsName = toButanoGraphicsName(String(file.jsonContent?.filename ?? file.jsonContent?.name ?? 'sprite'));

    if (required.every(hasSymbol)) {
      return `    { ResourceType::sprite, ${baseNameUpper}_ID, ${baseNameUpper}_NAME, ${baseNameUpper}_FILENAME, "${graphicsName}", ${file.jsonContent?.imageWidth ?? 0}, ${file.jsonContent?.imageHeight ?? 0}, ${file.jsonContent?.playerFrameWidth ?? 16}, ${file.jsonContent?.playerFrameHeight ?? 16}, ${file.jsonContent?.playerAnimSpeed ?? 6}, ${file.jsonContent?.playerIdleFrame ?? 0}, ${file.jsonContent?.playerCanvasOriginX ?? 0}, ${file.jsonContent?.playerCanvasOriginY ?? 8}, ${file.jsonContent?.playerCollisionX ?? 0}, ${file.jsonContent?.playerCollisionY ?? 0}, ${file.jsonContent?.playerCollisionWidth ?? 16}, ${file.jsonContent?.playerCollisionHeight ?? 8}, ${animationDefinitions}, ${animationDefinitionsCount}, ${canvasFrames}, ${canvasFramesCount}, ${canvasPieces}, ${canvasPiecesCount} },`;
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
    const sceneConfig: any = file.jsonContent || {};
    const required = [
      `${baseNameUpper}_ID`,
      `${baseNameUpper}_BACKGROUNDS_LAYERS`,
    ];
    if (required.every(hasSymbol)) {
      // Format: { name, id, name_const, background_id, selected_tileset_id, width, height, scene_type, image_type }
      const tilemap = file.jsonContent?.tileMap ? `${baseNameUpper}_TILEMAP_ROWS, ${baseNameUpper}_TILEMAP_COLS, &${baseNameUpper}_TILEMAP[0][0]` : '0, 0, nullptr';
      const tileSetId = file.jsonContent?.selectedTilesetId !== undefined ? `${baseNameUpper}_SELECTEDTILESETID` : '0';
      const imageType = file.jsonContent?.imageType !== undefined ? `${baseNameUpper}_IMAGETYPE` : '0';
      const backgroundLayerCount = file.jsonContent?.backgrounds ? file.jsonContent.backgrounds.length : 0;
      const sceneWidth = Number(sceneConfig.width) || 240;
      const sceneHeight = Number(sceneConfig.height) || 160;
      const cameraX = Number.isFinite(sceneConfig.cameraPosition?.x)
        ? Number(sceneConfig.cameraPosition?.x)
        : 0;
      const cameraY = Number.isFinite(sceneConfig.cameraPosition?.y)
        ? Number(sceneConfig.cameraPosition?.y)
        : 0;
      const script = file.jsonContent?.script && file.jsonContent.script.length > 0 ? `${baseNameUpper}_SCRIPTS` : `nullptr`;
      const scriptCount = file.jsonContent?.script && file.jsonContent.script.length > 0 ? `${baseNameUpper}_SCRIPTS_COUNT` : '0';
      const triggerCount = Array.isArray(sceneConfig.triggers) ? sceneConfig.triggers.length : 0;
      const triggers = triggerCount > 0 ? `${baseNameUpper}_TRIGGERS` : 'nullptr';
      const triggersCount = triggerCount > 0 ? `${baseNameUpper}_TRIGGERS_COUNT` : '0';
      const actorCount = Array.isArray(sceneConfig.actors) ? sceneConfig.actors.length : 0;
      const actors = actorCount > 0 ? `${baseNameUpper}_ACTORS` : 'nullptr';
      const actorsCount = actorCount > 0 ? `${baseNameUpper}_ACTORS_COUNT` : '0';
      const collisionCount = Array.isArray(sceneConfig.collisions) ? sceneConfig.collisions.length : 0;
      const collisions = collisionCount > 0 ? `${baseNameUpper}_COLLISIONS` : 'nullptr';
      const collisionsCount = collisionCount > 0 ? `${baseNameUpper}_COLLISIONS_COUNT` : '0';

      return `    { ResourceType::${type}, ${baseNameUpper}_ID, ${baseNameUpper}_NAME, ${script}, ${scriptCount}, ${baseNameUpper}_BACKGROUNDS_LAYERS, ${backgroundLayerCount}, ${tileSetId}, ${baseNameUpper}_WIDTH, ${baseNameUpper}_HEIGHT, ${cameraX}, ${cameraY}, ${baseNameUpper}_SCENETYPE, ${imageType}, ${tilemap}, ${triggers}, ${triggersCount}, ${actors}, ${actorsCount}, ${collisions}, ${collisionsCount} },`;
    } else {
      const backgroundLayerCount = file.jsonContent?.backgrounds ? file.jsonContent.backgrounds.length : 0;
      const triggerCount = Array.isArray(sceneConfig.triggers) ? sceneConfig.triggers.length : 0;
      const triggers = triggerCount > 0 ? `${baseNameUpper}_TRIGGERS` : 'nullptr';
      const triggersCount = triggerCount > 0 ? `${baseNameUpper}_TRIGGERS_COUNT` : '0';

      const collisionCount = Array.isArray(sceneConfig.collisions) ? sceneConfig.collisions.length : 0;
      const collisions = collisionCount > 0 ? `${baseNameUpper}_COLLISIONS` : 'nullptr';
      const collisionsCount = collisionCount > 0 ? `${baseNameUpper}_COLLISIONS_COUNT` : '0';
      return `    { ResourceType::${type}, ${baseNameUpper}_ID, "${name}", nullptr, 0, nullptr, ${backgroundLayerCount}, nullptr, 0, 0, 0, 0, ${baseNameUpper}_SCENETYPE, nullptr, 0, 0, 0, ${triggers}, ${triggersCount}, nullptr, 0, ${collisions}, ${collisionsCount} },`;
    }
  }

  // Fallback genérico
  return ``;
}

export default ResourceBuilder;
