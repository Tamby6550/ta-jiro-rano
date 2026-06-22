/**
 * Formatage des montants en Ariary (MGA).
 * Décision produit : entier sans décimale, séparateur de milliers = espace fine.
 * Ex: 167336 -> "167 336 Ar"  (conforme aux maquettes).
 */
export function formatAriary(value: number | null | undefined, withSuffix = true): string {
  if (value === null || value === undefined || Number.isNaN(value)) return withSuffix ? '— Ar' : '—';
  const n = Math.round(value);
  const s = n.toLocaleString('fr-FR').replace(/ |,/g, ' '); // espace insécable -> espace
  return withSuffix ? `${s} Ar` : s;
}

/** Formatage d'une consommation (kWh ou m³ selon l'énergie). */
export function formatConsumption(value: number | null | undefined, utility: 'electricity' | 'water'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const unit = utility === 'electricity' ? 'kWh' : 'm³';
  return `${Math.round(value).toLocaleString('fr-FR').replace(/ |,/g, ' ')} ${unit}`;
}

/** Pourcentage entier pour l'affichage (ex: 0.2998 -> "30%"). */
export function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—';
  return `${Math.round(ratio * 100)}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Date « longue » en français avec le mois en toutes lettres : ex. "10 Juin 2026". */
export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const parts = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).split(' ');
  if (parts.length < 3) return parts.join(' ');
  const [day, month, year] = parts;
  return `${day} ${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`;
}
