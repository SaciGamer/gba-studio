import { BaseManager } from './BaseManager';
import { ETypeScene, ISceneSettings } from '@/interfaces/SceneInterface';

let sceneDefault: ISceneSettings = {
    _resourceType: 'scene',
    _index: 0,
    id: '', // UUID
    name: '',
    backgroundId: '', // UUID
    tileseId: '',
    width: 240,
    height: 160,
    type: ETypeScene.TOPDOWN,
    paletteIds: [],
    spritePaletteIds: [],
    collisions: [],
    autoFadeSpeed: 0,
    symbol: '',
    x: 0,
    y: 0,
    script: [],
    playerHit1Script: [],
    playerHit2Script: [],
    playerHit3Script: []
};

export class SceneManager extends BaseManager<ISceneSettings> {
    protected static instance: SceneManager | null = null;
    private scenes: ISceneSettings[];

    private constructor() {
        console.log('..: Entrando no Construtor :..')
        const initialScenes: ISceneSettings[] = [];
        super(initialScenes);
        this.scenes = initialScenes;
    }

    public static getInstance(): SceneManager {
        if (!SceneManager.instance) {
            SceneManager.instance = new SceneManager();
        }
        return SceneManager.instance;
    }

    // Criar uma nova cena
    public createScene(scene: ISceneSettings | Partial<ISceneSettings>): ISceneSettings {
        const newScene: ISceneSettings = {
            ...sceneDefault,
            ...scene, 
            type: ETypeScene.TOPDOWN,
        };
        this.scenes.push(newScene);
        return newScene;
    }

    // Obter uma cena por ID
    public getSceneById(id: string): ISceneSettings | null {
        return this.scenes.find(scene => scene.id === id) || null;
    }

    // Atualizar os dados de uma cena por ID
    public updateSceneById(id: string, updatedScene: Partial<ISceneSettings>): boolean {
        const sceneIndex = this.scenes.findIndex(scene => scene.id === id);
        if (sceneIndex === -1) return false;

        this.scenes[sceneIndex] = { ...this.scenes[sceneIndex], ...updatedScene };
        return true;
    }

    // Remover uma cena por ID
    public deleteSceneById(id: string): boolean {
        const initialLength = this.scenes.length;
        this.scenes = this.scenes.filter(scene => scene.id !== id);
        return this.scenes.length < initialLength;
    }

    // Listar todas as cenas
    public listScenes(): ISceneSettings[] {
        return this.scenes;
    }
}