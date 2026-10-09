import { cx } from '../ui';
import { Isotipo } from './Isotipo';

/**
 * Logotipo horizontal: isotipo + wordmark "productfindersv" con la "v" final en lima.
 *
 * ⚠️ PROVISIONAL: la guía pide usar el SVG oficial del wordmark y no recomponerlo con fuentes.
 * Mientras no exista ese archivo se aproxima con Space Grotesk; al recibirlo, reemplazar
 * el <span> por el SVG oficial (variante clara y oscura) sin tocar el resto de la app.
 */
export function Logo({ size = 'md', className }: { size?: 'sm' | 'md'; className?: string }) {
  const sm = size === 'sm';
  return (
    <span className={cx('inline-flex items-center gap-2 text-fg', className)} aria-label="ProductFinderSV" role="img">
      <Isotipo size={sm ? 26 : 30} />
      <span
        aria-hidden
        className={cx('font-display leading-none font-bold tracking-[-0.045em]', sm ? 'text-[17px]' : 'text-[19px]')}
      >
        productfinders<span className="text-lime">v</span>
      </span>
    </span>
  );
}
