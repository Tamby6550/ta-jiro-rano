import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Point d'accès unique au client Supabase.
 * Pourquoi un service singleton : un seul SupabaseClient pour toute l'app
 * (gestion de session JWT, refresh token, realtime éventuel) — créer
 * plusieurs clients duplique les listeners auth et casse le refresh.
 *
 * Sécurité : SEULE l'anon key est utilisée. Toute la protection des données
 * repose sur les politiques RLS Postgres (cf. supabase/migrations).
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // nécessaire pour le retour OAuth Google
      },
    });
  }
}
