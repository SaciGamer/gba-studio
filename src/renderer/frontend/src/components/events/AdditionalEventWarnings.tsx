import { Collapse } from 'antd';
import { AttentionLabel } from '../WarningIndicator';
import { useI18n } from '@/i18n/I18n';
import { getAdditionalEventWarnings } from '../../../../../shared/events/eventAttention';
import CollapseEventManager from './CollapseEventManager';

/** Keep every counted event warning reachable, including legacy lists and graph-only nodes. */
export default function AdditionalEventWarnings({ value, visibleFields, onChange }: { value: any; visibleFields: readonly string[]; onChange: (patch: Record<string, unknown>) => void }) {
  const { t } = useI18n();
  const labels: Record<string, string> = { script: t('events.attentionLocation.init'), events: t('events.attentionLocation.script'), onInitScript: t('events.attentionLocation.init'), onInteractScript: t('events.attentionLocation.interact'), onUpdateScript: t('events.attentionLocation.update'), onEnterScript: t('events.attentionLocation.enter'), onLeaveScript: t('events.attentionLocation.leave'), ...Object.fromEntries([1, 2, 3].map(group => [`playerHit${group}Script`, t('events.attentionLocation.hitGroup', { group })])) };
  return <>{getAdditionalEventWarnings(value, visibleFields).map(source => {
    const graph = source.graph ? value.eventGraphs[source.key] : undefined;
    return <Collapse key={`${source.graph}-${source.key}`} size="small" style={{ marginBottom: 8 }} items={[{ key: source.key, label: <AttentionLabel count={source.count} label={<>{source.graph ? `${t('events.picker.flow')} / ` : ''}{labels[source.key] ?? source.key}</>} />, children: <CollapseEventManager storageKey={`warning:${source.graph}:${source.key}`} scripts={graph ? graph.nodes ?? [] : value[source.key] ?? []} onScriptsChange={nodes => {
      if (!graph) { onChange({ [source.key]: nodes }); return; }
      const ids = new Set(nodes.map(node => node.id));
      onChange({ eventGraphs: { ...value.eventGraphs, [source.key]: { ...graph, nodes, edges: (graph.edges ?? []).filter((edge: any) => ids.has(edge.source) && ids.has(edge.target)), entryNodeId: ids.has(graph.entryNodeId) ? graph.entryNodeId : null } } });
    }} /> }]} />;
  })}</>;
}
