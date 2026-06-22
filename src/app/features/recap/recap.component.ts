import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DataService } from '../../core/data.service';
import { PropertyStore } from '../../core/property.store';
import { I18nService } from '../../core/i18n.service';
import { PdfService } from '../../core/pdf.service';
import { AllocationRow, Invoice } from '../../core/models';
import { formatAriary, formatDateLong } from '../../core/format';
import { AriaryPipe, FDateLongPipe } from '../../shared/format.pipes';
import { SpinnerComponent } from '../../shared/spinner.component';

interface RecapRow { house_id: string; house: string; tenant: string | null; color: string | null; elec: number; water: number; total: number; }

@Component({
  selector: 'tjr-recap',
  standalone: true,
  imports: [AriaryPipe, FDateLongPipe, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) { <tjr-spinner /> }
    <header class="head">
      <h1 class="page-title">{{ t().nav_recap }}</h1>
      <div class="page-subtitle">Total EAU + JIRO par maison, prêt à partager</div>
    </header>

    <div class="grid2">
      <!-- Tableau récap -->
      <div class="card pad">
        <div class="row-between">
          <div><div class="card-title">EAU + JIRO · {{ store.currentMonth() }}
              @if (estimated()) { <span class="badge badge-warn" style="margin-left:6px">ESTIMÉE</span> }</div>
            <div class="muted">Montant à régler par maison ce mois-ci</div></div>
          @if (due()) { <div class="due"><span class="field-label" style="color:var(--elec-strong)">Date limite</span>
            <div class="ddate">{{ due() | fdatelong }}</div></div> }
        </div>

        <div class="thead"><span>Maison</span><span class="r">⚡</span><span class="r">💧</span><span class="r">Total</span></div>
        @for (r of rows(); track r.house_id) {
          <div class="trow">
            <span><span class="dot" [style.background]="r.color"></span><b>{{ r.tenant }}</b><div class="muted sub">{{ r.house }}</div></span>
            <span class="r mono muted">{{ r.elec | ar }}</span>
            <span class="r mono muted">{{ r.water | ar }}</span>
            <span class="r mono amt">{{ r.total | ar }}</span>
          </div>
        }
        <div class="total-bar">
          <button class="btn" style="background:#1b2942;color:#fff" (click)="pdf()">↓ {{ t().generate_pdf }}</button>
          <div class="grow"></div>
          <span class="muted">Total général</span>
          <span class="mono grand">{{ grand() | ar }}</span>
        </div>
      </div>

      <!-- Annonce à copier -->
      <div class="card pad">
        <div class="card-title">📣 Annonce du mois</div>
        <div class="announce">
          <p class="ann-h">🏠 Bonjour à toutes et à tous !<br>EAU + JIRO — {{ store.currentMonth() }}</p>
          @for (r of rows(); track r.house_id) {
            <div class="ann-line"><span>{{ r.tenant || r.house }}</span><b class="mono">{{ r.total | ar }}</b></div>
          }
          <div class="ann-line ann-total"><span>Total général</span><b class="mono">{{ grand() | ar }}</b></div>
          @if (estimated()) { <p class="ann-meta">⚠️ Facture estimée par JIRAMA (NR)</p> }
          @if (due()) { <p class="ann-meta">📅 Date limite de paiement : <b>{{ due() | fdatelong }}</b></p> }
          @if (shareLink()) {
            <p class="ann-meta">🔗 Consulter le détail (sans connexion) :<br><span class="mono ann-url">{{ shareLink() }}</span></p>
          }
        </div>
        <button class="btn btn-dark btn-block" (click)="copy()">⧉ {{ copied() ? 'Copié ✓' : t().copy_message }}</button>
      </div>
    </div>
  `,
  styles: [`
    .head { margin:6px 0 18px; }
    .grid2 { display:grid; grid-template-columns:1.1fr 1fr; gap:16px; } .pad { padding:22px; }
    .row-between { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; }
    .card-title { font-family:var(--font-display); font-weight:600; font-size:17px; }
    .muted { color:var(--muted); } .sub { font-size:12px; }
    .due { background:var(--elec-bg); border-radius:var(--r-lg); padding:8px 14px; text-align:left; }
    .ddate { font-weight:600; color:var(--elec-strong); }
    .thead, .trow { display:grid; grid-template-columns:2fr 1fr 1fr 1.1fr; gap:12px; align-items:center; }
    .thead { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted-2); font-weight:600; padding-bottom:10px; border-bottom:1px solid var(--border); }
    .trow { padding:13px 0; border-bottom:1px solid var(--border); } .r { text-align:right; } .amt { font-weight:600; }
    .total-bar { display:flex; align-items:center; gap:14px; margin-top:16px; background:var(--side-bg); color:#fff; padding:14px 18px; border-radius:var(--r-xl); }
    .grow { flex:1; } .grand { font-size:20px; font-weight:600; }
    .announce { background:var(--success-bg); border-radius:var(--r-lg); padding:16px; margin:14px 0; font-size:13.5px; color:var(--text); }
    .ann-h { margin:0 0 12px; font-weight:600; }
    .ann-line { display:flex; justify-content:space-between; align-items:center; padding:5px 0; }
    .ann-line b { font-weight:700; }
    .ann-total { border-top:1px solid #cfe8d6; margin-top:6px; padding-top:10px; }
    .ann-meta { margin:12px 0 0; color:var(--text); }
    .ann-url { font-size:12px; word-break:break-all; color:var(--water-strong); }
    @media (max-width:1000px){ .grid2{grid-template-columns:1fr} }
  `],
})
export class RecapComponent {
  private data = inject(DataService);
  store = inject(PropertyStore);
  private i18n = inject(I18nService);
  private pdfSvc = inject(PdfService);
  readonly t = this.i18n.t;

  rows = signal<RecapRow[]>([]);
  due = signal<string | null>(null);
  estimated = signal(false);
  copied = signal(false);
  loading = signal(true);

  grand = computed(() => this.rows().reduce((s, r) => s + r.total, 0));

  constructor() {
    effect(() => { const p = this.store.currentPropertyId(); const m = this.store.currentMonth(); if (p && m) this.load(p, m); });
  }

  private async load(p: string, label: string): Promise<void> {
    this.loading.set(true);
    const [elec, water] = await Promise.all([
      this.data.invoiceForMonth(p, label, 'electricity'),
      this.data.invoiceForMonth(p, label, 'water'),
    ]);
    this.due.set(elec?.due_date ?? water?.due_date ?? null);
    this.estimated.set(!!elec?.is_estimated || !!water?.is_estimated);
    const [ea, wa] = await Promise.all([
      elec ? this.data.allocations(elec.id) : Promise.resolve([] as AllocationRow[]),
      water ? this.data.allocations(water.id) : Promise.resolve([] as AllocationRow[]),
    ]);
    const e = new Map(ea.map((a) => [a.house_id, a]));
    const w = new Map(wa.map((a) => [a.house_id, a]));
    this.rows.set(this.store.houses().map((h) => {
      const el = Number(e.get(h.id)?.amount ?? 0), wt = Number(w.get(h.id)?.amount ?? 0);
      return { house_id: h.id, house: h.name, tenant: h.tenant_name, color: h.color, elec: el, water: wt, total: el + wt };
    }));
    this.loading.set(false);
  }

  /** Lien public à jour (jeton courant de la propriété). */
  shareLink(): string {
    const tok = this.store.currentProperty()?.share_token;
    return tok ? `${window.location.origin}/p/${tok}` : '';
  }

  // Message à copier (WhatsApp/SMS) : montants en gras via *…* (rendu gras sur
  // WhatsApp) + lien locataire consultable.
  message = computed(() => {
    const lines = this.rows().map((r) => `${r.tenant ?? r.house} : *${formatAriary(r.total)}*`).join('\n');
    const est = this.estimated() ? `\n⚠️ Facture estimée par JIRAMA (NR)` : '';
    const d = this.due() ? `\n📅 Date limite de paiement : *${formatDateLong(this.due())}*` : '';
    const link = this.shareLink() ? `\n\n🔗 Consulter le détail (sans connexion) :\n${this.shareLink()}` : '';
    return `🏠 Bonjour à toutes et à tous !\nEAU + JIRO — ${this.store.currentMonth()}${est}\n\n${lines}\n\nTotal général : *${formatAriary(this.grand())}*${d}${link}\n\nMerci à tous 🙏`;
  });

  async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.message());
    this.copied.set(true); setTimeout(() => this.copied.set(false), 2000);
  }

  pdf(): void {
    this.pdfSvc.summary({
      propertyName: this.store.currentProperty()?.name ?? 'Propriété',
      monthLabel: this.store.currentMonth() ?? '',
      rows: this.rows().map((r) => ({ house: r.house, tenant: r.tenant, elec: r.elec, water: r.water })),
      due: this.due() ?? undefined,
    });
  }
}
