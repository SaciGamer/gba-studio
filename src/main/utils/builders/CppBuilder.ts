/**
 * C++ Builder - Generates base C++ structures for Butano GBA projects
 * Creates main entry point, game classes, and project structure
 */

import fs from 'fs';
import path from 'path';
import { GameConfig } from '../types/BuildTypes';

export class CppBuilder {
  private srcDir: string;
  private includeDir: string;
  private templateDir?: string;
  private graphicHeadersGeneratedByButano: string[];

  constructor(buildDir: string, templateDir?: string, graphicHeadersGeneratedByButano: string[] = []) {
    this.srcDir = path.join(buildDir, 'src');
    this.includeDir = path.join(buildDir, 'include');
    this.templateDir = templateDir;
    this.graphicHeadersGeneratedByButano = graphicHeadersGeneratedByButano;
  }

  /**
   * Generate base C++ project structure
   */
  public async generateProjectStructure(config: GameConfig): Promise<void> {
    console.log('..: Generating C++ project structure for:', config.projectName);

    // Create main game class
    await this.generateGameClass(config);

    // Create game state
    await this.generateGameState(config);

    // Create main entry point
    await this.generateMainCpp(config);

    // Create CMake-style includes if using advanced features
    if (config.useThreads) {
      await this.generateThreadingSupport(config);
    }

    if (config.useAudio) {
      await this.generateAudioSupport(config);
    }

    if (config.useGraphics) {
      // Copy graphics manager class and state
      await this.generateGraphicsClassSupport(config);
      await this.generateGraphicsStateSupport(config);

      // Copy script commands manager class and state
      await this.generateScriptCommandsManagerClassSupport(config);
      await this.generateScriptCommandsStateSupport(config);
      // await this.generateEventFadeSupport(config);
    }

    console.log('..: C++ project structure generated');
  }

  /**
   * Generate main game class header
   */
  private async generateGameClass(config: GameConfig): Promise<void> {
    const gameHPath = path.join(this.includeDir, 'game.h');
    const guard = config.projectName.toUpperCase();

    try {
      if (this.templateDir) {
        const tplPath = path.join(this.templateDir, 'include', 'game.h');
        if (fs.existsSync(tplPath)) {
          let tpl = fs.readFileSync(tplPath, 'utf8');
          tpl = tpl.replace(/\{\{PROJECT_NAME_UPPER\}\}/g, guard);
          tpl = tpl.replace(/\{\{PROJECT_NAME\}\}/g, config.projectName);
          fs.writeFileSync(gameHPath, tpl, 'utf8');
          console.log('..: Copied template game.h from template dir');
          return;
        }
      }
    } catch (e) {
      console.warn('..: Error using template game.h, falling back to generated content', e);
    }

  }

  /**
   * Generate game class implementation
   */
  private async generateGameState(config: GameConfig): Promise<void> {
    const srcPath = path.join(this.srcDir, 'game.cpp');

    // If a template game.cpp exists in the templateDir, copy and substitute placeholders
    try {
      if (this.templateDir) {
        const tplPath = path.join(this.templateDir, 'src', 'game.cpp');
        if (fs.existsSync(tplPath)) {
          let tpl = fs.readFileSync(tplPath, 'utf8');
          tpl = tpl.replace(/\{\{PROJECT_NAME\}\}/g, config.projectName);
          tpl = tpl.replace(/\{\{AUTHOR\}\}/g, config.authorName || '');
          tpl = tpl.replace(/\{\{VERSION\}\}/g, config.version || '1.0.0');
          fs.writeFileSync(srcPath, tpl, 'utf8');
          console.log('..: Copied template game.cpp from template dir');
          return;
        }
      }
    } catch (e) {
      console.warn('..: Error using template game.cpp, falling back to generated content', e);
    }
  }

  /**
   * Generate main.cpp entry point
   */
  private async generateMainCpp(config: GameConfig): Promise<void> {
    const mainPath = path.join(this.srcDir, 'main.cpp');

    // If a template main.cpp exists in templateDir, copy and substitute placeholders
    try {
      if (this.templateDir) {
        const tplPath = path.join(this.templateDir, 'src', 'main.cpp');
        if (fs.existsSync(tplPath)) {
          let tpl = fs.readFileSync(tplPath, 'utf8');
          tpl = tpl.replace(/\{\{PROJECT_NAME\}\}/g, config.projectName);
          tpl = tpl.replace(/\{\{AUTHOR\}\}/g, config.authorName || '');
          tpl = tpl.replace(/\{\{VERSION\}\}/g, config.version || '1.0.0');
          fs.writeFileSync(mainPath, tpl, 'utf8');
          console.log('..: Copied template main.cpp from template dir');
          return;
        }
      }
    } catch (e) {
      console.warn('..: Error using template main.cpp, falling back to generated content', e);
    }
  }

