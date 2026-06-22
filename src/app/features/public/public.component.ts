import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { SupabaseService } from '../../core/supabase.service';
import { AriaryPipe, ConsumptionPipe, FDatePipe } from '../../shared/format.pipes';
import { BarChartComponent, MonthlyPoint } from '../../shared/bar-chart.component';
import { SpinnerComponent } from '../../shared/spinner.component';

interface PRow {
  month: string; month_start: string; utility: 'electricity' | 'water'; due_date: string;
  estimated: boolean;
  house_id: string; house: string; tenant: string | null; color: string | null;
  occupants: number; amount: number; consumption: number; percentage: number;
}
interface Recap { house_id: string; house: string; tenant: string | null; color: string | null; elec: number; water: number; total: number; }

@Component({
  selector: 'tjr-public',
  standalone: true,
  imports: [AriaryPipe, ConsumptionPipe, FDatePipe, BarChartComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <header class="top">
        <div class="brand">
          <span class="logo-mark">TJ</span>
          <div>
            <div class="bname">TA·JIRO·RANO</div>
            <div class="btag">Factures JIRAMA</div>
          </div>
        </div>
        @if (propName()) { <div class="place">{{ propName() }}</div> }
      </header>

      @if (loading()) {
        <tjr-spinner label="Chargement…" />
      } @else if (expired()) {
        <div class="center card pad">
          <h2>⛔ Lien expiré</h2>
          <p class="muted">Ce lien de partage a expiré. Demande le nouveau lien au gestionnaire.</p>
        </div>
      } @else if (!valid()) {
        <div class="center card pad">
          <h2>Lien invalide</h2>
          <p class="muted">Ce lien de partage n'existe pas ou a été révoqué. Demande un nouveau lien au gestionnaire.</p>
        </div>
      } @else {
        <!-- Sélecteur de mois -->
        @if (months().length > 1) {
          <select class="input month-sel" [value]="selMonth()" (change)="selMonth.set($any($event.target).value)">
            @for (m of months(); track m) { <option [value]="m">{{ m }}</option> }
          </select>
        }

        <!-- Récap par maison -->
        <div class="card pad">
          <div class="row-between">
            <div class="card-title">Récapitulatif · {{ selMonth() }}
              @if (monthEstimated()) { <span class="badge badge-warn" style="margin-left:6px">ESTIMÉE</span> }</div>
            @if (dueDate()) { <span class="badge badge-warn">Échéance : {{ dueDate() | fdate }}</span> }
          </div>
          <div class="thead"><span>Maison</span><span class="r">⚡</span><span class="r">💧</span><span class="r">Total</span></div>
          @for (r of recap(); track r.house_id) {
            <div class="trow" [class.sel]="r.house_id === selHouse()" (click)="selHouse.set(r.house_id)">
              <span><span class="dot" [style.background]="r.color"></span><b>{{ r.house }}</b>
                <span class="muted"> {{ r.tenant }}</span></span>
              <span class="r mono muted">{{ r.elec | ar }}</span>
              <span class="r mono muted">{{ r.water | ar }}</span>
              <span class="r mono amt">{{ r.total | ar }}</span>
            </div>
          }
          <div class="grand-row"><span class="muted">Total général</span><span class="mono grand">{{ grand() | ar }}</span></div>
        </div>

        <!-- Détail de la maison sélectionnée -->
        @if (detail(); as d) {
          <div class="card pad">
            <div class="card-title">{{ d.house }} <span class="muted">· {{ d.tenant }}</span></div>
            <div class="detail">
              <div class="dbox elec">
                <div class="field-label">⚡ Électricité</div>
                <div class="mono dval">{{ d.elec | ar }}</div>
                <div class="muted">{{ d.elecConso | conso: 'electricity' }} · {{ pct(d.elecPct) }}</div>
              </div>
              <div class="dbox water">
                <div class="field-label">💧 Eau</div>
                <div class="mono dval">{{ d.water | ar }}</div>
                <div class="muted">{{ d.occupants }} occupant(s)</div>
              </div>
            </div>
            <div class="card-title" style="font-size:15px;margin-top:18px">Historique</div>
            <tjr-bar-chart [data]="history()" />
          </div>
        }

        <div class="foot muted">Montants en Ariary. Calculs générés automatiquement par TA·JIRO·RANO.</div>
      }
    </div>
  `,
  styles: [`
    .wrap { max-width:760px; margin:0 auto; padding:22px 16px 50px; }
    .top { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; }
    .brand { display:flex; align-items:center; gap:11px; }
    .bname { font-family:var(--font-display); font-weight:700; font-size:15.5px; letter-spacing:.06em; color:var(--text-strong); }
    .btag { font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted-2); }
    .place { font-family:var(--font-display); font-weight:700; font-size:18px; color:var(--text-strong); text-align:right; }
    .center { text-align:center; margin-top:60px; } .muted { color:var(--muted); }
    .pad { padding:20px; } .card { margin-bottom:16px; }
    .month-sel { max-width:220px; margin-bottom:16px; }
    .row-between { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .card-title { font-family:var(--font-display); font-weight:600; font-size:17px; }
    .thead, .trow { display:grid; grid-template-columns:2fr 1fr 1fr 1.1fr; gap:10px; align-items:center; }
    .thead { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted-2); font-weight:600; padding-bottom:10px; border-bottom:1px solid var(--border); }
    .trow { padding:12px 0; border-bottom:1px solid var(--border); cursor:pointer; border-radius:8px; }
    .trow:hover { background:var(--surface-2); } .trow.sel { background:var(--surface-2); }
    .r { text-align:right; } .amt { font-weight:600; }
    .grand-row { display:flex; justify-content:space-between; align-items:center; margin-top:14px; background:var(--side-bg); color:#fff; padding:12px 16px; border-radius:var(--r-lg); }
    .grand { font-size:18px; font-weight:600; }
    .detail { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:6px; }
    .dbox { padding:14px; border-radius:var(--r-lg); } .dbox.elec { background:var(--elec-bg-soft); } .dbox.water { background:var(--water-bg-soft); }
    .dval { font-size:24px; font-weight:600; margin:4px 0; }
    .foot { text-align:center; font-size:12px; margin-top:10px; }
    @media (max-width:600px){ .detail{grid-template-columns:1fr} .place{font-size:15px} }
  `],
})
export class PublicComponent {
  token = input.required<string>();
  private sb = inject(SupabaseService);

  loading = signal(true);
  valid = signal(false);
  expired = signal(false);
  propName = signal<string>('');
  private rows = signal<PRow[]>([]);
  selMonth = signal<string>('');
  selHouse = signal<string>('');

  constructor() {
    effect(() => { const tk = this.token(); if (tk) this.load(tk); });
  }

  private async load(token: string): Promise<void> {
    this.loading.set(true);
    this.expired.set(false);
    const { data } = await this.sb.client.rpc('public_get', { p_token: token });
    if (!data) { this.valid.set(false); this.loading.set(false); return; }
    if (data.expired) { this.expired.set(true); this.valid.set(false); this.loading.set(false); return; }
    this.propName.set(data.property?.name ?? '');
    const rows = (data.rows ?? []) as PRow[];
    this.rows.set(rows);
    this.valid.set(true);
    const ms = this.months();
    this.selMonth.set(ms[0] ?? '');
    this.loading.set(false);
  }

  months = computed<string[]>(() => {
    const map = new Map<string, string>();
    for (const r of this.rows()) if (!map.has(r.month) || r.month_start > map.get(r.month)!) map.set(r.month, r.month_start);
    return [...map.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1)).map((e) => e[0]);
  });

  private monthRows = computed(() => this.rows().filter((r) => r.month === this.selMonth()));

  recap = computed<Recap[]>(() => {
    const by = new Map<string, Recap>();
    for (const r of this.monthRows()) {
      const e = by.get(r.house_id) ?? { house_id: r.house_id, house: r.house, tenant: r.tenant, color: r.color, elec: 0, water: 0, total: 0 };
      if (r.utility === 'electricity') e.elec = Number(r.amount); else e.water = Number(r.amount);
      e.total = e.elec + e.water;
      by.set(r.house_id, e);
    }
    return [...by.values()];
  });

  grand = computed(() => this.recap().reduce((s, r) => s + r.total, 0));
  monthEstimated = computed(() => this.monthRows().some((r) => r.estimated));
  dueDate = computed(() => {
    const ds = this.monthRows().map((r) => r.due_date).filter(Boolean).sort();
    return ds.length ? ds[ds.length - 1] : null;
  });

  // sélectionne la 1re maison par défaut quand le mois change
  private _ = effect(() => {
    const rc = this.recap();
    if (rc.length && !rc.some((r) => r.house_id === this.selHouse())) this.selHouse.set(rc[0].house_id);
  });

  detail = computed(() => {
    const hid = this.selHouse(); if (!hid) return null;
    const rs = this.monthRows().filter((r) => r.house_id === hid);
    if (!rs.length) return null;
    const e = rs.find((r) => r.utility === 'electricity');
    const w = rs.find((r) => r.utility === 'water');
    return {
      house: rs[0].house, tenant: rs[0].tenant,
      elec: Number(e?.amount ?? 0), water: Number(w?.amount ?? 0),
      elecConso: Number(e?.consumption ?? 0), elecPct: Number(e?.percentage ?? 0),
      occupants: w?.occupants ?? e?.occupants ?? 0,
    };
  });

  history = computed<MonthlyPoint[]>(() => {
    const hid = this.selHouse(); if (!hid) return [];
    const byMonth = new Map<string, { start: string; elec: number; water: number }>();
    for (const r of this.rows().filter((x) => x.house_id === hid)) {
      const e = byMonth.get(r.month) ?? { start: r.month_start, elec: 0, water: 0 };
      if (r.utility === 'electricity') e.elec = Number(r.amount); else e.water = Number(r.amount);
      byMonth.set(r.month, e);
    }
    return [...byMonth.entries()]
      .sort((a, b) => (a[1].start < b[1].start ? -1 : 1))
      .map(([label, v]) => ({ label: label.split(' ')[0].slice(0, 3), elec: v.elec, water: v.water }));
  });

  pct(r: number): string { return `${Math.round(r * 100)}%`; }
}
