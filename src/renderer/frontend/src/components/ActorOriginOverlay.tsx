import { theme } from 'antd';

/** Origin canvas shown in the sprite editor. */
export default function ActorOriginOverlay({ left, top, width = 16, height = 8, testId }: { left: number; top: number; width?: number; height?: number; testId?: string }) {
  const { token } = theme.useToken();
  return <span aria-label="Canvas origin 16x8 preview" data-testid={testId} style={{ position: 'absolute', left, top, width, height, boxSizing: 'border-box', border: `1px dashed ${token.colorWarning}`, background: token.colorWarningBg, opacity: .45, pointerEvents: 'none', zIndex: 6 }} />;
}
