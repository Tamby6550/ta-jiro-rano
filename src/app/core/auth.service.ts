import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { Profile, Role } from './models';

/**
 * Authentification + profil applicatif.
 * Etat expose en signals (Angular 19) : session, profile, role.
 * Le profil porte le property_id et le role (admin|tenant) lus depuis
 * la table profiles (creee par trigger a l'inscription).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private sb = inject(SupabaseService);
  private router = inject(Router);

  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly loading = signal<boolean>(true);

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly role = computed<Role | null>(() => this.profile()?.role ?? null);
  readonly isAdmin = computed(() => this.role() === 'admin');

  /** Vue de role simulee (toggle Admin/Locataire de la barre superieure).
   *  Ne change pas les droits reels (RLS reste maitre) : confort de preview. */
  readonly viewAs = signal<Role | null>(null);
  readonly effectiveRole = computed<Role | null>(() => this.viewAs() ?? this.role());

  async init(): Promise<void> {
    const { data } = await this.sb.client.auth.getSession();
    this.session.set(data.session);
    if (data.session) await this.loadProfile();
    this.loading.set(false);

    this.sb.client.auth.onAuthStateChange(async (event, session) => {
      this.session.set(session);
      if (session) await this.loadProfile();
      else this.profile.set(null);

      // Retour OAuth (Google) : la session arrive de façon asynchrone via le
      // hash de l'URL. On redirige alors automatiquement si on est resté sur
      // l'écran de connexion (sinon l'utilisateur devrait rafraîchir à la main).
      if (event === 'SIGNED_IN') {
        const url = this.router.url.split(/[?#]/)[0];
        if (url === '/login' || url === '/' || url === '') {
          this.router.navigateByUrl('/dashboard');
        }
      }
    });
  }

  /** Recharge le profil (ex: apres seed qui passe l'utilisateur admin). */
  async reloadProfile(): Promise<void> {
    return this.loadProfile();
  }

  private async loadProfile(): Promise<void> {
    const { data, error } = await this.sb.client
      .from('profiles')
      .select('id, role, full_name, property_id, house_id')
      .single();
    if (!error) this.profile.set(data as Profile);
  }

  async signInWithGoogle() {
    return this.sb.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  async signInWithEmail(email: string, password: string) {
    return this.sb.client.auth.signInWithPassword({ email, password });
  }

  async signUpWithEmail(email: string, password: string, fullName: string) {
    return this.sb.client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
  }

  async signOut(): Promise<void> {
    await this.sb.client.auth.signOut();
    this.profile.set(null);
    this.viewAs.set(null);
  }
}
