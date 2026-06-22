import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DataService } from '../../core/data.service';
import { PropertyStore } from '../../core/property.store';
import { SpinnerComponent } from '../../shared/spinner.component';

interface Visit { visitor_id: string; ip: string | null; visit_count: number; first_seen: string; last_seen: string; }

@Component({
  selector: 'tjr-stats',
  standalone: true,
  imports: [SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) { <tjr-spinner /> }
    <header class="head">
      <h1 class="page-title">Consultations</h1>
      <div class="page-subtitle">Qui a ouvert le lien locataire (compté par appareil)</div>
    </header>

    <div class="kpis">
      <div class="card kpi">
        <div class="kpi-label">Locataires (appareils) uniques</div>
        <div class="kpi-value">{{ rows().length }}</div>
        <div class="kpi-sub">appareils distincts ayant ouvert le lien</div>
      </div>
      <div class="card kpi accent-elec">
        <div class="kpi-label">Ouvertures totales</div>
        <div class="kpi-value">{{ totalOpens() }}</div>
        <div class="kpi-sub">toutes ouvertures confondues</div>
      </div>
      <div class="card kpi accent-water">
        <div class="kpi-label">Dernière consultation</div>
        <div class="kpi-value last">{{ lastVisit() }}</div>
        <div class="kpi-sub">{{ rows().length ? '' : 'aucune pour l’instant' }}</div>
      </div>
    </div>

    <div class="card list">
      <div class="thead"><span>Appareil</span><span>IP</span><span class="r">Ouvertures</span><span>Première</span><span>Dernière</span></div>
      @for (v of rows(); track v.visitor_id; let i = $index) {
        <div class="trow">
          <span><span class="badge-dev">📱 Appareil {{ i + 1 }}</span></span>
          <span class="mono muted">{{ v.ip || '—' }}</span>
          <span class="r mono"><b>{{ v.visit_count }}</b></span>
          <span class="mono muted">{{ fmt(v.first_seen) }}</span>
          <span class="mono">{{ fmt(v.last_seen) }}</span>
        </div>
      } @empty {
        <div class="empty muted">Personne n'a encore ouvert le lien. Partage-le depuis Paramètres.</div>
      }
    </div>

    <p class="note muted">ℹ️ Le comptage se fait par appareil/navigateur (un identifiant anonyme est stocké sur l'appareil du locataire). Si un locataire ouvre le lien sur deux téléphones, il compte pour deux. L'IP est indicative (les téléphones changent souvent d'IP).</p>
  `,
  styles: [`
    .head { margin:6px 0 18px; }
    .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-bottom:16px; }
    .kpi { padding:18px; }
    .accent-elec { border-left:3px solid var(--elec); } .accent-water { border-left:3px solid var(--water); }
    .last { font-size:18px; }
    .list { padding:8px 0; }
    .thead, .trow { display:grid; grid-template-columns:1.2fr 1.2fr 0.9fr 1.3fr 1.3fr; gap:12px; align-items:center; padding:0 20px; }
    .thead { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted-2); font-weight:600; padding-bottom:10px; }
    .trow { padding:13px 20px; border-top:1px solid var(--border); font-size:13px; }
    .r { text-align:right; } .muted { color:var(--muted); }
    .badge-dev { background:var(--surface-2); border-radius:999px; padding:4px 10px; font-size:12.5px; font-weight:600; }
    .empty { padding:28px 20px; text-align:center; }
    .note { font-size:12.5px; margin-top:14px; }
    @media (max-width:900px){ .kpis{grid-template-columns:1fr} .thead{display:none} .trow{grid-template-columns:1fr 1fr; gap:6px} }
  `],
})
export class StatsComponent {
  private data = inject(DataService);
  private store = inject(PropertyStore);

  loading = signal(true);
  rows = signal<Visit[]>([]);

  totalOpens = computed(() => this.rows().reduce((s, v) => s + Number(v.visit_count), 0));
  lastVisit = computed(() => (this.rows().length ? this.fmt(this.rows()[0].last_seen) : '—'));

  constructor() {
    effect(() => { const p = this.store.currentPropertyId(); if (p) this.load(); });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.rows.set((await this.data.visitStats()) as Visit[]);
    this.loading.set(false);
  }

  fmt(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
}
