/** Stroke icons (inherit currentColor), decorative by default (aria-hidden). */
const P: Record<string, string> = {
  markets: 'M3 17l4-5 4 3 5-7 5 4M3 21h18',
  crypto: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-2.5 5h4a2 2 0 0 1 0 4h-4m0 0h4.5a2 2 0 0 1 0 4H9.5M9.5 8v8',
  stocks: 'M4 19V9M10 19V5M16 19v-7M22 19V8',
  indices: 'M3 3v18h18M7 15l4-4 3 3 6-7',
  forex: 'M7 7h11l-3-3M17 17H6l3 3',
  commodities: 'M12 3 4 8l8 5 8-5-8-5zM4 16l8 5 8-5M4 12l8 5 8-5',
  finance: 'M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15v4M3 5v14a2 2 0 0 0 2 2h15v-5M18 12a2 2 0 0 0 0 4h4v-4z',
  pnl: 'M3 12h4l3-8 4 16 3-8h4',
  shield: 'M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3z',
  star: 'm12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.8l-5.3 2.3 1-5.8-4.2-4.1 5.9-.9L12 3z',
  activity: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 3',
  ai: 'M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4zM9 13h.01M15 13h.01',
  ventures: 'M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0',
  lock: 'M4 11h16v10H4zM8 11V7a4 4 0 0 1 8 0v4',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  support: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  code: 'M8 6l-6 6 6 6M16 6l6 6-6 6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};

export function Icon({ name, size = 18, label }: { name: string; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <path d={P[name] ?? P.more} />
    </svg>
  );
}
