export function themeSvgForDisplay(svg: string, isDark: boolean): string {
  if (!isDark) return svg;

  return svg
    .replace(/#0F172A/gi, '#F1F5F9')
    .replace(/rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/gi, '#F1F5F9')
    .replace(/#64748B/gi, '#94A3B8')
    .replace(/#2563EB/gi, '#60A5FA')
    .replace(/rgb\(\s*48\s*,\s*80\s*,\s*248\s*\)/gi, '#60A5FA')
    .replace(/#DC2626/gi, '#F87171')
    .replace(/rgb\(\s*255\s*,\s*13\s*,\s*13\s*\)/gi, '#F87171')
    .replace(/rgb\(\s*160\s*,\s*0\s*,\s*0\s*\)/gi, '#F87171')
    .replace(/#D97706/gi, '#FBBF24')
    .replace(/#059669/gi, '#34D399')
    .replace(/#EA580C/gi, '#FB923C');
}
