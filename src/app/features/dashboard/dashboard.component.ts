import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { PropertyStore } from '../../core/property.store';
import { I18nService } from '../../core/i18n.service';
import { AllocationRow, Invoice } from '../../core/models';
import { AriaryPipe, ConsumptionPipe } from '../../shared/format.pipes';
import { BarChartComponent, MonthlyPoint } from '../../shared/bar-chart.component';
import { SpinnerComponent } from '../../shared/spinner.component';

@Component({
  selector: 'tjr-dashboard',
  standalone: true,
  imports: [RouterLink, AriaryPipe, ConsumptionPipe, BarChartComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) { <tjr-spinner /> }
    <header class="head">
      <div>
        <h1 class="page-title">{{ t().nav_dashboard }}</h1>
        <div class="page-subtitle">Aperçu de la période en cours</div>
      </div>
    </header>

    <div class="bar">
      <div class="segmented">
        <button [class.active]="tab() === 'overview'" (click)="tab.set('overview')">{{ t().overview }}</button>
        <button [class.active]="tab() === 'energy'" (click)="tab.set('energy')">{{ t().by_energy }}</button>
      </div>
      <a routerLink="/readings" class="btn btn-dark">+ {{ t().new_reading }}</a>
    </div>

    <!-- KPIs -->
    <div class="kpis">
      <div class="card kpi">
        <div class="kpi-label">{{ t().total_period }}</div>
        <div class="kpi-value">{{ total() | ar }}</div>
        <div class="kpi-sub">{{ deltaLabel() }}</div>
      </div>
      <div class="card kpi accent-elec">
        <div class="kpi-label">⚡ {{ t().electricity }}</div>
        <div class="kpi-value">{{ elec()?.total_amount | ar }}</div>
        <div class="kpi-sub">{{ mainKwh() | conso: 'electricity' }}</div>
      </div>
      <div class="card kpi accent-water">
        <div class="kpi-label">💧 {{ t().water }}</div>
        <div class="kpi-value">{{ water()?.total_amount | ar }}</div>
        <div class="kpi-sub">{{ totalOccupants() }} occupants</div>
      </div>
      <div class="card kpi">
        <div class="kpi-label">{{ t().network_loss }}</div>
        <div class="kpi-value loss">{{ loss() | conso: 'electricity' }}</div>
        <div class="kpi-sub">{{ lossPct() }}% du principal</div>
      </div>
    </div>

    @if (tab() === 'overview') {
      <div class="grid2">
        <div class="card pad">
          <div class="card-title">{{ t().monthly_consumption }}</div>
          <tjr-bar-chart [data]="series()" />
        </div>
        <div class="card pad">
          <div class="card-title">{{ t().elec_split }}</div>
          <div class="card-sub">{{ t().house_share }}</div>
          @for (a of elecAlloc(); track a.house_id) {
            <div class="split-row">
              <div class="split-top">
                <span><span class="dot" [style.background]="a.house_color"></span>
                  <b>{{ a.house_name }}</b> · <span class="muted">{{ a.tenant_name }}</span></span>
                <span class="mono amt">{{ a.amount | ar }}</span>
              </div>
              <div class="track"><div class="fill" [style.width.%]="a.percentage * 100" [style.background]="a.house_color"></div></div>
            </div>
          }
        </div>
      </div>
    } @else {
      <div class="grid2">
        <div class="card pad accent-elec-top">
          <div class="row-between"><div class="card-title">⚡ {{ t().electricity }}</div>
            <span class="badge badge-elec mono">{{ mainKwh() | conso: 'electricity' }}</span></div>
          <div class="kpi-value" style="font-size:24px">{{ elec()?.total_amount | ar }}</div>
          @for (a of elecAlloc(); track a.house_id) {
            <div class="line"><span><span class="dot" [style.background]="a.house_color"></span>{{ a.house_name }}</span>
              <span class="mono muted">{{ a.consumption | conso: 'electricity' }}</span>
              <span class="mono amt">{{ a.amount | ar }}</span></div>
          }
        </div>
        <div class="card pad accent-water-top">
          <div class="row-between"><div class="card-title">💧 {{ t().water }}</div>
            <span class="badge badge-water mono">{{ totalOccupants() }} occ.</span></div>
          <div class="kpi-value" style="font-size:24px">{{ water()?.total_amount | ar }}</div>
          @for (a of waterAlloc(); track a.house_id) {
            <div class="line"><span><span class="dot" [style.background]="a.house_color"></span>{{ a.house_name }}</span>
              <span class="mono muted">{{ a.occupants_count }} pers.</span>
              <span class="mono amt">{{ a.amount | ar }}</span></div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .head { margin:6px 0 18px; }
    .bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; }
    .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:16px; }
    .kpi { padding:18px; }
    .accent-elec { border-left:3px solid var(--elec); }
    .accent-water { border-left:3px solid var(--water); }
    .loss { color:var(--elec); }
    .grid2 { display:grid; grid-template-columns:1.3fr 1fr; gap:16px; }
    .pad { padding:20px; }
    .card-title { font-family:var(--font-display); font-weight:600; font-size:17px; margin-bottom:2px; }
    .card-sub { color:var(--muted); font-size:12.5px; margin-bottom:14px; }
    .split-row { margin:14px 0; }
    .split-top { display:flex; justify-content:space-between; align-items:center; font-size:13.5px; margin-bottom:6px; }
    .amt { font-weight:600; }
    .track { height:6px; background:var(--surface-2); border-radius:3px; overflow:hidden; }
    .fill { height:100%; border-radius:3px; }
    .muted { color:var(--muted); }
    .line { display:grid; grid-template-columns:1fr auto auto; gap:18px; align-items:center; padding:9px 0; border-top:1px solid var(--border); font-size:13.5px; }
    .row-between { display:flex; justify-content:space-between; align-items:center; }
    .accent-elec-top { border-top:3px solid var(--elec); }
    .accent-water-top { border-top:3px solid var(--water); }
    @media (max-width:1100px){ .kpis{grid-template-columns:repeat(2,1fr)} .grid2{grid-template-columns:1fr} }
  `],
})
export class DashboardComponent {
  private data = inject(DataService);
  store = inject(PropertyStore);
  private i18n = inject(I18nService);
  readonly t = this.i18n.t;

  loading = signal(true);
  tab = signal<'overview' | 'energy'>('overview');
  elec = signal<Invoice | null>(null);
  water = signal<Invoice | null>(null);
  elecAlloc = signal<AllocationRow[]>([]);
  waterAlloc = signal<AllocationRow[]>([]);
  mainKwh = signal<number | null>(null);
  series = signal<MonthlyPoint[]>([]);
  private seriesRaw = signal<{ label: string; elec: number; water: number }[]>([]);

  total = computed(() => (this.elec()?.total_amount ?? 0) + (this.water()?.total_amount ?? 0));
  totalOccupants = computed(() => this.store.houses().reduce((s, h) => s + h.occupants_count, 0));
  loss = computed(() => {
    const sub = this.elecAlloc().reduce((s, a) => s + Number(a.consumption), 0);
    const main = this.mainKwh() ?? 0;
    return Math.max(0, main - sub);
  });
  lossPct = computed(() => {
    const main = this.mainKwh() ?? 0;
    return main ? Math.round((this.loss() / main) * 100) : 0;
  });
  deltaLabel = computed(() => {
    const s = this.seriesRaw();
    if (s.length < 2) return '—';
    const cur = s[s.length - 1], prev = s[s.length - 2];
    const a = cur.elec + cur.water, b = prev.elec + prev.water;
    if (!b) return '—';
    const d = ((a - b) / b) * 100;
    return `${d >= 0 ? '+' : ''}${d.toFixed(1)} % vs mois préc.`;
  });

  constructor() {
    effect(() => {
      const p = this.store.currentPropertyId();
      const m = this.store.currentMonth();
      if (p && m) this.load(p, m);
    });
  }

  private async load(propertyId: string, label: string): Promise<void> {
    this.loading.set(true);
    const [elec, water, main, raw] = await Promise.all([
      this.data.invoiceForMonth(propertyId, label, 'electricity'),
      this.data.invoiceForMonth(propertyId, label, 'water'),
      this.data.mainConsumption(propertyId, label),
      this.data.monthlySeries(propertyId),
    ]);
    this.elec.set(elec); this.water.set(water); this.mainKwh.set(main);
    this.seriesRaw.set(raw.map((r) => ({ label: r.label, elec: r.elec, water: r.water })));
    this.series.set(raw.map((r) => ({ label: r.label.split(' ')[0].slice(0, 3), elec: r.elec, water: r.water })));
    this.elecAlloc.set(elec ? await this.data.allocations(elec.id) : []);
    this.waterAlloc.set(water ? await this.data.allocations(water.id) : []);
    this.loading.set(false);
  }
}
