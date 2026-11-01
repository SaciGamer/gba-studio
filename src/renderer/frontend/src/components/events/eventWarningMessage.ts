import { getMenuLayoutIssues } from '../../../../../shared/menuLayout';
import { getEventPendingFields } from '../../../../../shared/events/eventPendingFields';
import { getEventReferenceWarnings } from '../../../../../shared/events/sceneReferenceCleanup';
import { getBackgroundCompatibility } from '../../../../../shared/events/backgroundCompatibility';
import { countEventAttention, getDisabledFadeIn } from '../../../../../shared/events/eventAttention';
import { backgroundIssueText } from './BackgroundCompatibilityNotice';

export function eventWarningMessage(event: any, t: (key: string, params?: any) => string, events: readonly any[] = [event]): string {
  const children = !event.args?.__comment && countEventAttention([...(event.children?.then ?? []), ...(event.children?.else ?? [])]);
  const disabledFade = getDisabledFadeIn(events);
  return [
    disabledFade && (disabledFade === event || disabledFade.id && disabledFade.id === event.id) ? `${t('events.fadeIn.disabled')} ${t('events.fadeIn.enable')}` : '',
    Object.keys(getEventReferenceWarnings(event.args)).length ? t('events.missingReference') : '',
    getEventPendingFields(event.command, event.args).length ? t('events.pendingInputs') : '',
    ...(getBackgroundCompatibility(event.args)?.issues ?? []).map(issue => backgroundIssueText(issue, t)),
    ...(['EVENT_DIALOGUE_CHOICE', 'EVENT_MENU_OPEN'].includes(event.command) ? getMenuLayoutIssues(event.args ?? {}, event.command === 'EVENT_MENU_OPEN').map(issue => t(`events.menu.${issue.code}`, { index: issue.index ?? '', max: issue.max ?? '' })) : []),
    children ? t('events.hierarchyWarning') : '',
  ].filter(Boolean).join(' ');
}
