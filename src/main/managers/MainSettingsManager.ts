import { MainSettings } from '@/interfaces/MainSettingsInterface';
import { BaseManager as BaseManager } from './BaseManager';

const defaultMainSettings: MainSettings = {
    _resourceType: 'settings',
    startSceneId: '',
    startX: 9,
    startY: 9,
    startMoveSpeed: 1,
    startAnimSpeed: 4,
    startDirection: 'right',
    colorMode: 'mono'
};

export class MainSettingsManager extends BaseManager<MainSettings> {
    protected static instance: MainSettingsManager | null = null;

    private constructor() {
        super(defaultMainSettings);
    }

    public static getInstance(): MainSettingsManager {
        if (!MainSettingsManager.instance) {
            MainSettingsManager.instance = new MainSettingsManager();
        }
        return MainSettingsManager.instance;
    }

    public getStartSceneId(): string {
        return this.data.startSceneId;
    }

    public getStartX(): number {
        return this.data.startX;
    }

    public getStartY(): number {
        return this.data.startY;
    }

    public getStartMoveSpeed(): number {
        return this.data.startMoveSpeed;
    }

    public getStartAnimSpeed(): number {
        return this.data.startAnimSpeed;
    }

    public getStartDirection(): string {
        return this.data.startDirection;
    }

    public getColorMode(): string {
        return this.data.colorMode;
    }
    
}