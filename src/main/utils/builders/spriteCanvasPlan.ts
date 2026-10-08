export type SpriteStripOrientation = 'horizontal' | 'vertical';
export interface CanvasPiece {
    sourceX: number;
    sourceY: number;
    width: number;
    height: number;
    x: number;
    y: number;
    flipX?: boolean;
    flipY?: boolean;
}
export interface CanvasFramePlan {
    id: string;
    width: number;
    height: number;
    pieces: CanvasPiece[];
}
export interface CanvasAnimationPlan {
    stateId: string;
    stateType: string;
    id: string;
    type: string;
    frames: number[];
    flipRightToCreateLeftFrames: boolean;
}
export interface SpriteCanvasPlan {
    frameWidth: number;
    frameHeight: number;
    width: number;
    height: number;
    orientation: SpriteStripOrientation;
    frames: CanvasFramePlan[];
    animations: CanvasAnimationPlan[];
    idleFrame: number;
}
const shapes = [[8, 8], [16, 8], [8, 16], [16, 16], [32, 8], [8, 32], [32, 16], [16, 32], [32, 32], [64, 32], [32, 64], [64, 64]];
const integer = (value: unknown, fallback: number): number => {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error('Sprite canvas dimensions and frame indices must be integers');
    return value;
};
export function createSpriteCanvasPlan(resource: any, sourceWidth: number, sourceHeight: number): SpriteCanvasPlan {
    const label = String(resource.name ?? resource.id ?? resource.filename ?? 'sprite');
    const sourceFrameWidth = integer(resource.playerFrameWidth, 16), sourceFrameHeight = integer(resource.playerFrameHeight, 16);
    if (sourceFrameWidth <= 0 || sourceFrameHeight <= 0 || !Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0)
        throw new Error(`Sprite ${label}: invalid source/frame dimensions`);
    const columns = Math.max(1, Math.floor(sourceWidth / sourceFrameWidth)), rows = Math.max(1, Math.floor(sourceHeight / sourceFrameHeight));
    const frames: CanvasFramePlan[] = [], animations: CanvasAnimationPlan[] = [];
    const indexed = (index: number, id: string): CanvasFramePlan => {
        if (!Number.isInteger(index) || index < 0 || index >= columns * rows)
            throw new Error(`Sprite ${label}: source frame ${index} is outside the spritesheet`);
        return { id, width: sourceFrameWidth, height: sourceFrameHeight, pieces: [{ sourceX: (index % columns) * sourceFrameWidth, sourceY: Math.floor(index / columns) * sourceFrameHeight, width: sourceFrameWidth, height: sourceFrameHeight, x: 0, y: 0 }] };
    };
    const states = Array.isArray(resource.playerAnimationStates) && resource.playerAnimationStates.length
        ? resource.playerAnimationStates
        : [{ id: 'default', type: 'fixed-direction', animations: Array.isArray(resource.playerAnimations) ? resource.playerAnimations : [] }];
    for (const state of states)
        for (const animation of state.animations ?? []) {
            const indices: number[] = [];
            for (const [position, index] of (animation.frames ?? []).entries()) {
                indices.push(frames.length);
                frames.push(indexed(index, `${state.id}:${animation.id}:indexed:${position}`));
            }
            for (const frame of animation.canvasFrames ?? []) {
                const width = integer(frame.width, sourceFrameWidth), height = integer(frame.height, sourceFrameHeight);
                if (width <= 0 || height <= 0)
                    throw new Error(`Sprite ${label}: invalid canvas frame ${frame.id}`);
                const pieces = (frame.pieces ?? []).map((piece: any) => {
                    for (const key of ['sourceX', 'sourceY', 'width', 'height', 'x', 'y'])
                        if (!Number.isInteger(piece[key]))
                            throw new Error(`Sprite ${label}: canvas piece ${piece.id} has invalid ${key}`);
                    if (piece.sourceX < 0 || piece.sourceY < 0 || piece.width <= 0 || piece.height <= 0 || piece.sourceX >= sourceWidth || piece.sourceY >= sourceHeight)
                        throw new Error(`Sprite ${label}: canvas piece ${piece.id} is outside the spritesheet`);
                    return { ...piece };
                });
                indices.push(frames.length);
                frames.push({ id: String(frame.id), width, height, pieces });
            }
            if (indices.length)
                animations.push({ stateId: String(state.id), stateType: String(state.type ?? ''), id: String(animation.id), type: String(animation.type ?? ''), frames: indices, flipRightToCreateLeftFrames: state.flipRightToCreateLeftFacingFrames !== false });
        }
    // Older resources without animation metadata retain their source cell order.
    if (!frames.length)
        for (let index = 0; index < columns * rows; ++index)
            frames.push(indexed(index, `legacy:${index}`));
    if (!frames.length)
        throw new Error(`Sprite ${label}: no exportable frames`);
    const width = Math.max(...frames.map(frame => frame.width)), height = Math.max(...frames.map(frame => frame.height));
    const shape = shapes.filter(([w, h]) => w >= width && h >= height).sort((a, b) => a[0] * a[1] - b[0] * b[1])[0];
    if (!shape)
        throw new Error(`Sprite ${label}: canvas ${width}x${height} exceeds the supported single-sprite GBA sizes (maximum 64x64)`);
    // Hardware flip mirrors the padded GBA rectangle. If a logical canvas is
    // narrower, bake its automatic left variant so padding cannot move the actor.
    if (animations.length) {
        const packedFrames: CanvasFramePlan[] = [];
        const packedAnimations: CanvasAnimationPlan[] = [];
        for (const animation of animations) {
            const selectedFrames = animation.frames.map(index => frames[index]);
            const indices = selectedFrames.map(frame => { const index = packedFrames.length; packedFrames.push(frame); return index; });
            packedAnimations.push({ ...animation, frames: indices });
            const leftId = animation.id === 'idle' ? 'idle-left' : ['running', 'moving'].includes(animation.id) ? 'moving-left' : animation.id.replace(/-right$/, '-left');
            const automaticLeft = animation.flipRightToCreateLeftFrames && ['idle-right', 'moving-right', 'idle', 'running', 'moving'].includes(animation.id)
                && selectedFrames.some(frame => frame.width !== shape[0])
                && !animations.some(other => other.stateId === animation.stateId && other.id === leftId);
            if (automaticLeft) {
                const leftFrames = selectedFrames.map(frame => {
                    const index = packedFrames.length;
                    packedFrames.push({ ...frame, id: `${frame.id}:auto-left`, pieces: frame.pieces.map(piece => ({ ...piece, x: frame.width - piece.x - piece.width, flipX: !piece.flipX })) });
                    return index;
                });
                packedAnimations.push({ ...animation, id: leftId, frames: leftFrames, flipRightToCreateLeftFrames: false });
            }
        }
        frames.splice(0, frames.length, ...packedFrames);
        animations.splice(0, animations.length, ...packedAnimations);
    }
    const orientation: SpriteStripOrientation = resource.playerAnimationStripOrientation === 'vertical' ? 'vertical' : 'horizontal';
    return { frameWidth: shape[0], frameHeight: shape[1], width: shape[0] * (orientation === 'horizontal' ? frames.length : 1), height: shape[1] * (orientation === 'vertical' ? frames.length : 1), orientation, frames, animations, idleFrame: animations[0]?.frames[0] ?? Math.max(0, Math.min(frames.length - 1, integer(resource.playerIdleFrame, 0))) };
}
