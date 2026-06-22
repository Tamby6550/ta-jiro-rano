import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/auth.guard';

/**
 * Routing : une coquille protégée (ShellComponent) contient les écrans.
 * Lazy-loading de chaque feature pour garder le bundle initial léger.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    // Page publique locataire : accessible SANS connexion via le lien partagé.
    path: 'p/:token',
    loadComponent: () => import('./features/public/public.component').then((m) => m.PublicComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'readings',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/readings/readings.component').then((m) => m.ReadingsComponent),
      },
      {
        path: 'invoices',
        loadComponent: () =>
          import('./features/invoices/invoices.component').then((m) => m.InvoicesComponent),
      },
      {
        path: 'invoices/:id',
        loadComponent: () =>
          import('./features/invoices/invoice-detail.component').then((m) => m.InvoiceDetailComponent),
      },
      {
        path: 'recap',
        loadComponent: () => import('./features/recap/recap.component').then((m) => m.RecapComponent),
      },
      {
        path: 'houses',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/houses/houses.component').then((m) => m.HousesComponent),
      },
      {
        path: 'tenant',
        loadComponent: () => import('./features/tenant/tenant.component').then((m) => m.TenantComponent),
      },
      {
        path: 'settings',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
