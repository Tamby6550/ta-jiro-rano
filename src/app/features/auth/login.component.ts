import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { mapAuthError } from '../../core/auth-errors';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'tjr-login',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="card panel">
        <div class="brand">
          <span class="logo-mark">TJ</span>
          <div>
            <div class="bname">TA·JIRO·RANO</div>
            <div class="btag">{{ t().tagline }}</div>
          </div>
        </div>

        @if (googleEnabled) {
          <button class="btn btn-ghost btn-block google" (click)="google()">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.35 11.1H12v2.8h5.35c-.25 1.4-1.55 4.1-5.35 4.1-3.2 0-5.8-2.65-5.8-5.9s2.6-5.9 5.8-5.9c1.8 0 3 .77 3.7 1.43l2.5-2.4C16.7 3.3 14.6 2.4 12 2.4 6.95 2.4 2.85 6.5 2.85 11.6S6.95 20.8 12 20.8c4.95 0 8.2-3.47 8.2-8.35 0-.56-.06-.99-.15-1.35z"/></svg>
            {{ t().sign_in_google }}
          </button>
          <div class="sep"><span>ou</span></div>
        }

        @if (mode() === 'signup') {
          <label class="field-label">Nom complet</label>
          <input class="input" [(ngModel)]="fullName" placeholder="Rina R." />
        }
        <label class="field-label" style="margin-top:12px">{{ t().email }}</label>
        <input class="input" type="email" [(ngModel)]="email" placeholder="vous@exemple.mg" />
        <label class="field-label" style="margin-top:12px">{{ t().password }}</label>
        <input class="input" type="password" [(ngModel)]="password" (keyup.enter)="submit()" />

        @if (error()) { <div class="err">{{ error() }}</div> }
        @if (info()) { <div class="ok">{{ info() }}</div> }

        <button class="btn btn-dark btn-block" style="margin-top:16px" [disabled]="busy()" (click)="submit()">
          {{ busy() ? t().loading : (mode() === 'signin' ? t().sign_in : 'Créer le compte') }}
        </button>

        <button class="switch" (click)="toggle()">
          {{ mode() === 'signin' ? "Pas de compte ? S'inscrire" : 'Déjà un compte ? Se connecter' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--side-bg); padding:24px; }
    .panel { width:380px; max-width:100%; padding:30px; }
    .brand { display:flex; align-items:center; gap:12px; margin-bottom:24px; }
    .bname { font-family:var(--font-display); font-weight:700; font-size:16px; letter-spacing:.06em; color:var(--text-strong); }
    .btag { font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted-2); }
    .google { margin-bottom:4px; }
    .sep { text-align:center; position:relative; margin:18px 0; color:var(--muted-3); font-size:12px; }
    .sep::before { content:''; position:absolute; top:50%; left:0; right:0; height:1px; background:var(--border); }
    .sep span { background:var(--surface); padding:0 10px; position:relative; }
    .err { color:var(--danger); font-size:13px; margin-top:12px; background:var(--danger-bg); padding:8px 10px; border-radius:var(--r-md); }
    .ok { color:var(--success); font-size:13px; margin-top:12px; background:var(--success-bg); padding:10px 12px; border-radius:var(--r-md); line-height:1.4; }
    .switch { background:none; border:none; color:var(--muted); font-size:13px; cursor:pointer; width:100%; margin-top:14px; }
    .switch:hover { color:var(--text); }
  `],
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private i18n = inject(I18nService);
  readonly t = this.i18n.t;

  // Passe à true une fois Google OAuth configuré dans Supabase (cf. README §4).
  readonly googleEnabled = false;

  mode = signal<'signin' | 'signup'>('signin');
  busy = signal(false);
  error = signal<string | null>(null);
  info = signal<string | null>(null);
  email = ''; password = ''; fullName = '';

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) this.router.navigate(['/dashboard']);
  }

  toggle(): void {
    this.mode.set(this.mode() === 'signin' ? 'signup' : 'signin');
    this.error.set(null); this.info.set(null);
  }

  async google(): Promise<void> {
    this.error.set(null); this.info.set(null);
    const { error } = await this.auth.signInWithGoogle();
    if (error) this.error.set(mapAuthError(error.message));
  }

  async submit(): Promise<void> {
    this.busy.set(true); this.error.set(null); this.info.set(null);
    try {
      if (this.mode() === 'signin') {
        const res = await this.auth.signInWithEmail(this.email, this.password);
        if (res.error) { this.error.set(mapAuthError(res.error.message)); return; }
        this.router.navigate(['/dashboard']);
      } else {
        const res = await this.auth.signUpWithEmail(this.email, this.password, this.fullName);
        if (res.error) { this.error.set(mapAuthError(res.error.message)); return; }
        // Si la confirmation d'e-mail est activée, aucune session n'est renvoyée :
        // on l'indique clairement plutôt que de rester bloqué.
        if (!res.data.session) {
          this.info.set('Compte créé ✓ Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi. (Tu peux aussi désactiver la confirmation d’e-mail dans Supabase.)');
          this.mode.set('signin');
        } else {
          this.router.navigate(['/dashboard']);
        }
      }
    } finally {
      this.busy.set(false);
    }
  }
}
