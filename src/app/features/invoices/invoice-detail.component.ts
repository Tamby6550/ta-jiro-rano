import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { PropertyStore } from '../../core/property.store';
import { I18nService } from '../../core/i18n.service';
import { PdfService } from '../../core/pdf.service';
import { AllocationRow, Invoice } from '../../core/models';
import { AriaryPipe, ConsumptionPipe, FDatePipe } from '../../shared/format.pipes';
import { SpinnerComponent } from '../../shared/spinner.component';

type Tab = 'both' | 'electricity' | 'water';

@Component({
  selector: 'tjr-invoice-detail',
  standalone: true,
  imports: [RouterLink, AriaryPipe, ConsumptionPipe, FDatePipe, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) { <tjr-spinner /> }
    <header class="head">
      <h1 class="page-title">Détail de la facture · {{ month() }}</h1>
      <div class="page-subtitle">Répartition par maison</div>
    </header>

    <div class="tabs">
      <a routerLink="/invoices" class="btn btn-ghost">‹ {{ t().nav_invoices }}</a>
      <div class="segmented">
        <button [class.active]="tab() === 'both'" (click)="tab.set('both')">⚡💧 Élec & Eau</button>
        <button [class.active]="tab() === 'electricity'" (click)="tab.set('electricity')">⚡ {{ t().electricity }}</button>
        <button [class.active]="tab() === 'water'" (click)="tab.set('water')">💧 {{ t().water }}</button>
      </div>
    </div>

    <div class="top">
      <div class="card pad inv-card" [style.border-top-color]="accent()">
        <div class="ic-title">{{ tabTitle() }} · {{ month() }}
          @if (estimated()) { <span class="badge badge-warn" style="margin-left:8px">ESTIMÉE · NR</span> }
        </div>
        @if (tab() === 'both') {
          <div class="two-num">{{ (elec()?.total_amount ?? 0) + (water()?.total_amount ?? 0) ? '2 factures' : '' }}</div>
        }
        <div class="dates">
          @if (tab() !== 'water' && elec()) { <div><span class="field-label">{{ t().issue }}</span><div class="mono">{{ elec()!.billing_date | fdate }}</div></div> }
          @if (tab() !== 'electricity' && water()) { <div><span class="field-label">{{ t().due }}</span><div class="mono">{{ water()!.due_date | fdate }}</div></div> }
          @if (tab() !== 'water' && elec()) { <div><span class="field-label">{{ t().due }}</span><div class="mono">{{ elec()!.due_date | fdate }}</div></div> }
        </div>
      </div>

      <div class="card pad total-card">
        <div class="field-label" style="color:#aab2c0">{{ t().total_billed }}</div>
        <div class="grand mono">{{ grandTotal() | ar }}</div>
        <button class="btn pdf-btn" [style.background]="accent()" (click)="pdf()">↓ {{ t().generate_pdf }}</button>
      </div>
    </div>

    <div class="card pad">
      <div class="card-title">{{ tabTitle() }}</div>
      <div class="thead" [class.three]="tab() === 'both'">
        <span>{{ t().nav_houses }}</span>
        @if (tab() === 'both') { <span class="r">⚡</span><span class="r">💧</span> }
        @else { <span class="r">{{ tab() === 'electricity' ? 'KWH' : t().occupants }}</span><span class="r">{{ t().share }}</span> }
        <span class="r">{{ t().amount_due }}</span>
      </div>
      @for (row of merged(); track row.house_id) {
        <div class="trow" [class.three]="tab() === 'both'">
          <span><span class="dot" [style.background]="row.house_color"></span><b>{{ row.house_name }}</b>
            <span class="muted"> {{ row.tenant_name }}</span></span>
          @if (tab() === 'both') {
            <span class="r mono elec">{{ row.elec | ar }}</span><span class="r mono water">{{ row.water | ar }}</span>
          } @else if (tab() === 'electricity') {
            <span class="r mono muted">{{ row.consumption | conso: 'electricity' }}</span>
            <span class="r"><span class="badge badge-elec">{{ pctTxt(row.percentage) }}</span></span>
          } @else {
            <span class="r mono muted">{{ row.occupants_count }} pers.</span>
            <span class="r"><span class="badge badge-water">{{ pctTxt(row.percentage) }}</span></span>
          }
          <span class="r mono amt">{{ row.amount | ar }}</span>
        </div>
      }
    </div>

    @if (tab() === 'electricity') {
      <div class="stats">
        <div class="card pad st"><div class="field-label">{{ t().sub_meters_sum }}</div><div class="mono sv">{{ sumSub() | conso: 'electricity' }}</div></div>
        <div class="card pad st"><div class="field-label">{{ t().main_meter }}</div><div class="mono sv">{{ mainKwh() | conso: 'electricity' }}</div></div>
        <div class="card pad st loss"><div class="field-label">{{ t().network_loss }}</div><div class="mono sv">{{ loss() | conso: 'electricity' }}</div></div>
        <div class="card pad st"><div class="field-label">Tarif effectif</div><div class="mono sv">{{ rate() }} Ar / kWh</div></div>
      </div>
      <div class="note">ℹ️ Le montant est réparti au prorata des kWh consommés. L'écart entre le compteur principal et la somme des sous-compteurs est redistribué proportionnellement.</div>
    }
  `,
  styles: [`
    .head { margin:6px 0 16px; }
    .tabs { display:flex; gap:10px; margin-bottom:16px; }
    .top { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
    .pad { padding:20px; }
    .inv-card { border-top:3px solid var(--elec); }
    .ic-title { font-family:var(--font-display); font-weight:600; font-size:17px; }
    .two-num { color:var(--muted); font-size:13px; margin-top:4px; }
    .dates { display:flex; gap:30px; margin-top:16px; } .dates .mono { font-size:14px; }
    .total-card { background:var(--side-bg); color:#fff; display:flex; flex-direction:column; }
    .grand { font-size:34px; font-weight:600; margin:6px 0 16px; }
    .pdf-btn { color:#1c1206; font-weight:600; justify-content:center; }
    .card-title { font-family:var(--font-display); font-weight:600; font-size:16px; margin-bottom:14px; }
    .thead, .trow { display:grid; grid-template-columns:2fr 1fr 1fr 1.2fr; gap:14px; align-items:center; }
    .thead.three, .trow.three { grid-template-columns:2fr 1fr 1fr 1.2fr; }
    .thead { font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:var(--muted-2); font-weight:600; padding-bottom:10px; border-bottom:1px solid var(--border); }
    .trow { padding:14px 0; border-bottom:1px solid var(--border); }
    .r { text-align:right; } .amt { font-weight:600; } .elec { color:var(--elec); } .water { color:var(--water); }
    .muted { color:var(--muted); }
    .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-top:16px; }
    .st .sv { font-size:18px; font-weight:600; margin-top:4px; } .st.loss { background:var(--elec-bg-soft); } .st.loss .sv { color:var(--elec); }
    .note { margin-top:14px; color:var(--muted); font-size:13px; }
    @media (max-width:1000px){ .top,.stats{grid-template-columns:1fr 1fr} }
  `],
})
export class InvoiceDetailComponent {
  id = input.required<string>();      // lié au param de route
  private data = inject(DataService);
  store = inject(PropertyStore);
  private i18n = inject(I18nService);
  private pdfSvc = inject(PdfService);
  readonly t = this.i18n.t;

  loading = signal(true);
  tab = signal<Tab>('both');
  month = signal<string>('');
  elec = signal<Invoice | null>(null);
  water = signal<Invoice | null>(null);
  elecAlloc = signal<AllocationRow[]>([]);
  waterAlloc = signal<AllocationRow[]>([]);
  mainKwh = signal<number | null>(null);

  constructor() {
    // Recharge dès que l'id de route (signal d'input) change.
    effect(() => { const id = this.id(); if (id) this.load(id); });
  }

  private async load(invoiceId: string): Promise<void> {
    this.loading.set(true);
    const inv = await this.data.invoice(invoiceId);
    if (!inv) { this.loading.set(false); return; }
    const p = inv.property_id;
    const label = this.store.periods().find((x) => x.id === inv.period_id)?.label
      ?? (await this.findLabel(inv));
    this.month.set(label);
    this.tab.set(inv.utility === 'water' ? 'water' : 'both');
    const [elec, water, main] = await Promise.all([
      this.data.invoiceForMonth(p, label, 'electricity'),
      this.data.invoiceForMonth(p, label, 'water'),
      this.data.mainConsumption(p, label),
    ]);
    this.elec.set(elec); this.water.set(water); this.mainKwh.set(main);
    this.elecAlloc.set(elec ? await this.data.allocations(elec.id) : []);
    this.waterAlloc.set(water ? await this.data.allocations(water.id) : []);
    this.loading.set(false);
  }

  private async findLabel(inv: Invoice): Promise<string> {
    const all = await this.data.invoices(inv.property_id);
    return (all.find((x) => x.id === inv.id) as any)?.billing_periods?.label ?? '';
  }

  tabTitle = computed(() => this.tab() === 'water' ? this.t().water : this.tab() === 'electricity' ? this.t().electricity : 'EAU + JIRO');
  accent = computed(() => this.tab() === 'water' ? 'var(--water)' : this.tab() === 'both' ? 'var(--combo)' : 'var(--elec)');
  grandTotal = computed(() => {
    if (this.tab() === 'electricity') return this.elec()?.total_amount ?? 0;
    if (this.tab() === 'water') return this.water()?.total_amount ?? 0;
    return (this.elec()?.total_amount ?? 0) + (this.water()?.total_amount ?? 0);
  });
  estimated = computed(() => {
    if (this.tab() === 'electricity') return !!this.elec()?.is_estimated;
    if (this.tab() === 'water') return !!this.water()?.is_estimated;
    return !!this.elec()?.is_estimated || !!this.water()?.is_estimated;
  });
  sumSub = computed(() => this.elecAlloc().reduce((s, a) => s + Number(a.consumption), 0));
  loss = computed(() => Math.max(0, (this.mainKwh() ?? 0) - this.sumSub()));
  rate = computed(() => { const m = this.mainKwh() ?? 0; return m ? Math.round((this.elec()?.total_amount ?? 0) / m) : 0; });

  /** Lignes fusionnées par maison selon l'onglet. */
  merged = computed<any[]>(() => {
    const e = new Map(this.elecAlloc().map((a) => [a.house_id, a]));
    const w = new Map(this.waterAlloc().map((a) => [a.house_id, a]));
    const ids = new Set([...e.keys(), ...w.keys()]);
    const base = this.tab() === 'water' ? this.waterAlloc() : this.elecAlloc();
    return base.map((a) => {
      const ea = e.get(a.house_id), wa = w.get(a.house_id);
      return {
        house_id: a.house_id, house_name: a.house_name, tenant_name: a.tenant_name, house_color: a.house_color,
        consumption: ea?.consumption ?? 0, occupants_count: a.occupants_count,
        percentage: a.percentage,
        elec: ea?.amount ?? 0, water: wa?.amount ?? 0,
        amount: this.tab() === 'electricity' ? (ea?.amount ?? 0)
              : this.tab() === 'water' ? (wa?.amount ?? 0)
              : (ea?.amount ?? 0) + (wa?.amount ?? 0),
      };
    });
  });

  pctTxt(r: number): string { return `${Math.round(r * 100)}%`; }

  pdf(): void {
    // Génère un récapitulatif global du mois (toutes maisons).
    const e = new Map(this.elecAlloc().map((a) => [a.house_id, a]));
    const w = new Map(this.waterAlloc().map((a) => [a.house_id, a]));
    const rows = this.merged().map((r) => ({ house: r.house_name, tenant: r.tenant_name, elec: e.get(r.house_id)?.amount ?? 0, water: w.get(r.house_id)?.amount ?? 0 }));
    this.pdfSvc.summary({
      propertyName: this.store.currentProperty()?.name ?? 'Propriété',
      monthLabel: this.month(), rows,
      due: this.elec()?.due_date ?? this.water()?.due_date,
    });
  }
}
