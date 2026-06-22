import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { I18nService, Lang } from '../../core/i18n.service';
import { PropertyStore } from '../../core/property.store';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'tjr-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="layout">
      <!-- ───────── Sidebar ───────── -->
      <aside class="side">
        <div class="brand">
          <span class="logo-mark">TJ</span>
          <div>
            <div class="bname">TA·JIRO·RANO</div>
            <div class="btag">{{ t().tagline }}</div>
          </div>
        </div>

        @if (store.currentProperty(); as prop) {
          <div class="place-name">{{ prop.name }}</div>
        }

        @if (store.properties().length > 1) {
          <select class="prop-select" [value]="store.currentPropertyId() ?? ''"
                  (change)="onProperty($any($event.target).value)">
            @for (p of store.properties(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        }

        <nav class="nav">
          <a routerLink="/dashboard" routerLinkActive="active"><span class="led"></span>{{ t().nav_dashboard }}</a>
          @if (auth.isAdmin()) {
            <a routerLink="/readings" routerLinkActive="active"><span class="led"></span>{{ t().nav_readings }}</a>
          }
          <a routerLink="/invoices" routerLinkActive="active"><span class="led"></span>{{ t().nav_invoices }}</a>
          <a routerLink="/recap" routerLinkActive="active"><span class="led"></span>{{ t().nav_recap }}</a>
          @if (auth.isAdmin()) {
            <a routerLink="/houses" routerLinkActive="active"><span class="led"></span>{{ t().nav_houses }}</a>
          }
          <div class="divider"></div>
          <a routerLink="/tenant" routerLinkActive="active"><span class="led"></span>{{ t().nav_tenant }} (aperçu)</a>
          @if (auth.isAdmin()) {
            <a routerLink="/settings" routerLinkActive="active"><span class="led"></span>Paramètres</a>
          }
        </nav>

        <div class="spacer"></div>

        @if (store.currentPeriod(); as per) {
          <div class="period">
            <div class="plabel">{{ t().period }}</div>
            <div class="pname">{{ per.label }}</div>
            <div class="popen"><span class="pdot"></span>{{ t().period_open }}</div>
          </div>
        }
      </aside>

      <!-- ───────── Contenu ───────── -->
      <main class="main">
        <div class="topbar">
          <div class="seg-lang">
            <button [class.on]="lang() === 'fr'" (click)="setLang('fr')">FR</button>
            <button [class.on]="lang() === 'en'" (click)="setLang('en')">EN</button>
          </div>
          <button class="logout" (click)="logout()" title="Déconnexion">⏻</button>
        </div>

        @if (loading()) {
          <div class="center muted">{{ t().loading }}</div>
        } @else if (store.properties().length === 0) {
          <div class="welcome card">
            <h2>Bienvenue 👋</h2>
            <p class="muted">Donne un nom à ton lieu (maison, villa, cité, résidence…). On crée ta propriété, les compteurs principaux et le mois courant — prêt à saisir.</p>
            <input class="input" [(ngModel)]="newName" placeholder="Ex : Cité Les Manguiers" style="max-width:340px;margin:0 auto 14px" />
            <div>
              <button class="btn btn-dark" [disabled]="seeding()" (click)="createProperty()">
                {{ seeding() ? t().loading : 'Créer ma propriété' }}
              </button>
            </div>
          </div>
        } @else {
          <router-outlet />
        }
      </main>
    </div>
  `,
  styles: [`
    .layout { display:flex; min-height:100vh; }
    .side { width:248px; flex:none; background:var(--side-bg); color:var(--side-text); position:sticky; top:0; height:100vh; display:flex; flex-direction:column; padding:18px 14px; }
    .brand { display:flex; align-items:center; gap:11px; padding:6px; }
    .bname { font-family:var(--font-display); font-weight:700; font-size:15.5px; letter-spacing:.06em; color:#fff; }
    .btag { font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--side-muted); margin-top:3px; }
    .place-name { margin-top:14px; padding:6px 6px 0; font-family:var(--font-display); font-weight:700; font-size:19px; color:#fff; line-height:1.2; }
    .prop-select { margin-top:14px; width:100%; background:var(--side-card); color:#fff; border:1px solid var(--side-border); border-radius:var(--r-md); padding:8px 10px; font-family:var(--font-sans); font-size:13px; }
    .nav { margin-top:18px; display:flex; flex-direction:column; gap:2px; }
    .nav a { display:flex; align-items:center; gap:11px; padding:11px 13px; border-radius:var(--r-lg); color:var(--side-text); text-decoration:none; font-size:13.5px; font-weight:500; }
    .nav a:hover { background:#15203659; }
    .nav a.active { background:#1b2942; color:#fff; }
    .led { width:6px; height:6px; border-radius:50%; background:#3a4762; flex:none; }
    .nav a.active .led { background:var(--elec); }
    .divider { height:1px; background:var(--side-divider); margin:12px 6px; }
    .spacer { flex:1; }
    .period { background:var(--side-card); border:1px solid var(--side-border); border-radius:13px; padding:14px; }
    .plabel { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--side-muted); margin-bottom:8px; }
    .pname { font-family:var(--font-display); font-weight:600; font-size:16px; color:#fff; }
    .popen { display:flex; align-items:center; gap:7px; margin-top:8px; font-size:12px; color:#8b97ab; }
    .pdot { width:7px; height:7px; border-radius:50%; background:#34d399; }
    .main { flex:1; min-width:0; padding:22px 30px 40px; }
    .topbar { display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-bottom:6px; }
    .seg-lang, .seg-role { display:inline-flex; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg); padding:3px; }
    .seg-lang button, .seg-role button { border:none; background:transparent; font-weight:600; font-size:12.5px; color:var(--muted); padding:6px 13px; border-radius:7px; cursor:pointer; font-family:var(--font-sans); }
    .seg-lang button.on, .seg-role button.on { background:var(--surface-2); color:var(--text-strong); }
    .seg-role button.on { background:var(--side-bg); color:#fff; }
    .logout { border:1px solid var(--border); background:var(--surface); border-radius:var(--r-lg); width:36px; height:34px; cursor:pointer; color:var(--muted); }
    .center { display:flex; align-items:center; justify-content:center; height:60vh; }
    .muted { color:var(--muted); }
    .welcome { max-width:520px; margin:60px auto; padding:32px; text-align:center; }
    .welcome h2 { margin-bottom:10px; }
    .welcome p { margin:10px 0 20px; }
  `],
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  store = inject(PropertyStore);
  private i18n = inject(I18nService);
  private sb = inject(SupabaseService);
  private router = inject(Router);

  readonly t = this.i18n.t;
  readonly lang = this.i18n.lang;
  readonly loading = signal(true);
  readonly seeding = signal(false);
  newName = '';

  async ngOnInit(): Promise<void> {
    if (!this.store.loaded()) await this.store.load();
    this.loading.set(false);
  }

  setLang(l: Lang): void { this.i18n.setLang(l); }
  async onProperty(id: string): Promise<void> { await this.store.selectProperty(id); }
  async logout(): Promise<void> { await this.auth.signOut(); this.router.navigate(['/login']); }

  /** Onboarding propriétaire : crée la propriété (compteurs + mois courant) et passe admin. */
  async createProperty(): Promise<void> {
    this.seeding.set(true);
    try {
      await this.sb.client.rpc('setup_my_property', { p_name: this.newName });
      await this.auth.reloadProfile();
      this.store.loaded.set(false);
      await this.store.load();
    } finally {
      this.seeding.set(false);
    }
  }
}
