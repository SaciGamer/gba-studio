export const getEventDepthColor = (depth: number): string => {
  const hue = (42 + depth * 137.508) % 360;
  return `hsl(${hue} 72% 68%)`;
};
