import { pageFilter, THEMES } from './tokens';

/** SVG filters the page canvases reference from CSS (ADR 0002), generated from the theme tokens. */
export function PageFilters() {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <defs>
        {(['warm', 'dark'] as const).map((t) => {
          const [r, g, b] = pageFilter(THEMES[t].pageFg, THEMES[t].pageBg);
          return (
            <filter key={t} id={`mg-page-${t}`} colorInterpolationFilters="sRGB">
              <feComponentTransfer>
                <feFuncR type="linear" intercept={r!.intercept} slope={r!.slope} />
                <feFuncG type="linear" intercept={g!.intercept} slope={g!.slope} />
                <feFuncB type="linear" intercept={b!.intercept} slope={b!.slope} />
              </feComponentTransfer>
            </filter>
          );
        })}
      </defs>
    </svg>
  );
}
