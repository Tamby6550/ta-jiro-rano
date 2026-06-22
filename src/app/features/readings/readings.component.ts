import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import imageCompression from 'browser-image-compression';
import { DataService } from '../../core/data.service';
import { PropertyStore } from '../../core/property.store';
import { I18nService } from '../../core/i18n.service';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService } from '../../core/auth.service';
import { House, Invoice, Meter, MeterReading, Utility } from '../../core/models';
import { ConsumptionPipe } from '../../shared/format.pipes';
import { SpinnerComponent } from '../../shared/spinner.component';

interface RowHouse { id: string; name: string; color: string | null; tenant_name: string | null; position: number; }
// Une ligne de saisie = UN sous-compteur, qui dessert 1 maison ou plusieurs (partagé).
interface Row { meter_id: string; serial: string | null; houses: RowHouse[]; old_index: number; new_index: number; photo_path: string | null; }

@Component({
  selector: 'tjr-readings',
  standalone: true,
  imports: [FormsModule, ConsumptionPipe, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) { <tjr-spinner /> }
    <header class="head">
      <h1 class="page-title">{{ t().nav_readings }}</h1>
      <div class="page-subtitle">Relevez l'index de chaque sous-compteur</div>
    </header>

    <div class="card pad selectors">
      <div>
        <label class="field-label">{{ t().bill_month }}</label>
        <select class="input" [value]="month()" (change)="month.set($any($event.target).value)">
          @for (m of store.months(); track m.label) { <option [value]="m.label">{{ m.label }}</option> }
        </select>
      </div>
      <div>
        <label class="field-label">{{ t().reading_type }}</label>
        <div class="segmented">
          <button [class.active]="utility() === 'electricity'" (click)="utility.set('electricity')">⚡ {{ t().electricity }}</button>
          <button [class.active]="utility() === 'water'" (click)="utility.set('water')">💧 {{ t().water }}</button>
        </div>
      </div>
      <div style="margin-left:auto">
        <button class="btn btn-ghost" (click)="openNewMonth()">+ Nouveau mois</button>
      </div>
    </div>

    <!-- Dates de la facture (présentation + limite de paiement) -->
    <div class="card pad dates-card">
      <div><label class="field-label">Date de présentation</label><input class="input" type="date" [(ngModel)]="billingDate" /></div>
      <div><label class="field-label">Date limite de paiement</label><input class="input" type="date" [(ngModel)]="dueDate" /></div>
      <div class="hint muted">Ces dates apparaissent sur la facture, le récapitulatif et le lien locataire.</div>
    </div>

    @if (utility() === 'electricity') {
      <!-- Compteur principal -->
      <div class="card pad main-card">
        <div class="main-head">
          <div class="card-title">⚡ Compteur principal JIRAMA</div>
          <div class="segmented">
            <button [class.active]="!estimating()" (click)="estimating.set(false)">Relevé index</button>
            <button [class.active]="estimating()" (click)="estimating.set(true)">Estimation (NR)</button>
          </div>
        </div>
        @if (!estimating()) {
          <div class="main-grid">
            <div><label class="field-label">{{ t().old_index }}</label><input class="input" type="number" [(ngModel)]="mainOld" /></div>
            <span class="arrow">→</span>
            <div><label class="field-label">{{ t().new_index }}</label><input class="input" type="number" [(ngModel)]="mainNew" /></div>
            <div class="conso-main">
              <div class="field-label">Consommation relevée</div>
              <div class="big-conso">{{ (mainNew - mainOld) | conso: 'electricity' }}</div>
            </div>
          </div>
        } @else {
          <div class="main-grid">
            <div><label class="field-label">Consommation totale estimée (kWh)</label>
              <input class="input" type="number" [(ngModel)]="estimatedConso" placeholder="204" /></div>
            <div class="conso-main">
              <div class="field-label">Estimée · NR</div>
              <div class="big-conso">{{ estimatedConso | conso: 'electricity' }}</div>
            </div>
          </div>
          <div class="hint muted">JIRAMA n'a pas relevé l'index (NR). La facture sera marquée « ESTIMÉE ». Tes sous-compteurs restent relevés normalement ci-dessous.</div>
        }
      </div>

      <!-- Sous-compteurs -->
      <div class="card pad">
        <div class="card-title">Index des sous-compteurs · {{ month() }}</div>
        <div class="thead">
          <span>{{ t().nav_houses }}</span><span>{{ t().old_index }}</span>
          <span>{{ t().new_index }}</span><span>{{ t().consumption }}</span><span>{{ t().proof }}</span>
        </div>
        @for (r of rows(); track r.meter_id) {
          <div class="trow">
            <div class="house">
              @for (h of r.houses; track h.id) { <span class="hbadge" [style.background]="h.color">{{ h.name.slice(-1) }}</span> }
              <div><b>{{ r.houses.length > 1 ? '🔗 Compteur partagé' : r.houses[0].name }}</b>
                <div class="muted">{{ houseSub(r) }}</div></div></div>
            <input class="input small" type="number" [(ngModel)]="r.old_index" />
            <input class="input small" type="number" [(ngModel)]="r.new_index" />
            <div class="mono elec">{{ (r.new_index - r.old_index) | conso: 'electricity' }}</div>
            <label class="photo-btn">📷 {{ t().meter_photo }}
              <input type="file" accept="image/*" hidden (change)="onPhoto(r, $event)" /></label>
          </div>
        }

        <div class="footer">
          <div><div class="field-label">{{ t().sub_meters_sum }}</div><div class="mono fval">{{ sumSub() | conso: 'electricity' }}</div></div>
          <div><div class="field-label">{{ estimating() ? 'Principal (estimé)' : t().main_meter }}</div><div class="mono fval">{{ principalConso() | conso: 'electricity' }}</div></div>
          <div><div class="field-label">{{ t().detected_gap }}</div><div class="mono fval loss">{{ gap() | conso: 'electricity' }}</div></div>
          <div class="grow"></div>
          <div class="amount-box">
            <label class="field-label">Montant facturé (Ar)</label>
            <input class="input" type="number" [(ngModel)]="amount" placeholder="462000" />
          </div>
          <button class="btn btn-dark" [disabled]="busy()" (click)="validate()">{{ busy() ? t().loading : t().validate_reading }}</button>
        </div>
      </div>
    } @else {
      <!-- Eau : prorata occupants -->
      <div class="card pad">
        <div class="card-title">💧 Occupants par maison (répartition eau)</div>
        <div class="card-sub muted">L'eau est répartie au prorata du nombre d'occupants. Mettez à jour les occupants puis saisissez le montant.</div>
        <label class="estim-chk"><input type="checkbox" [(ngModel)]="waterEstimated" /> Facture estimée par JIRAMA (NR)</label>
        @if (waterEstimated) {
          <div class="estim-row"><label class="field-label">Consommation totale estimée (m³)</label>
            <input class="input small" type="number" [(ngModel)]="waterEstimatedConso" placeholder="1" /></div>
        }
        @for (h of store.houses(); track h.id) {
          <div class="occ-row"><span><span class="dot" [style.background]="h.color"></span><b>{{ h.name }}</b> · <span class="muted">{{ h.tenant_name }}</span></span>
            <input class="input small" type="number" [(ngModel)]="occ[h.id]" /></div>
        }
        <div class="footer">
          <div class="amount-box"><label class="field-label">Montant facturé (Ar)</label>
            <input class="input" type="number" [(ngModel)]="amount" placeholder="96000" /></div>
          <div class="grow"></div>
          <button class="btn btn-water" [disabled]="busy()" (click)="validateWater()">{{ busy() ? t().loading : t().validate_reading }}</button>
        </div>
      </div>
    }

    @if (msg(); as m) {
      <div class="toast" [class.toast-ok]="m.ok" [class.toast-err]="!m.ok">{{ m.text }}</div>
    }

    @if (showNewMonth()) {
      <div class="overlay" (click)="showNewMonth.set(false)">
        <div class="card modal pad" (click)="$event.stopPropagation()">
          <h3>Nouveau mois</h3>
          <label class="field-label">Libellé du mois</label>
          <input class="input" [(ngModel)]="nm.label" placeholder="Juillet 2026" />
          <div class="two">
            <div><label class="field-label">⚡ Début période</label><input class="input" type="date" [(ngModel)]="nm.eStart" /></div>
            <div><label class="field-label">⚡ Fin période</label><input class="input" type="date" [(ngModel)]="nm.eEnd" /></div>
          </div>
          <div class="two">
            <div><label class="field-label">💧 Début période</label><input class="input" type="date" [(ngModel)]="nm.wStart" /></div>
            <div><label class="field-label">💧 Fin période</label><input class="input" type="date" [(ngModel)]="nm.wEnd" /></div>
          </div>
          <div class="actions">
            <button class="btn btn-ghost" (click)="showNewMonth.set(false)">Annuler</button>
            <button class="btn btn-dark" [disabled]="busy()" (click)="createMonth()">{{ busy() ? t().loading : 'Créer le mois' }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .head { margin:6px 0 18px; }
    .pad { padding:20px; } .card { margin-bottom:16px; }
    .selectors { display:flex; gap:30px; align-items:flex-end; }
    .dates-card { display:flex; gap:24px; align-items:flex-end; flex-wrap:wrap; }
    .dates-card > div:first-child, .dates-card > div:nth-child(2) { min-width:200px; }
    .main-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
    .hint { font-size:12.5px; margin-top:10px; }
    .estim-chk { display:inline-flex; align-items:center; gap:8px; font-size:13.5px; margin-bottom:10px; cursor:pointer; }
    .estim-row { margin-bottom:12px; }
    .card-title { font-family:var(--font-display); font-weight:600; font-size:16px; margin-bottom:14px; }
    .card-sub { margin-bottom:14px; font-size:13px; }
    .main-card { border-left:3px solid var(--elec); }
    .main-grid { display:flex; align-items:flex-end; gap:18px; }
    .main-grid > div { min-width:150px; } .arrow { color:var(--muted-3); padding-bottom:10px; }
    .conso-main { margin-left:auto; text-align:right; }
    .big-conso { font-family:var(--font-mono); font-size:26px; color:var(--elec); font-weight:600; }
    .thead, .trow { display:grid; grid-template-columns:2fr 1fr 1.1fr 1fr 1.2fr; gap:14px; align-items:center; }
    .thead { font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:var(--muted-2); font-weight:600; padding-bottom:10px; border-bottom:1px solid var(--border); }
    .trow { padding:14px 0; border-bottom:1px solid var(--border); }
    .house { display:flex; align-items:center; gap:11px; }
    .hbadge { width:34px; height:34px; border-radius:9px; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-family:var(--font-display); }
    .muted { color:var(--muted); font-size:12.5px; }
    .small { max-width:130px; } .elec { color:var(--elec); font-weight:600; }
    .photo-btn { border:1px solid var(--border); border-radius:var(--r-md); padding:8px 12px; font-size:12.5px; cursor:pointer; color:var(--muted); width:max-content; }
    .footer { display:flex; align-items:flex-end; gap:26px; margin-top:18px; padding-top:16px; }
    .fval { font-size:18px; font-weight:600; } .loss { color:var(--elec); }
    .grow { flex:1; } .amount-box { min-width:170px; }
    .occ-row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border); }
    .toast { position:fixed; bottom:24px; right:24px; color:#fff; padding:12px 18px; border-radius:var(--r-lg); box-shadow:var(--shadow-md); font-weight:600; }
    .toast-ok { background:var(--success); }
    .toast-err { background:var(--danger); }
    .overlay { position:fixed; inset:0; background:#0e162688; display:flex; align-items:center; justify-content:center; z-index:50; }
    .modal { width:460px; max-width:92vw; } .modal h3 { margin-bottom:14px; }
    .modal .input { margin-bottom:12px; } .modal .two { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .modal .actions { display:flex; justify-content:flex-end; gap:10px; margin-top:8px; }
  `],
})
export class ReadingsComponent {
  private data = inject(DataService);
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  store = inject(PropertyStore);
  private i18n = inject(I18nService);
  readonly t = this.i18n.t;

  month = signal<string>('');
  utility = signal<Utility>('electricity');
  rows = signal<Row[]>([]);
  mainOld = 0; mainNew = 0; amount = 0;
  estimating = signal(false);   // élec : index ou estimation (NR)
  estimatedConso = 0;
  billingDate = ''; dueDate = '';
  waterEstimated = false; waterEstimatedConso = 0;
  occ: Record<string, number> = {};
  busy = signal(false);
  loading = signal(false);
  msg = signal<{ text: string; ok: boolean } | null>(null);

  // Création d'un nouveau mois (périodes élec + eau) — pas d'autre UI pour ça.
  showNewMonth = signal(false);
  nm = { label: '', eStart: '', eEnd: '', wStart: '', wEnd: '' };

  // Méthodes (pas computed) : ngModel mute des objets Row sans changer le signal
  // rows(), donc un computed mémoïsé ne se rafraîchirait pas. Appelées à chaque CD.
  sumSub(): number { return this.rows().reduce((s, r) => s + (r.new_index - r.old_index), 0); }
  /** Conso du principal : valeur estimée si NR, sinon (nouvel - ancien) index. */
  principalConso(): number { return this.estimating() ? this.estimatedConso : (this.mainNew - this.mainOld); }
  gap(): number { return this.principalConso() - this.sumSub(); }

  /** Sous-titre d'une ligne : noms des maisons (si partagé) sinon le locataire. */
  houseSub(r: Row): string {
    return r.houses.length > 1
      ? r.houses.map((h) => h.name).join(' + ')
      : (r.houses[0]?.tenant_name ?? '');
  }

  constructor() {
    effect(() => { if (!this.month() && this.store.months().length) this.month.set(this.store.months()[0].label); });
    effect(() => {
      const p = this.store.currentPropertyId(); const m = this.month(); const u = this.utility();
      if (p && m) this.load(p, m, u);
    });
    effect(() => { for (const h of this.store.houses()) if (this.occ[h.id] === undefined) this.occ[h.id] = h.occupants_count; });
  }

  private async load(propertyId: string, label: string, utility: Utility): Promise<void> {
    if (utility !== 'electricity') {
      // Eau : pas d'index ; on prérenseigne juste montant, dates, estimation.
      this.loading.set(false);
      const wInv = await this.data.invoiceForMonth(propertyId, label, 'water');
      this.amount = wInv?.total_amount ?? 0;
      this.waterEstimated = wInv?.is_estimated ?? false;
      this.waterEstimatedConso = wInv?.estimated_consumption ?? 0;
      this.applyDates(wInv, label, 'water');
      return;
    }
    this.loading.set(true);
    const period = this.store.periodFor(label, 'electricity');
    const [meters, readings, inv, hist, groups] = await Promise.all([
      this.data.meters(propertyId, 'electricity'),
      period ? this.data.readings(period.id) : Promise.resolve([] as MeterReading[]),
      this.data.invoiceForMonth(propertyId, label, 'electricity'),
      this.data.meterHistory(propertyId, 'electricity'),
      this.data.elecMeterGroups(propertyId),
    ]);
    const byMeter = new Map(readings.map((r) => [r.meter_id, r]));
    const start = period?.start_date ?? '';

    // Ancien index par défaut = nouvel index du relevé précédent (chaînage).
    // S'il n'y a aucun mois antérieur (nouveau compteur / locataire) → 0, éditable.
    const prevNew = (meterId: string): number | null => {
      const past = hist
        .filter((h) => h.meter_id === meterId && (!start || h.start < start))
        .sort((a, b) => (a.start < b.start ? 1 : -1));
      return past.length ? past[0].new_index : null;
    };

    const main = meters.find((m) => m.kind === 'main');
    if (main) {
      const mr = byMeter.get(main.id);
      this.mainOld = mr?.old_index ?? prevNew(main.id) ?? 0;
      this.mainNew = mr?.new_index ?? this.mainOld;
    }
    this.amount = inv?.total_amount ?? 0;
    this.estimating.set(inv?.is_estimated ?? false);
    this.estimatedConso = inv?.estimated_consumption ?? 0;
    this.applyDates(inv, label, 'electricity');
    // Une ligne par sous-compteur élec (avec sa/ses maison(s)).
    this.rows.set(
      groups.map((g) => {
        const r = byMeter.get(g.meter_id);
        const old = r?.old_index ?? prevNew(g.meter_id) ?? 0;
        return { meter_id: g.meter_id, serial: g.serial, houses: g.houses, old_index: old, new_index: r?.new_index ?? old, photo_path: r?.photo_path ?? null };
      }),
    );
    this.loading.set(false);
  }

  async onPhoto(r: Row, ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1280 });
    const period = this.store.periodFor(this.month(), 'electricity');
    const path = `${this.store.currentPropertyId()}/${period?.id}/${r.meter_id}-${Date.now()}.jpg`;
    await this.data.upload('meter-photos', path, new File([compressed], 'm.jpg', { type: 'image/jpeg' }));
    r.photo_path = path;
    this.flash('Photo enregistrée');
  }

  async validate(): Promise<void> {
    const p = this.store.currentPropertyId(); const period = this.store.periodFor(this.month(), 'electricity');
    if (!p || !period) return;
    this.busy.set(true);
    try {
      // En mode estimation (NR), pas d'index principal à enregistrer.
      if (!this.estimating()) {
        const meters = await this.data.meters(p, 'electricity');
        const main = meters.find((m) => m.kind === 'main')!;
        await this.data.saveReading({ property_id: p, meter_id: main.id, period_id: period.id, old_index: this.mainOld, new_index: this.mainNew });
      }
      for (const r of this.rows()) {
        await this.data.saveReading({ property_id: p, meter_id: r.meter_id, period_id: period.id, old_index: r.old_index, new_index: r.new_index, photo_path: r.photo_path });
      }
      await this.upsertInvoiceAndCompute(p, period.id, 'electricity');
      this.flash('Relevé validé et répartition calculée ✓');
    } catch (e: any) { this.flash('Erreur : ' + (e.message ?? e), false); }
    finally { this.busy.set(false); }
  }

  async validateWater(): Promise<void> {
    const p = this.store.currentPropertyId(); const period = this.store.periodFor(this.month(), 'water');
    if (!p || !period) return;
    this.busy.set(true);
    try {
      for (const h of this.store.houses()) {
        await this.sb.client.from('houses').update({ occupants_count: this.occ[h.id] }).eq('id', h.id);
      }
      await this.upsertInvoiceAndCompute(p, period.id, 'water');
      await this.store.selectProperty(p); // recharge occupants
      this.flash('Répartition eau calculée ✓');
    } catch (e: any) { this.flash('Erreur : ' + (e.message ?? e), false); }
    finally { this.busy.set(false); }
  }

  private async upsertInvoiceAndCompute(propertyId: string, periodId: string, utility: Utility): Promise<void> {
    const [yy, mm] = this.monthCode();
    const number = `JRM-${yy}-${mm}-${utility === 'electricity' ? 'ELEC' : 'EAU'}`;
    const existing = await this.data.invoiceForMonth(propertyId, this.month(), utility);
    const today = new Date().toISOString().slice(0, 10);
    const isEstimated = utility === 'electricity' ? this.estimating() : this.waterEstimated;
    const estConso = utility === 'electricity'
      ? (this.estimating() ? this.estimatedConso : null)
      : (this.waterEstimated ? this.waterEstimatedConso : null);
    const payload = {
      property_id: propertyId, period_id: periodId, utility, number,
      total_amount: this.amount,
      billing_date: this.billingDate || existing?.billing_date || today,
      due_date: this.dueDate || existing?.due_date || today,
      status: existing?.status ?? 'pending',
      is_estimated: isEstimated,
      estimated_consumption: estConso,
      ...(existing ? { id: existing.id } : {}),
    };
    const { data: inv, error } = await this.sb.client.from('invoices').upsert(payload).select('id').single();
    if (error) throw error;
    await this.data.computeAllocations((inv as any).id);
  }

  /** Pré-remplit les dates de facture (depuis la facture existante ou par défaut). */
  private applyDates(inv: Invoice | null, label: string, utility: 'electricity' | 'water'): void {
    if (inv) { this.billingDate = inv.billing_date; this.dueDate = inv.due_date; return; }
    const period = this.store.periodFor(label, utility);
    const base = period?.end_date ?? new Date().toISOString().slice(0, 10);
    this.billingDate = base;
    this.dueDate = new Date(new Date(base).getTime() + 12 * 864e5).toISOString().slice(0, 10);
  }

  private monthCode(): [string, string] {
    const m = this.store.periodFor(this.month(), this.utility());
    const d = m?.start_date ? new Date(m.start_date) : new Date();
    // mois = fin de période (la facture porte le mois courant, pas le mois de début)
    const end = m?.end_date ? new Date(m.end_date) : d;
    return [String(end.getFullYear()), String(end.getMonth() + 1).padStart(2, '0')];
  }

  /** Pré-remplit le formulaire « Nouveau mois » avec des dates par défaut. */
  openNewMonth(): void {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();
    const start = new Date(today.getTime() - 30 * 864e5);
    this.nm = { label: '', eStart: iso(start), eEnd: iso(today), wStart: iso(start), wEnd: iso(today) };
    this.showNewMonth.set(true);
  }

  /** Crée les deux périodes (élec + eau) du nouveau mois, puis le sélectionne. */
  async createMonth(): Promise<void> {
    const p = this.store.currentPropertyId();
    if (!p || !this.nm.label.trim()) { this.flash('Indique un libellé de mois.', false); return; }
    this.busy.set(true);
    try {
      const { error } = await this.sb.client.from('billing_periods').insert([
        { property_id: p, utility: 'electricity', label: this.nm.label.trim(), start_date: this.nm.eStart, end_date: this.nm.eEnd },
        { property_id: p, utility: 'water', label: this.nm.label.trim(), start_date: this.nm.wStart, end_date: this.nm.wEnd },
      ]);
      if (error) throw error;
      await this.store.selectProperty(p);     // recharge la liste des mois
      this.month.set(this.nm.label.trim());   // sélectionne le nouveau mois
      this.showNewMonth.set(false);
      this.flash('Mois créé ✓');
    } catch (e: any) { this.flash('Erreur : ' + (e.message ?? e), false); }
    finally { this.busy.set(false); }
  }

  private flash(text: string, ok = true): void {
    this.msg.set({ text, ok });
    setTimeout(() => this.msg.set(null), 3500);
  }
}