  /**
   * Generate threading support headers
   */
  private async generateThreadingSupport(config: GameConfig): Promise<void> {
    const content = `#ifndef THREADING_H
#define THREADING_H

#include "bn_core.h"
#include <thread>
#include <mutex>

/**
 * Thread-safe game state for multi-threaded rendering
 * Butano supports multi-threading for heavy computations
 */
class ThreadSafeGameState {
private:
    mutable std::mutex state_mutex;
    
public:
    /**
     * Lock for critical sections
     */
    std::unique_lock<std::mutex> acquire_lock() {
        return std::unique_lock<std::mutex>(state_mutex);
    }

    /**
     * Try lock for non-blocking operations
     */
    bool try_lock() {
        return state_mutex.try_lock();
    }

    /**
     * Unlock
     */
    void unlock() {
        state_mutex.unlock();
    }
};

/**
 * Worker thread pool for heavy computations
 */
class WorkerThreadPool {
private:
    static constexpr int NUM_THREADS = 2; // Half of available cores
    std::vector<std::thread> threads;
    
public:
    WorkerThreadPool();
    ~WorkerThreadPool();

    /**
     * Submit work to thread pool
     */
    template<typename Func>
    void submit(Func&& func) {
        // TODO: Implement work queue
    }

    /**
     * Wait for all tasks to complete
     */
    void wait_all();
};

#endif // THREADING_H
`;

    const threadPath = path.join(this.includeDir, 'threading.h');
    fs.writeFileSync(threadPath, content, 'utf8');
    console.log('..: Generated threading.h');
  }

  /**
   * Generate audio support headers
   */
  private async generateAudioSupport(config: GameConfig): Promise<void> {
    const content = `#ifndef AUDIO_MANAGER_H
#define AUDIO_MANAGER_H

#include "bn_core.h"
#include "bn_music.h"
#include "bn_sound.h"

/**
 * Audio Manager for ${config.projectName}
 * Handles music and sound effects using Butano's audio system
 */
class AudioManager {
private:
    static AudioManager* instance;
    bool audio_enabled;
    
    AudioManager();

public:
    /**
     * Get singleton instance
     */
    static AudioManager& get_instance();

    /**
     * Initialize audio system
     */
    void initialize();

    /**
     * Play background music
     */
    void play_music(bn::music_item music);

    /**
     * Play sound effect
     */
    void play_sound(bn::sound_item sound);

    /**
     * Stop music
     */
    void stop_music();

    /**
     * Set music volume (0-255)
     */
    void set_music_volume(int volume);

    /**
     * Set sound volume (0-255)
     */
    void set_sound_volume(int volume);

    /**
     * Enable/disable audio
     */
    void set_enabled(bool enabled) { audio_enabled = enabled; }

    /**
     * Check if audio is enabled
     */
    bool is_enabled() const { return audio_enabled; }
};

#endif // AUDIO_MANAGER_H
`;

    const audioPath = path.join(this.includeDir, 'audio_manager.h');
    fs.writeFileSync(audioPath, content, 'utf8');
    console.log('..: Generated audio_manager.h');
  }

  /**
   * Generate graphics manager support headers
   */
  private async generateGraphicsClassSupport(config: GameConfig): Promise<void> {
    const graphicHPath = path.join(this.includeDir, 'graphics_manager.h');

    try {
      if (this.templateDir) {
        const tplPath = path.join(this.templateDir, 'include', 'graphics_manager.h');
        if (fs.existsSync(tplPath)) {
          let content = fs.readFileSync(tplPath, 'utf8');
          content = content.replace(/\{\{GRAPHICS_NAME_UPPER\}\}/g, 'GRAPHICS_MANAGER');
          content = content.replace(/\{\{PROJECT_NAME\}\}/g, config.projectName);
          fs.writeFileSync(graphicHPath, content, 'utf8');
          console.log('..: Copied template graphics_manager.h from template dir');
          return;
        }
      }
    } catch (e) {
      console.warn('..: Error using template graphics_manager.h, falling back to generated content', e);
    }   

  }

  private conditionalToShowBackgroundsIfElse(graphicNames: string[]) {
    if (graphicNames.length === 0) return "";

    // Implementation for conditional logic to show backgrounds
    return graphicNames.filter(file => file.startsWith('bn_regular_bg_items_'))
        .map(file => {
          // remove extensão .h
          let name = file.replace(/\.h$/, "");
          // remove prefixo "bn_regular_bg_items_"
          let suffix = name.replace(/^bn_regular_bg_items_/, "");

          return `if (name == bn::string<64>("${suffix}")) {
\t// Show background ${suffix}
\treturn bn::regular_bg_items::${suffix};
    }`;
        }).join(' else ');
  }

