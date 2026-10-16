import { type Instrument } from '@nexora/contracts';
import { useState } from 'react';
import { CURRENCY_FLAGS, INSTRUMENT_ICONS } from './icons.data';

type Size = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Instrument artwork as in the NEXORA prototype: two overlapping flags for a Forex pair, otherwise the asset icon;
 * without artwork (or if it fails to load) — the first letters of the symbol. Decorative: the symbol is always
 * written next to it.
 */
export function InstrumentIcon({ instrument: i, size = 'sm' }: { instrument: Pick<Instrument, 'symbol' | 'market' | 'baseAsset' | 'quoteAsset'>; size?: Size }) {
  const [broken, setBroken] = useState(false);
  const f1 = CURRENCY_FLAGS[i.baseAsset];
  const f2 = CURRENCY_FLAGS[i.quoteAsset];
  if (!broken && i.market === 'forex' && f1 && f2) {
    return (
      <span className={`ab fx ${size}`} aria-hidden="true">
        <img src={f1} alt="" decoding="async" onError={() => setBroken(true)} />
        <img src={f2} alt="" decoding="async" onError={() => setBroken(true)} />
      </span>
    );
  }
  const src = INSTRUMENT_ICONS[i.symbol];
  return (
    <span className={`ab ${size}`} aria-hidden="true">
      {src && !broken ? <img src={src} alt="" decoding="async" onError={() => setBroken(true)} /> : <span className="fallback">{i.symbol.replace(/[^A-Z0-9]/gi, '').slice(0, 2)}</span>}
    </span>
  );
}
