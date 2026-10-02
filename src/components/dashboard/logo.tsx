import type { SVGProps } from 'react';

/** A clock face with a coin-coloured hand: shifts → pay. */
export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <circle cx="16" cy="16" r="8.5" stroke="var(--primary-foreground)" strokeWidth="2.2" />
      <path d="M16 11.5V16l3.2 2.2" stroke="var(--primary-foreground)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
