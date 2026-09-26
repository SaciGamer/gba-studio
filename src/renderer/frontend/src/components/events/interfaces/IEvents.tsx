import { EVENT_CATALOG, EVENT_CATALOG_BY_CODE } from '../../../../../../shared/events/eventCatalog';

export enum EEvents {
    DISPLAY_DIALOGUE = 'EVENT_DISPLAY_DIALOGUE',
    DISPLAY_VARIABLE_TEXT = 'EVENT_DISPLAY_VARIABLE_TEXT',
    HIDE_DIALOGUE = 'EVENT_HIDE_DIALOGUE',
    DIALOGUE_CHOICE = 'EVENT_DIALOGUE_CHOICE',
    FOR = 'EVENT_FOR',
    BREAK = 'EVENT_BREAK',
    CONTINUE = 'EVENT_CONTINUE',
    WAIT_FOR_BUTTON = 'EVENT_WAIT_FOR_BUTTON',
    IF_BUTTON_HELD = 'EVENT_IF_BUTTON_HELD',
    SHOW_MENU = 'EVENT_SHOW_MENU',
    HIDE_MENU = 'EVENT_HIDE_MENU',
    MOVE_ACTOR = 'EVENT_MOVE_ACTOR',
    SPAWN_ACTOR = 'EVENT_SPAWN_ACTOR',
    REMOVE_ACTOR = 'EVENT_REMOVE_ACTOR',
    VISIBLE_ACTOR = 'EVENT_VISIBLE_ACTOR',
    HIDE_ACTOR = 'EVENT_HIDE_ACTOR',
    SHOW_ACTOR = 'EVENT_SHOW_ACTOR',
    HIDE_ALL_SPRITES = 'EVENT_HIDE_ALL_SPRITES',
    SHOW_ALL_SPRITES = 'EVENT_SHOW_ALL_SPRITES',
    JUMP_ACTOR = 'EVENT_JUMP_ACTOR',
    CHANGE_SPRITE = 'EVENT_CHANGE_SPRITE',
    CHANGE_COSTUME = 'EVENT_CHANGE_COSTUME',
    PAN_CAMERA = 'EVENT_PAN_CAMERA',
    PLAY_MUSIC = 'EVENT_PLAY_MUSIC',
    PLAY_SOUND = 'EVENT_PLAY_SOUND',
    STOP_MUSIC = 'EVENT_STOP_MUSIC',
    SET_MUSIC_VOLUME = 'EVENT_SET_MUSIC_VOLUME',
    ZOOM = 'EVENT_ZOOM',
    ROTATE_CAMERA = 'EVENT_ROTATE_CAMERA',
    CHANGE_SCENE = 'EVENT_CHANGE_SCENE',
    CHANGE_LAYER = 'EVENT_CHANGE_LAYER',
    VISIBLE_BACKGROUND = 'EVENT_VISIBLE_BACKGROUND',
    CHANGE_PALETTE_BACKGROUND = 'EVENT_CHANGE_PALETTE_BACKGROUND',
    MOVE_LAYER = 'EVENT_MOVE_LAYER',
    REPLC_TL_AT_POS = 'EVENT_REPLC_TL_AT_POSITION',
    REPLC_TL_AT_POS_FROM_SQNCE = 'EVENT_REPLC_TL_AT_POSITION_F_SQNCE',
    FADE_IN = 'EVENT_FADE_IN',
    FADE_OUT = 'EVENT_FADE_OUT',
    FADE_OPTIONS = 'EVENT_FADE_OPTIONS',
    WAIT = 'EVENT_WAIT',
    IF = 'EVENT_IF',
    WHILE = 'EVENT_WHILE',
    VARIABLE = 'EVENT_VARIABLE',
    VARIABLE_RESET_ALL = 'EVENT_VARIABLE_RESET_ALL',
    IDLE = 'EVENT_IDLE',
    SET_ANIMATION_SPEED = 'EVENT_SET_ANIMATION_SPEED',
    SET_ACTOR_PRIORITY = 'EVENT_SET_ACTOR_PRIORITY',
    CALL_SCRIPT = 'EVENT_CALL_SCRIPT',

}

const catalogLabel = (code: string, fallback: string) => EVENT_CATALOG_BY_CODE[code]?.label ?? fallback;

// Keep the legacy enum/API stable while the editor migrates to the catalog.
// This assertion makes an incomplete catalog visible during renderer startup.
for (const definition of EVENT_CATALOG) {
  if (!EVENT_CATALOG_BY_CODE[definition.code]) {
    throw new Error(`Invalid event catalog entry: ${definition.code}`);
  }
}

