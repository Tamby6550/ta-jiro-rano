/**
 * Traduit les messages d'erreur Supabase Auth (anglais) en français.
 * On mappe par mots-clés car le texte exact peut varier selon la version GoTrue.
 */
export function mapAuthError(message: string | undefined | null): string {
  const m = (message ?? '').toLowerCase();

  if (m.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return 'Adresse e-mail non confirmée. Vérifie ta boîte mail (ou désactive la confirmation dans Supabase).';
  if (m.includes('user already registered') || m.includes('already been registered')) return 'Un compte existe déjà avec cet e-mail. Connecte-toi.';
  if (m.includes('email rate limit') || m.includes('rate limit')) return "Trop d'e-mails envoyés en peu de temps. Patiente quelques minutes, ou désactive la confirmation d'e-mail dans Supabase.";
  if (m.includes('unsupported provider') || m.includes('provider is not enabled')) return "La connexion Google n'est pas encore configurée sur ce projet. Utilise l'e-mail pour l'instant.";
  if (m.includes('password should be at least') || m.includes('password is too short')) return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'Les inscriptions sont désactivées sur ce projet.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Adresse e-mail invalide.';
  if (m.includes('for security purposes') && m.includes('seconds')) return 'Trop de tentatives. Réessaie dans quelques secondes.';

  return message || 'Une erreur est survenue. Réessaie.';
}
