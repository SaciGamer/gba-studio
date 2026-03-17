export enum EEvents {
    DISPLAY_DIALOGUE = 'EVENT_DISPLAY_DIALOGUE',
    SHOW_MENU = 'EVENT_SHOW_MENU',
    HIDE_MENU = 'EVENT_HIDE_MENU',
    MOVE_ACTOR = 'EVENT_MOVE_ACTOR',
    JUMP_ACTOR = 'EVENT_JUMP_ACTOR',
    CHANGE_SPRITE = 'EVENT_CHANGE_SPRITE',
    CHANGE_COSTUME = 'EVENT_CHANGE_COSTUME',
    PAN_CAMERA = 'EVENT_PAN_CAMERA',
    ZOOM = 'EVENT_ZOOM',
    ROTATE_CAMERA = 'EVENT_ROTATE_CAMERA',
    CHANGE_SCENE = 'EVENT_CHANGE_SCENE',
    REPLC_TL_AT_POS = 'EVENT_REPLC_TL_AT_POSITION',
    REPLC_TL_AT_POS_FROM_SQNCE = 'EVENT_REPLC_TL_AT_POSITION_F_SQNCE',
    FADE_IN = 'EVENT_FADE_IN',
    FADE_OUT = 'EVENT_FADE_OUT',
    WAIT = 'EVENT_WAIT',
    IDLE = 'EVENT_IDLE',

}

export const EVENT_INFO: Record<EEvents, { name: string }> = {
  [EEvents.CHANGE_SCENE]: { name: 'Change Scene' },
  [EEvents.DISPLAY_DIALOGUE]: { name: 'Display Dialogue' },
  [EEvents.SHOW_MENU]: { name: 'Show Menu' },
  [EEvents.HIDE_MENU]: { name: 'Hide Menu' },
  [EEvents.MOVE_ACTOR]: { name: 'Actor: Move Actor' },
  [EEvents.JUMP_ACTOR]: { name: 'Actor: Jump Actor' },
  [EEvents.CHANGE_SPRITE]: { name: 'Change Sprite' },
  [EEvents.CHANGE_COSTUME]: { name: 'Change Costume' },
  [EEvents.PAN_CAMERA]: { name: 'Pan Camera' },
  [EEvents.ZOOM]: { name: 'Zoom' },
  [EEvents.ROTATE_CAMERA]: { name: 'Rotate Camera' },
  [EEvents.REPLC_TL_AT_POS]: { name: 'Replace Tile at Position' },
  [EEvents.REPLC_TL_AT_POS_FROM_SQNCE]: { name: 'Replace Tile at Position From Sequence' },
  [EEvents.FADE_IN]: { name: 'Fade In' },
  [EEvents.FADE_OUT]: { name: 'Fade Out' },
  [EEvents.WAIT]: { name: 'Wait' },
  [EEvents.IDLE]: { name: 'Idle' },

}

export interface IEventsSelect {
  id: EEvents;
  name: string;
}