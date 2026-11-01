import { Typography } from 'antd';
import { useI18n } from '@/i18n/I18n';
import { getBackgroundCompatibility, type BackgroundIssue } from '../../../../../shared/events/backgroundCompatibility';

export function backgroundIssueText(issue: BackgroundIssue, t: (key: string, params?: any) => string): string {
  return t(`events.bgCompatibility.${issue.code}`, { scene: issue.scene ?? '', layer: issue.layer, image: issue.image ?? '', count: issue.count ?? 0 });
}

export default function BackgroundCompatibilityNotice({ args }: { args?: Record<string, any> }) {
  const { t } = useI18n();
  const result = getBackgroundCompatibility(args);
  if (!result) return null;
  if (result.issues.length) return null; // The event header owns the warning tooltip.
  if (result.count !== undefined) return <Typography.Paragraph type="success">{t(result.affine === false ? 'events.bgCompatibility.compatibleRegular' : 'events.bgCompatibility.compatible', { image: result.image ?? '', count: result.count })}</Typography.Paragraph>;
  if (result.affine === false) return <Typography.Paragraph type="secondary">{t('events.bgCompatibility.bitmap')}</Typography.Paragraph>;
  return null;
}