export const EVENT_INFO: Record<EEvents, { name: string }> = {
  [EEvents.CHANGE_SCENE]: { name: catalogLabel(EEvents.CHANGE_SCENE, 'Change Scene') },
  [EEvents.CHANGE_LAYER]: { name: catalogLabel(EEvents.CHANGE_LAYER, 'Change Background') },
  [EEvents.VISIBLE_BACKGROUND]: { name: catalogLabel(EEvents.VISIBLE_BACKGROUND, 'Visible Background') },
  [EEvents.CHANGE_PALETTE_BACKGROUND]: { name: catalogLabel(EEvents.CHANGE_PALETTE_BACKGROUND, 'Change Palette Background') },
  [EEvents.MOVE_LAYER]: { name: 'Move Background' },
  [EEvents.DISPLAY_DIALOGUE]: { name: 'Display Dialogue' },
  [EEvents.DISPLAY_VARIABLE_TEXT]: { name: catalogLabel(EEvents.DISPLAY_VARIABLE_TEXT, 'Display Variable Text') },
  [EEvents.HIDE_DIALOGUE]: { name: catalogLabel(EEvents.HIDE_DIALOGUE, 'Hide Dialogue') },
  [EEvents.DIALOGUE_CHOICE]: { name: catalogLabel(EEvents.DIALOGUE_CHOICE, 'Dialogue Choice') },
  [EEvents.FOR]: { name: catalogLabel(EEvents.FOR, 'For') },
  [EEvents.BREAK]: { name: catalogLabel(EEvents.BREAK, 'Break Loop') },
  [EEvents.CONTINUE]: { name: catalogLabel(EEvents.CONTINUE, 'Continue Loop') },
  [EEvents.WAIT_FOR_BUTTON]: { name: catalogLabel(EEvents.WAIT_FOR_BUTTON, 'Wait For Button') },
  [EEvents.IF_BUTTON_HELD]: { name: catalogLabel(EEvents.IF_BUTTON_HELD, 'If Button Held') },
  [EEvents.SHOW_MENU]: { name: 'Show Menu' },
  [EEvents.HIDE_MENU]: { name: 'Hide Menu' },
  [EEvents.MOVE_ACTOR]: { name: 'Actor: Move Actor' },
  [EEvents.SPAWN_ACTOR]: { name: catalogLabel(EEvents.SPAWN_ACTOR, 'Spawn Actor') },
  [EEvents.REMOVE_ACTOR]: { name: catalogLabel(EEvents.REMOVE_ACTOR, 'Remove Actor') },
  [EEvents.VISIBLE_ACTOR]: { name: catalogLabel(EEvents.VISIBLE_ACTOR, 'Visible Actor') },
  [EEvents.HIDE_ACTOR]: { name: catalogLabel(EEvents.HIDE_ACTOR, 'Hide Actor') },
  [EEvents.SHOW_ACTOR]: { name: catalogLabel(EEvents.SHOW_ACTOR, 'Show Actor') },
  [EEvents.HIDE_ALL_SPRITES]: { name: catalogLabel(EEvents.HIDE_ALL_SPRITES, 'Hide All Sprites') },
  [EEvents.SHOW_ALL_SPRITES]: { name: catalogLabel(EEvents.SHOW_ALL_SPRITES, 'Show All Sprites') },
  [EEvents.JUMP_ACTOR]: { name: 'Actor: Jump Actor' },
  [EEvents.CHANGE_SPRITE]: { name: 'Change Sprite' },
  [EEvents.CHANGE_COSTUME]: { name: 'Change Costume' },
  [EEvents.PAN_CAMERA]: { name: catalogLabel(EEvents.PAN_CAMERA, 'Pan Camera') },
  [EEvents.PLAY_MUSIC]: { name: catalogLabel(EEvents.PLAY_MUSIC, 'Play Music') },
  [EEvents.PLAY_SOUND]: { name: catalogLabel(EEvents.PLAY_SOUND, 'Play Sound') },
  [EEvents.STOP_MUSIC]: { name: catalogLabel(EEvents.STOP_MUSIC, 'Stop Music') },
  [EEvents.SET_MUSIC_VOLUME]: { name: catalogLabel(EEvents.SET_MUSIC_VOLUME, 'Set Music Volume') },
  [EEvents.ZOOM]: { name: 'Zoom' },
  [EEvents.ROTATE_CAMERA]: { name: 'Rotate Camera' },
  [EEvents.REPLC_TL_AT_POS]: { name: 'Replace Tile at Position' },
  [EEvents.REPLC_TL_AT_POS_FROM_SQNCE]: { name: 'Replace Tile at Position From Sequence' },
  [EEvents.FADE_IN]: { name: catalogLabel(EEvents.FADE_IN, 'Fade In') },
  [EEvents.FADE_OUT]: { name: catalogLabel(EEvents.FADE_OUT, 'Fade Out') },
  [EEvents.FADE_OPTIONS]: { name: catalogLabel(EEvents.FADE_OPTIONS, 'Fade Options') },
  [EEvents.WAIT]: { name: catalogLabel(EEvents.WAIT, 'Wait') },
  [EEvents.IF]: { name: catalogLabel(EEvents.IF, 'If / Else') },
  [EEvents.WHILE]: { name: catalogLabel(EEvents.WHILE, 'While') },
  [EEvents.VARIABLE]: { name: catalogLabel(EEvents.VARIABLE, 'Variable Set to Value') },
  [EEvents.VARIABLE_RESET_ALL]: { name: catalogLabel(EEvents.VARIABLE_RESET_ALL, 'Reset All Variables to Default') },
  [EEvents.IDLE]: { name: 'Idle' },
  [EEvents.SET_ANIMATION_SPEED]: { name: 'Set Animation Speed' },
  [EEvents.SET_ACTOR_PRIORITY]: { name: 'Set Actor Priority' },
  [EEvents.CALL_SCRIPT]: { name: catalogLabel(EEvents.CALL_SCRIPT, 'Call Script') },

}

export interface IEventsSelect {
  id: EEvents;
  name: string;
}
