import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { BillingPeriod, House, Property } from './models';

/**
 * État partagé multi-propriétaires + période courante.
 * Pourquoi un store : le sélecteur de propriété (UI multi-propriétaires dès v1)
 * et la période sélectionnée sont des dimensions transverses lues par tous les
 * écrans (dashboard, saisie, factures…). Centraliser évite la prop-drilling et
 * garantit une seule source de vérité réactive.
 */
@Injectable({ providedIn: 'root' })
export class PropertyStore {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  readonly properties = signal<Property[]>([]);
  readonly currentPropertyId = signal<string | null>(null);
  readonly houses = signal<House[]>([]);
  readonly periods = signal<BillingPeriod[]>([]);
  readonly currentMonth = signal<string | null>(null); // libellé, ex: "Juin 2026"
  readonly loaded = signal(false);

  readonly currentProperty = computed(() =>
    this.properties().find((p) => p.id === this.currentPropertyId()) ?? null,
  );

  /** Mois distincts (un libellé peut exister pour élec ET eau), triés du + récent. */
  readonly months = computed<{ label: string; start: string }[]>(() => {
    const map = new Map<string, string>();
    for (const p of this.periods()) {
      const prev = map.get(p.label);
      if (!prev || p.start_date > prev) map.set(p.label, p.start_date);
    }
    return [...map.entries()]
      .map(([label, start]) => ({ label, start }))
      .sort((a, b) => (a.start < b.start ? 1 : -1));
  });

  /** Période (élec ou eau) correspondant au mois courant. */
  periodFor(label: string, utility: 'electricity' | 'water'): BillingPeriod | null {
    return this.periods().find((p) => p.label === label && p.utility === utility) ?? null;
  }

  readonly currentPeriod = computed(() => {
    const m = this.currentMonth();
    return m ? { label: m } as Partial<BillingPeriod> as BillingPeriod : null;
  });

  /** Charge les propriétés accessibles, puis houses+periods de la courante. */
  async load(): Promise<void> {
    const { data: props } = await this.sb.client
      .from('properties')
      .select('*')
      .order('created_at', { ascending: true });
    this.properties.set((props as Property[]) ?? []);

    // propriété par défaut : celle du profil, sinon la première accessible
    const fromProfile = this.auth.profile()?.property_id ?? null;
    const initial = fromProfile ?? this.properties()[0]?.id ?? null;
    if (initial) await this.selectProperty(initial);
    this.loaded.set(true);
  }

  async selectProperty(propertyId: string): Promise<void> {
    this.currentPropertyId.set(propertyId);
    const [{ data: houses }, { data: periods }] = await Promise.all([
      this.sb.client.from('houses').select('*').eq('property_id', propertyId).order('position'),
      this.sb.client
        .from('billing_periods')
        .select('*')
        .eq('property_id', propertyId)
        .order('start_date', { ascending: false }),
    ]);
    this.houses.set((houses as House[]) ?? []);
    this.periods.set((periods as BillingPeriod[]) ?? []);
    // mois le plus récent par défaut
    this.currentMonth.set(this.months()[0]?.label ?? null);
  }

  selectMonth(label: string): void {
    this.currentMonth.set(label);
  }
}
