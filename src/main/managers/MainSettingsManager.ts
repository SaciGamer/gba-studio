import { IMainSettings } from '@/interfaces/MainSettingsInterface';
import { BaseManager as BaseManager } from './BaseManager';

const defaultMainSettings: IMainSettings = {
    _resourceType: 'settings',
    startSceneId: '',
    startX: 9,
    startY: 9,
    startMoveSpeed: 1,
    startAnimSpeed: 4,
    startDirection: 'right',
    colorMode: 'mono'
};

export class MainSettingsManager extends BaseManager<IMainSettings> {
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
        let response = this.getData();
        return response ? response.startSceneId : '';
    }

    public getStartX(): number {
        let response = this.getData();
        return response ? response.startX : 0;
    }

    public getStartY(): number {
        let response = this.getData();
        return response ? response.startY : 0;
    }

    public getStartMoveSpeed(): number {
        let response = this.getData();
        return response ? response.startMoveSpeed : 0;
    }

    public getStartAnimSpeed(): number {
        let response = this.getData();
        return response ? response.startAnimSpeed : 0;
    }

    public getStartDirection(): string {
        let response = this.getData();
        return response ? response.startDirection : '';
    }

    public getColorMode(): string {
        let response = this.getData();
        return response ? response.colorMode : '';
    }
    
}