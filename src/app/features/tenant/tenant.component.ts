import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DataService } from '../../core/data.service';
import { PropertyStore } from '../../core/property.store';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n.service';
import { PdfService } from '../../core/pdf.service';
import { AllocationRow, House, Invoice } from '../../core/models';
import { AriaryPipe, ConsumptionPipe } from '../../shared/format.pipes';
import { BarChartComponent, MonthlyPoint } from '../../shared/bar-chart.component';
import { SpinnerComponent } from '../../shared/spinner.component';

@Component({
  selector: 'tjr-tenant',
  standalone: true,
  imports: [AriaryPipe, ConsumptionPipe, BarChartComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) { <tjr-spinner /> }
    <header class="head">
      <h1 class="page-title">{{ t().nav_tenant }}</h1>
      <div class="page-subtitle">Vos factures et consommations</div>
    </header>

    @if (auth.isAdmin()) {
      <div class="picker">
        <span class="muted">{{ t().see_other_house }} :</span>
        @for (h of store.houses(); track h.id) {
          <button class="chip" [class.on]="h.id === selected()?.id" (click)="select(h)">{{ h.name }}</button>
        }
      </div>
    }

    @if (selected(); as h) {
      <div class="card hero">
        <div class="hero-left">
          <span class="hbadge" [style.background]="h.color">{{ h.name.slice(-1) }}</span>
          <div>
            <div class="muted">{{ h.tenant_name }}</div>
            <div class="hname">{{ h.name }} · {{ store.currentMonth() }}</div>
            <div class="field-label" style="color:#aab2c0;margin-top:14px">{{ t().your_total }}</div>
            <div class="grand mono">{{ total() | ar }}</div>
          </div>
        </div>
        <button class="btn" style="background:var(--elec);color:#1c1206" (click)="pdf()">↓ {{ t().download_pdf }}</button>
      </div>

      <div class="cards2">
        <div class="card pad accent-elec">
          <div class="row-between"><span class="ctitle">⚡ {{ t().your_elec }}</span>
            <span class="badge badge-elec">{{ pct(elecRow()?.percentage) }}</span></div>
          <div class="amt mono">{{ elecRow()?.amount | ar }}</div>
          <div class="muted">{{ elecRow()?.consumption | conso: 'electricity' }}</div>
        </div>
        <div class="card pad accent-water">
          <div class="row-between"><span class="ctitle">💧 {{ t().your_water }}</span>
            <span class="badge badge-water">{{ h.occupants_count }} pers.</span></div>
          <div class="amt mono">{{ waterRow()?.amount | ar }}</div>
          <div class="muted">Par personne</div>
        </div>
      </div>

      <div class="card pad">
        <div class="ctitle">{{ t().consumption_history }}</div>
        <tjr-bar-chart [data]="series()" />
      </div>
    }
  `,
  styles: [`
    .head { margin:6px 0 16px; }
    .picker { display:flex; align-items:center; gap:8px; margin-bottom:16px; }
    .chip { border:1px solid var(--border); background:var(--surface); border-radius:var(--r-md); padding:8px 14px; cursor:pointer; font-weight:600; font-size:13px; color:var(--muted); }
    .chip.on { border-color:var(--elec); color:var(--text-strong); }
    .muted { color:var(--muted); }
    .hero { background:var(--side-bg); color:#fff; border-radius:var(--r-2xl); padding:26px; display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; }
    .hero-left { display:flex; gap:16px; }
    .hbadge { width:52px; height:52px; border-radius:13px; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-family:var(--font-display); font-size:20px; }
    .hname { font-family:var(--font-display); font-weight:600; font-size:20px; }
    .grand { font-size:34px; font-weight:600; }
    .cards2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; } .pad { padding:20px; }
    .accent-elec { border-left:3px solid var(--elec); } .accent-water { border-left:3px solid var(--water); }
    .row-between { display:flex; justify-content:space-between; align-items:center; }
    .ctitle { font-family:var(--font-display); font-weight:600; font-size:16px; }
    .amt { font-size:30px; font-weight:600; margin:8px 0 2px; }
    @media (max-width:900px){ .cards2{grid-template-columns:1fr} }
  `],
})
export class TenantComponent {
  private data = inject(DataService);
  store = inject(PropertyStore);
  auth = inject(AuthService);
  private i18n = inject(I18nService);
  private pdfSvc = inject(PdfService);
  readonly t = this.i18n.t;

  loading = signal(true);
  selected = signal<House | null>(null);
  private elec = signal<Invoice | null>(null);
  private water = signal<Invoice | null>(null);
  elecRow = signal<AllocationRow | null>(null);
  waterRow = signal<AllocationRow | null>(null);
  series = signal<MonthlyPoint[]>([]);

  total = computed(() => Number(this.elecRow()?.amount ?? 0) + Number(this.waterRow()?.amount ?? 0));

  constructor() {
    // Maison par défaut : celle du locataire, sinon la première (admin en preview).
    effect(() => {
      if (!this.selected() && this.store.houses().length) {
        const myHouse = this.auth.profile()?.house_id;
        this.selected.set(this.store.houses().find((h) => h.id === myHouse) ?? this.store.houses()[0]);
      }
    });
    effect(() => {
      const p = this.store.currentPropertyId(); const m = this.store.currentMonth(); const h = this.selected();
      if (p && m && h) this.load(p, m, h);
    });
  }

  private async load(p: string, label: string, house: House): Promise<void> {
    this.loading.set(true);
    const [elec, water, raw] = await Promise.all([
      this.data.invoiceForMonth(p, label, 'electricity'),
      this.data.invoiceForMonth(p, label, 'water'),
      this.data.monthlySeries(p),
    ]);
    this.elec.set(elec); this.water.set(water);
    const ea = elec ? await this.data.allocations(elec.id) : [];
    const wa = water ? await this.data.allocations(water.id) : [];
    this.elecRow.set(ea.find((a) => a.house_id === house.id) ?? null);
    this.waterRow.set(wa.find((a) => a.house_id === house.id) ?? null);
    this.series.set(raw.map((r) => ({ label: r.label.split(' ')[0].slice(0, 3), elec: r.elec, water: r.water })));
    this.loading.set(false);
  }

  select(h: House): void { this.selected.set(h); }
  pct(r: number | null | undefined): string { return r != null ? `${Math.round(r * 100)}%` : '—'; }

  pdf(): void {
    const h = this.selected(); if (!h) return;
    this.pdfSvc.houseInvoice({
      propertyName: this.store.currentProperty()?.name ?? 'Propriété',
      monthLabel: this.store.currentMonth() ?? '',
      house: { name: h.name, tenant_name: h.tenant_name },
      elec: this.elec() && this.elecRow() ? { invoice: this.elec()!, row: this.elecRow()! } : null,
      water: this.water() && this.waterRow() ? { invoice: this.water()!, row: this.waterRow()! } : null,
    });
  }
}
