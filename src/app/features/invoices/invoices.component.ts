import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { PropertyStore } from '../../core/property.store';
import { I18nService } from '../../core/i18n.service';
import { Invoice } from '../../core/models';
import { AriaryPipe } from '../../shared/format.pipes';
import { SpinnerComponent } from '../../shared/spinner.component';

@Component({
  selector: 'tjr-invoices',
  standalone: true,
  imports: [RouterLink, AriaryPipe, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) { <tjr-spinner /> }
    <header class="head">
      <h1 class="page-title">{{ t().nav_invoices }}</h1>
      <div class="page-subtitle">Historique complet des factures JIRAMA</div>
    </header>

    <div class="card list">
      @for (i of invoices(); track i.id) {
        <a class="row" [routerLink]="['/invoices', i.id]">
          <span class="ico" [class.elec]="i.utility === 'electricity'" [class.water]="i.utility === 'water'">
            {{ i.utility === 'electricity' ? '⚡' : '💧' }}</span>
          <div class="info">
            <b>{{ i.utility === 'electricity' ? t().electricity : t().water }} · {{ periodLabel(i) }}</b>
            <div class="num mono">{{ i.number }}</div>
          </div>
          <span class="mono amt">{{ i.total_amount | ar }}</span>
          <span class="badge" [class.badge-success]="i.status === 'paid'" [class.badge-warn]="i.status !== 'paid'">
            {{ i.status === 'paid' ? t().paid : t().to_pay }}</span>
          <span class="chev">›</span>
        </a>
      } @empty { <div class="empty muted">Aucune facture.</div> }
    </div>
  `,
  styles: [`
    .head { margin:6px 0 18px; }
    .list { padding:8px 0; }
    .row { display:flex; align-items:center; gap:16px; padding:16px 22px; text-decoration:none; color:inherit; border-bottom:1px solid var(--border); }
    .row:last-child { border-bottom:none; } .row:hover { background:var(--surface-2); }
    .ico { width:40px; height:40px; border-radius:11px; display:flex; align-items:center; justify-content:center; font-size:18px; }
    .ico.elec { background:var(--elec-bg); } .ico.water { background:var(--water-bg); }
    .info { flex:1; } .num { font-size:12px; color:var(--muted-3); margin-top:2px; }
    .amt { font-weight:600; font-size:15px; }
    .chev { color:var(--muted-3); font-size:20px; }
    .empty { padding:30px; text-align:center; } .muted { color:var(--muted); }
  `],
})
export class InvoicesComponent {
  private data = inject(DataService);
  store = inject(PropertyStore);
  private i18n = inject(I18nService);
  readonly t = this.i18n.t;
  invoices = signal<Invoice[]>([]);
  loading = signal(true);

  constructor() {
    effect(() => { const p = this.store.currentPropertyId(); if (p) this.load(p); });
  }
  private async load(p: string): Promise<void> {
    this.loading.set(true);
    this.invoices.set(await this.data.invoices(p));
    this.loading.set(false);
  }
  periodLabel(i: Invoice): string { return (i as any).billing_periods?.label ?? ''; }
}
