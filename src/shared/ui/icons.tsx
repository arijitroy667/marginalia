import type { SVGProps } from 'react';

/** Minimal inline icons (24px grid, stroke = currentColor); decorative unless given a title. */
function Icon({ d, ...p }: SVGProps<SVGSVGElement> & { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d={d} />
    </svg>
  );
}

export const ThemeIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" {...p} />;
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M5 12l5 5L20 7" {...p} />;
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M6 6l12 12M18 6L6 18" {...p} />;
