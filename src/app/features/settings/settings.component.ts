import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PropertyStore } from '../../core/property.store';
import { SupabaseService } from '../../core/supabase.service';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'tjr-settings',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <h1 class="page-title">Paramètres</h1>
      <div class="page-subtitle">Nom du lieu et lien de partage locataire</div>
    </header>

    <div class="grid2">
      <!-- Nom du lieu -->
      <div class="card pad">
        <div class="card-title">Nom du lieu</div>
        <div class="card-sub muted">Maison, villa, cité, résidence… Ce nom s'affiche sous le logo et sur les PDF.</div>
        <label class="field-label">Nom</label>
        <input class="input" [(ngModel)]="name" placeholder="Ex : Cité Les Manguiers" />
        <div class="actions">
          <button class="btn btn-dark" [disabled]="busy()" (click)="saveName()">{{ busy() ? '…' : 'Enregistrer' }}</button>
          @if (savedName()) { <span class="ok">Enregistré ✓</span> }
        </div>
      </div>

      <!-- Lien public locataire -->
      <div class="card pad">
        <div class="card-title">Lien locataire (sans connexion)</div>
        <div class="card-sub muted">Partage ce lien à tes locataires (SMS, WhatsApp…). Ils voient les montants par maison, sans compte ni mot de passe.</div>
        <div class="link-box mono">{{ link() }}</div>
        <div class="expiry" [class.exp]="isExpired()">{{ expiryLabel() }}</div>
        <div class="actions">
          <button class="btn btn-dark" (click)="copy()">⧉ {{ copied() ? 'Copié ✓' : 'Copier le lien' }}</button>
          <a class="btn btn-ghost" [href]="link()" target="_blank" rel="noopener">Ouvrir</a>
        </div>

        <div class="regen">
          <div class="field-label">Régénérer le lien <span class="muted">(l'ancien cesse aussitôt de fonctionner)</span></div>
          <div class="regen-btns">
            <button class="btn btn-ghost" [disabled]="busy()" (click)="regenerate(1)">1 jour</button>
            <button class="btn btn-ghost" [disabled]="busy()" (click)="regenerate(2)">2 jours</button>
            <button class="btn btn-ghost" [disabled]="busy()" (click)="regenerate(7)">7 jours</button>
            <button class="btn btn-ghost" [disabled]="busy()" (click)="regenerate(null)">Sans expiration</button>
          </div>
          @if (regenerated()) { <span class="ok">Nouveau lien généré ✓</span> }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .head { margin:6px 0 18px; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; } .pad { padding:22px; }
    .card-title { font-family:var(--font-display); font-weight:600; font-size:17px; }
    .card-sub { margin:4px 0 16px; font-size:13px; } .muted { color:var(--muted); }
    .input { margin-bottom:14px; }
    .actions { display:flex; align-items:center; gap:12px; }
    .ok { color:var(--success); font-size:13px; }
    .link-box { background:var(--surface-2); border:1px solid var(--border); border-radius:var(--r-md); padding:12px 14px; font-size:12.5px; word-break:break-all; margin-bottom:8px; }
    .expiry { font-size:12.5px; color:var(--muted); margin-bottom:14px; }
    .expiry.exp { color:var(--danger); font-weight:600; }
    .regen { margin-top:18px; padding-top:16px; border-top:1px solid var(--border); }
    .regen-btns { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; }
    @media (max-width:1000px){ .grid2{grid-template-columns:1fr} }
  `],
})
export class SettingsComponent {
  store = inject(PropertyStore);
  private sb = inject(SupabaseService);
  private i18n = inject(I18nService);
  readonly t = this.i18n.t;

  name = '';
  busy = signal(false);
  savedName = signal(false);
  copied = signal(false);
  regenerated = signal(false);

  constructor() {
    // Pré-remplit le champ dès que la propriété courante est chargée.
    effect(() => { const p = this.store.currentProperty(); if (p && !this.name) this.name = p.name; });
  }

  link(): string {
    const tok = this.store.currentProperty()?.share_token;
    return tok ? `${window.location.origin}/p/${tok}` : '';
  }

  async saveName(): Promise<void> {
    const p = this.store.currentProperty();
    if (!p || !this.name.trim()) return;
    this.busy.set(true);
    try {
      await this.sb.client.from('properties').update({ name: this.name.trim() }).eq('id', p.id);
      await this.store.load(); // recharge le nom (sidebar + PDF)
      this.savedName.set(true); setTimeout(() => this.savedName.set(false), 2000);
    } finally { this.busy.set(false); }
  }

  async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.link());
    this.copied.set(true); setTimeout(() => this.copied.set(false), 2000);
  }

  isExpired(): boolean {
    const exp = this.store.currentProperty()?.share_expires_at;
    return !!exp && new Date(exp).getTime() < Date.now();
  }

  expiryLabel(): string {
    const exp = this.store.currentProperty()?.share_expires_at;
    if (!exp) return '🔓 Lien permanent (sans expiration)';
    const d = new Date(exp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return this.isExpired() ? `⛔ Expiré le ${d}` : `⏳ Expire le ${d}`;
  }

  /** Génère un nouveau jeton (l'ancien lien est invalidé) avec une validité. */
  async regenerate(days: number | null): Promise<void> {
    this.busy.set(true);
    try {
      await this.sb.client.rpc('rotate_share_link', { p_days: days });
      await this.store.load(); // recharge token + expiration
      this.regenerated.set(true); setTimeout(() => this.regenerated.set(false), 2500);
    } finally { this.busy.set(false); }
  }
}
