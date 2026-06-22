/** Modèles de domaine — alignés sur le schéma Supabase (supabase/migrations). */

export type Role = 'admin' | 'tenant';
export type Utility = 'electricity' | 'water';
export type MeterKind = 'main' | 'sub';
export type InvoiceStatus = 'draft' | 'pending' | 'paid';
export type AllocationStrategy = 'proportional_loss' | 'occupants';

export interface Profile {
  id: string;
  role: Role;
  full_name: string | null;
  property_id: string | null;
  house_id: string | null;
}

export interface Property {
  id: string;
  owner_id: string;
  name: string;
  currency: string; // 'MGA'
  share_token: string; // jeton du lien public locataire
  share_expires_at: string | null; // null = lien sans expiration
  created_at: string;
}

export interface Building {
  id: string;
  property_id: string;
  name: string;
}

export interface House {
  id: string;
  property_id: string;
  building_id: string | null;
  name: string;
  label: string | null;       // ex: "RDC gauche", "Étage", "Annexe"
  tenant_name: string | null; // ex: "Rina R."
  color: string | null;       // accent UI
  occupants_count: number;
  position: number;
}

export interface Meter {
  id: string;
  property_id: string;
  kind: MeterKind;
  utility: Utility;
  house_id: string | null; // null si compteur principal
  serial: string | null;
}

export interface BillingPeriod {
  id: string;
  property_id: string;
  utility: Utility;
  label: string;       // ex: "Juin 2026"
  start_date: string;  // dates RÉELLES, non calendaires
  end_date: string;
}

export interface Invoice {
  id: string;
  property_id: string;
  period_id: string;
  utility: Utility;
  number: string;          // ex: "JRM-2026-06-ELEC"
  total_amount: number;    // Ariary entier
  billing_date: string;
  due_date: string;
  status: InvoiceStatus;
  photo_path: string | null;
  is_estimated: boolean;             // facture estimée par JIRAMA (NR)
  estimated_consumption: number | null; // conso totale estimée (kWh ou m³)
}

export interface MeterReading {
  id: string;
  property_id: string;
  meter_id: string;
  period_id: string;
  old_index: number;
  new_index: number;
  consumption: number;     // colonne générée new-old
  photo_path: string | null;
  ocr_raw: string | null;  // réservé OCR futur
}

export interface Allocation {
  id: string;
  invoice_id: string;
  house_id: string;
  consumption: number;
  adjusted_consumption: number;
  percentage: number;
  loss_share: number;
  amount: number;            // Ariary entier, Σ = total_amount
  strategy: AllocationStrategy;
  manual_override: number | null;
}

/** Ligne enrichie renvoyée par les RPC de calcul (jointe à la maison). */
export interface AllocationRow extends Allocation {
  house_name: string;
  tenant_name: string | null;
  house_color: string | null;
  occupants_count: number;
}