  private conditionalToShowBitmapBackgroundsIfElse(graphicNames: string[]) {
    if (graphicNames.length === 0) return "";

    // Implementation for conditional logic to show bitmap backgrounds
    return graphicNames.filter(file => file.startsWith('bn_direct_bitmap_items_'))
        .map(file => {
          // remove extensão .h
          let name = file.replace(/\.h$/, "");
          // remove prefixo "bn_direct_bitmap_items_"
          let suffix = name.replace(/^bn_direct_bitmap_items_/, "");
          return `if (name == bn::string<64>("${suffix}")) {
\t// Show bitmap background ${suffix}
\treturn bn::direct_bitmap_items::${suffix};
    }`;
        }).join(' else ');
  }

  /**
   * Generate graphics manager state support headers
   */
  private async generateGraphicsStateSupport(config: GameConfig): Promise<void> {
    const graphicSrcPath = path.join(this.srcDir, 'graphics_manager.cpp');

    // If a template graphics_manager.cpp exists in the templateDir, copy and substitute placeholders
    try {
      if (this.templateDir) {
        const tplPath = path.join(this.templateDir, 'src', 'graphics_manager.cpp');
        if (fs.existsSync(tplPath)) {
          let content = fs.readFileSync(tplPath, 'utf8');
          content = content.replace(/\{\{PROJECT_NAME\}\}/g, config.projectName);
          content = content.replace(/\{\{AUTHOR\}\}/g, config.authorName || '');
          content = content.replace(/\{\{VERSION\}\}/g, config.version || '1.0.0');
          content = content.replace(/\{\{BACKGROUND_CONDITIONALS_FROM_NAME\}\}/g, this.conditionalToShowBackgroundsIfElse(this.graphicHeadersGeneratedByButano || []));
          content = content.replace(/\{\{BITMAP_BACKGROUND_CONDITIONALS_FROM_NAME\}\}/g, this.conditionalToShowBitmapBackgroundsIfElse(this.graphicHeadersGeneratedByButano || []));
          fs.writeFileSync(graphicSrcPath, content, 'utf8');
          console.log('..: Copied template graphics_manager.cpp from template dir');
          return;
        }
      }
    } catch (e) {
      console.warn('..: Error using template graphics_manager.cpp, falling back to generated content', e);
    }
  }

  private async generateScriptCommandsManagerClassSupport(config: GameConfig): Promise<void> {
    const scriptCmdMngPathSrc = path.join(this.srcDir, 'script_command_manager.cpp');

    try {
      if (this.templateDir) {
        const tplPath = path.join(this.templateDir, 'src', 'script_command_manager.cpp');
        if (fs.existsSync(tplPath)) {
          let tpl = fs.readFileSync(tplPath, 'utf8');
          fs.writeFileSync(scriptCmdMngPathSrc, tpl, 'utf8');
          console.log('..: Copied template script_command_manager.cpp from template dir');
          return;
        }
      }
    } catch (e) {
      console.warn('..: Error using template graphics_manager.h, falling back to generated content', e);
    }  
  }

  private async generateScriptCommandsStateSupport(config: GameConfig): Promise<void> {
    const scriptCmdMngPathInclude = path.join(this.includeDir, 'script_command_manager.h');

    // If a template main.cpp exists in templateDir, copy and substitute placeholders
    try {
      if (this.templateDir) {
        const tplPath = path.join(this.templateDir, 'include', 'script_command_manager.h');
        if (fs.existsSync(tplPath)) {
          let content = fs.readFileSync(tplPath, 'utf8');
          content = content.replace(/\{\{PROJECT_NAME\}\}/g, config.projectName);
          fs.writeFileSync(scriptCmdMngPathInclude, content, 'utf8');
          console.log('..: Copied template script_command_manager.h from template dir');
          return;
        }
      }
    } catch (e) {
      console.warn('..: Error using template main.cpp, falling back to generated content', e);
    }
  }

  private async generateEventFadeSupport(config: GameConfig): Promise<void> {
    const fadePathSrc = path.join(this.srcDir, 'event_fade.cpp');
    const fadePathInclude = path.join(this.includeDir, 'event_fade.h');

    try {
      if (this.templateDir) {
        const tplSrc = path.join(this.templateDir, 'src', 'event_fade.cpp');
        const tplInclude = path.join(this.templateDir, 'include', 'event_fade.h');

        if (fs.existsSync(tplSrc)) {
          fs.copyFileSync(tplSrc, fadePathSrc);
          console.log('..: Copied template event_fade.cpp');
        }
        if (fs.existsSync(tplInclude)) {
          fs.copyFileSync(tplInclude, fadePathInclude);
          console.log('..: Copied template event_fade.h');
        }
      }
    } catch (e) {
      console.warn('..: Error copying event_fade files', e);
    }
  }

}

export default CppBuilder;
