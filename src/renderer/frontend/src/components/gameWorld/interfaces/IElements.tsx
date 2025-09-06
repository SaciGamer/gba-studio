enum ETypeScene {
  TOPDOWN,
  PLATFORM,
  ADVENTURE,
  SHMUP,
  POINTNCLICK,
  LOGO
}

export interface IElement {
  _index: number;
  id: string;
  name: string;
  backgroundId: string;
  background: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // Schema on Frontend
  tileseId?: string;
  type?: ETypeScene;
  paletteIds?: string[];
  spritePaletteIds?: string[];
  collisions?: string[];
  autoFadeSpeed?: number;
  symbol?: string;
  script?: object[];
  playerHit1Script?: object[],
  playerHit2Script?: object[],
  playerHit3Script?: object[]
}