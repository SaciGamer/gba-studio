import { IResourceSettings } from './IBaseSettings';
import { ISpriteAnimation, ISpriteAnimationState } from './ISettingElement';

export interface ISpriteSettings extends IResourceSettings {
    _resourceType: 'sprite';
    imageWidth: number;
    imageHeight: number;
    playerFrameWidth: number;
    playerFrameHeight: number;
    playerFramesPerDirection: number;
    playerAnimSpeed: number;
    playerIdleFrame: number;
    playerCanvasOriginX: number;
    playerCanvasOriginY: number;
    playerCollisionX: number;
    playerCollisionY: number;
    playerCollisionWidth: number;
    playerCollisionHeight: number;
    playerAnimations: ISpriteAnimation[];
    playerAnimationStates: ISpriteAnimationState[];
}
