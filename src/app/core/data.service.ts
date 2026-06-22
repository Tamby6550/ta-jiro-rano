import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AllocationRow, Invoice, Meter, MeterReading } from './models';

/**
 * Accès aux données métier : factures, relevés, et appels aux RPC de calcul.
 * Le CRUD passe par PostgREST (auto-généré) ; la logique de répartition par
 * les fonctions RPC Postgres (atomiques, source de vérité des montants).
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private sb = inject(SupabaseService);

  // ---- Factures ----
  async invoices(propertyId: string): Promise<Invoice[]> {
    const { data, error } = await this.sb.client
      .from('invoices')
      .select('*, billing_periods!inner(label,start_date)')
      .eq('property_id', propertyId)
      .order('billing_date', { ascending: false });
    if (error) throw error;
    return (data as unknown as Invoice[]) ?? [];
  }

  async invoice(id: string): Promise<Invoice | null> {
    const { data } = await this.sb.client.from('invoices').select('*').eq('id', id).single();
    return (data as Invoice) ?? null;
  }

  /** Facture d'un mois (libellé période) pour une énergie donnée. */
  async invoiceForMonth(
    propertyId: string,
    label: string,
    utility: 'electricity' | 'water',
  ): Promise<Invoice | null> {
    const { data } = await this.sb.client
      .from('invoices')
      .select('*, billing_periods!inner(label)')
      .eq('property_id', propertyId)
      .eq('utility', utility)
      .eq('billing_periods.label', label)
      .maybeSingle();
    return (data as unknown as Invoice) ?? null;
  }

  /** Série mensuelle (montants élec/eau) pour le graphe du dashboard. */
  async monthlySeries(propertyId: string): Promise<{ label: string; start: string; elec: number; water: number }[]> {
    const { data } = await this.sb.client
      .from('invoices')
      .select('utility,total_amount, billing_periods!inner(label,start_date)')
      .eq('property_id', propertyId);
    const map = new Map<string, { label: string; start: string; elec: number; water: number }>();
    for (const r of (data as any[]) ?? []) {
      const label = r.billing_periods.label as string;
      const start = r.billing_periods.start_date as string;
      const e = map.get(label) ?? { label, start, elec: 0, water: 0 };
      if (r.utility === 'electricity') e.elec = r.total_amount;
      else e.water = r.total_amount;
      map.set(label, e);
    }
    return [...map.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
  }

  /** Relevé du compteur principal (consommation) pour un mois élec. */
  async mainConsumption(propertyId: string, label: string): Promise<number | null> {
    const { data } = await this.sb.client
      .from('meter_readings')
      .select('consumption, meters!inner(kind,utility), billing_periods!inner(label)')
      .eq('property_id', propertyId)
      .eq('meters.kind', 'main')
      .eq('meters.utility', 'electricity')
      .eq('billing_periods.label', label)
      .maybeSingle();
    return (data as any)?.consumption ?? null;
  }

  // ---- Compteurs partagés (électricité) ----
  /** Sous-compteurs élec avec la/les maison(s) qu'ils desservent. */
  async elecMeterGroups(
    propertyId: string,
  ): Promise<{ meter_id: string; serial: string | null; houses: { id: string; name: string; color: string | null; tenant_name: string | null; position: number }[] }[]> {
    const { data } = await this.sb.client
      .from('meters')
      .select('id, serial, meter_houses(houses(id,name,color,tenant_name,position))')
      .eq('property_id', propertyId)
      .eq('utility', 'electricity')
      .eq('kind', 'sub');
    return ((data as any[]) ?? [])
      .map((m) => ({
        meter_id: m.id,
        serial: m.serial,
        houses: (m.meter_houses ?? [])
          .map((mh: any) => mh.houses)
          .filter(Boolean)
          .sort((a: any, b: any) => a.position - b.position),
      }))
      .filter((g) => g.houses.length > 0)
      .sort((a, b) => a.houses[0].position - b.houses[0].position);
  }

  /** Regroupe des maisons sur un compteur partagé (≥ 2). */
  async setSharedMeter(houseIds: string[], serial?: string): Promise<void> {
    const { error } = await this.sb.client.rpc('set_shared_meter', { p_house_ids: houseIds, p_serial: serial ?? null });
    if (error) throw error;
  }

  /** Sépare un compteur partagé en compteurs individuels. */
  async splitSharedMeter(meterId: string): Promise<void> {
    const { error } = await this.sb.client.rpc('split_shared_meter', { p_meter_id: meterId });
    if (error) throw error;
  }

  // ---- Compteurs & relevés ----
  async meters(propertyId: string, utility: 'electricity' | 'water'): Promise<Meter[]> {
    const { data } = await this.sb.client
      .from('meters')
      .select('*')
      .eq('property_id', propertyId)
      .eq('utility', utility);
    return (data as Meter[]) ?? [];
  }

  async readings(periodId: string): Promise<MeterReading[]> {
    const { data } = await this.sb.client.from('meter_readings').select('*').eq('period_id', periodId);
    return (data as MeterReading[]) ?? [];
  }

  /** Historique des relevés (meter_id, new_index, date de début de période)
   *  pour une énergie — sert à pré-remplir l'ancien index du mois courant
   *  avec le nouvel index du mois précédent (chaînage des compteurs). */
  async meterHistory(
    propertyId: string,
    utility: 'electricity' | 'water',
  ): Promise<{ meter_id: string; new_index: number; start: string }[]> {
    const { data } = await this.sb.client
      .from('meter_readings')
      .select('meter_id, new_index, billing_periods!inner(start_date), meters!inner(utility,property_id)')
      .eq('meters.property_id', propertyId)
      .eq('meters.utility', utility);
    return ((data as any[]) ?? []).map((r) => ({
      meter_id: r.meter_id,
      new_index: r.new_index,
      start: r.billing_periods.start_date,
    }));
  }

  /** Upsert d'un relevé (ancien/nouvel index, photo optionnelle). */
  async saveReading(r: Partial<MeterReading>): Promise<void> {
    const { error } = await this.sb.client
      .from('meter_readings')
      .upsert(r, { onConflict: 'meter_id,period_id' });
    if (error) throw error;
  }

  // ---- RPC : moteur de calcul ----
  /** Calcule + persiste la répartition d'une facture, renvoie les lignes. */
  async computeAllocations(invoiceId: string): Promise<AllocationRow[]> {
    const { data, error } = await this.sb.client.rpc('compute_invoice_allocations', {
      p_invoice_id: invoiceId,
    });
    if (error) throw error;
    return (data as AllocationRow[]) ?? [];
  }

  /** Lit la répartition déjà calculée (lecture seule, pour locataires). */
  async allocations(invoiceId: string): Promise<AllocationRow[]> {
    const { data, error } = await this.sb.client.rpc('get_invoice_allocations', {
      p_invoice_id: invoiceId,
    });
    if (error) throw error;
    return (data as AllocationRow[]) ?? [];
  }

  // ---- Storage ----
  /** URL signée temporaire pour afficher une photo privée. */
  async signedUrl(bucket: string, path: string, seconds = 3600): Promise<string | null> {
    const { data } = await this.sb.client.storage.from(bucket).createSignedUrl(path, seconds);
    return data?.signedUrl ?? null;
  }

  async upload(bucket: string, path: string, file: File): Promise<void> {
    const { error } = await this.sb.client.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
  }
}
