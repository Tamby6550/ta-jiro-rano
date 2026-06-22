import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PropertyStore } from '../../core/property.store';
import { I18nService } from '../../core/i18n.service';
import { SupabaseService } from '../../core/supabase.service';
import { DataService } from '../../core/data.service';
import { House } from '../../core/models';

interface ElecGroup { meter_id: string; serial: string | null; houses: { id: string; name: string; color: string | null; tenant_name: string | null; position: number }[]; }

@Component({
  selector: 'tjr-houses',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <div><h1 class="page-title">{{ t().nav_houses }}</h1>
        <div class="page-subtitle">Gestion du bâtiment et des occupants</div></div>
      <div class="head-actions">
        <button class="btn btn-ghost" (click)="openShare()">⚡ Compteurs partagés</button>
        <button class="btn btn-dark" (click)="openNew()">+ {{ t().add_house }}</button>
      </div>
    </header>

    <div class="grid">
      @for (h of store.houses(); track h.id) {
        <div class="card pad house" (click)="edit(h)">
          <div class="top">
            <span class="hbadge" [style.background]="h.color">{{ h.name.slice(-1) }}</span>
            <div class="ttl"><b>{{ h.name }}</b><div class="muted">{{ h.tenant_name }}</div></div>
            <span class="tag">{{ h.label }}</span>
          </div>
          <div class="metrics">
            <div><div class="field-label">{{ t().occupants }}</div><div class="mv">{{ h.occupants_count }}</div></div>
            <div><div class="field-label">⚡ {{ t().sub_meter }}</div><div class="mono sm">SC-{{ h.name.slice(-1) }}-EL</div></div>
            <div><div class="field-label">💧 {{ t().sub_meter }}</div><div class="mono sm">SC-{{ h.name.slice(-1) }}-EA</div></div>
          </div>
        </div>
      }
    </div>

    @if (editing(); as h) {
      <div class="overlay" (click)="editing.set(null)">
        <div class="card modal pad" (click)="$event.stopPropagation()">
          <h3>{{ h.id ? 'Modifier' : 'Ajouter' }} une maison</h3>
          <label class="field-label">Nom</label><input class="input" [(ngModel)]="h.name" placeholder="Maison E" />
          <label class="field-label">Locataire</label><input class="input" [(ngModel)]="h.tenant_name" placeholder="Nom du foyer" />
          <label class="field-label">Emplacement</label><input class="input" [(ngModel)]="h.label" placeholder="RDC, Étage…" />
          <div class="two">
            <div><label class="field-label">Occupants</label><input class="input" type="number" [(ngModel)]="h.occupants_count" /></div>
            <div><label class="field-label">Couleur</label><input class="input" type="color" [(ngModel)]="h.color" /></div>
          </div>
          <div class="actions">
            <button class="btn btn-ghost" (click)="editing.set(null)">Annuler</button>
            <button class="btn btn-dark" [disabled]="busy()" (click)="save()">{{ busy() ? t().loading : t().save }}</button>
          </div>
        </div>
      </div>
    }

    @if (showShare()) {
      <div class="overlay" (click)="showShare.set(false)">
        <div class="card modal wide pad" (click)="$event.stopPropagation()">
          <h3>⚡ Compteurs électriques partagés</h3>
          <p class="muted">Deux maisons (ou plus) peuvent partager un sous-compteur : sa consommation est divisée à parts égales entre elles.</p>

          <div class="sec-title">Compteurs actuels</div>
          @for (g of groups(); track g.meter_id) {
            <div class="grp">
              <span>
                @if (g.houses.length > 1) { <b>🔗 Partagé — </b> }{{ groupNames(g) }}
              </span>
              @if (g.houses.length > 1) {
                <button class="btn btn-ghost gbtn" [disabled]="shareBusy()" (click)="split(g.meter_id)">Séparer</button>
              }
            </div>
          } @empty { <div class="muted">Aucun sous-compteur. Ajoute d'abord des maisons.</div> }

          <div class="sec-title">Regrouper des maisons sur un compteur partagé</div>
          <div class="pick">
            @for (h of store.houses(); track h.id) {
              <label class="chk"><input type="checkbox" [checked]="!!sel[h.id]" (change)="toggle(h.id)" />
                <span class="dot" [style.background]="h.color"></span>{{ h.name }}</label>
            }
          </div>

          <div class="actions">
            @if (shareMsg()) { <span class="muted">{{ shareMsg() }}</span> }
            <div class="grow"></div>
            <button class="btn btn-ghost" (click)="showShare.set(false)">Fermer</button>
            <button class="btn btn-dark" [disabled]="shareBusy() || selectedCount() < 2" (click)="group()">
              {{ shareBusy() ? '…' : 'Regrouper (' + selectedCount() + ')' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .head { display:flex; justify-content:space-between; align-items:flex-start; margin:6px 0 18px; }
    .grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; } .pad { padding:20px; }
    .house { cursor:pointer; } .house:hover { box-shadow:var(--shadow-md); }
    .top { display:flex; align-items:center; gap:12px; margin-bottom:18px; }
    .hbadge { width:42px; height:42px; border-radius:11px; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-family:var(--font-display); font-size:17px; }
    .ttl { flex:1; } .muted { color:var(--muted); font-size:12.5px; }
    .tag { background:var(--surface-2); color:var(--muted); font-size:11.5px; padding:5px 10px; border-radius:999px; }
    .metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding-top:14px; border-top:1px solid var(--border); }
    .mv { font-size:20px; font-weight:600; font-family:var(--font-mono); } .sm { font-size:13px; margin-top:2px; }
    .overlay { position:fixed; inset:0; background:#0e162688; display:flex; align-items:center; justify-content:center; z-index:50; }
    .modal { width:420px; max-width:92vw; } .modal h3 { margin-bottom:14px; }
    .modal .input { margin-bottom:12px; } .two { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .actions { display:flex; align-items:center; justify-content:flex-end; gap:10px; margin-top:8px; }
    .head-actions { display:flex; gap:10px; }
    .wide { width:520px; } .muted { color:var(--muted); font-size:12.5px; }
    .sec-title { font-family:var(--font-display); font-weight:600; font-size:13.5px; margin:18px 0 8px; }
    .grp { display:flex; align-items:center; justify-content:space-between; padding:9px 0; border-bottom:1px solid var(--border); font-size:13.5px; }
    .gbtn { padding:5px 12px; font-size:12.5px; }
    .pick { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .chk { display:flex; align-items:center; gap:8px; font-size:13.5px; padding:6px; border:1px solid var(--border); border-radius:var(--r-md); cursor:pointer; }
    .grow { flex:1; }
    @media (max-width:900px){ .grid{grid-template-columns:1fr} .pick{grid-template-columns:1fr} }
  `],
})
export class HousesComponent {
  store = inject(PropertyStore);
  private sb = inject(SupabaseService);
  private data = inject(DataService);
  private i18n = inject(I18nService);
  readonly t = this.i18n.t;

  editing = signal<Partial<House> | null>(null);
  busy = signal(false);

  // --- Compteurs partagés ---
  showShare = signal(false);
  groups = signal<ElecGroup[]>([]);
  sel: Record<string, boolean> = {};
  shareBusy = signal(false);
  shareMsg = signal<string | null>(null);

  selectedCount(): number { return Object.values(this.sel).filter(Boolean).length; }
  groupNames(g: ElecGroup): string { return g.houses.map((h) => h.name).join(' + '); }
  toggle(id: string): void { this.sel[id] = !this.sel[id]; }

  async openShare(): Promise<void> {
    this.sel = {}; this.shareMsg.set(null); this.showShare.set(true);
    await this.loadGroups();
  }
  private async loadGroups(): Promise<void> {
    const p = this.store.currentPropertyId();
    if (p) this.groups.set(await this.data.elecMeterGroups(p) as ElecGroup[]);
  }
  async group(): Promise<void> {
    const ids = Object.keys(this.sel).filter((k) => this.sel[k]);
    if (ids.length < 2) return;
    this.shareBusy.set(true); this.shareMsg.set(null);
    try {
      await this.data.setSharedMeter(ids);
      this.sel = {};
      await this.loadGroups();
      this.shareMsg.set('Compteur partagé créé ✓');
    } catch (e: any) { this.shareMsg.set('Erreur : ' + (e.message ?? e)); }
    finally { this.shareBusy.set(false); }
  }
  async split(meterId: string): Promise<void> {
    this.shareBusy.set(true); this.shareMsg.set(null);
    try {
      await this.data.splitSharedMeter(meterId);
      await this.loadGroups();
      this.shareMsg.set('Compteur séparé ✓');
    } catch (e: any) { this.shareMsg.set('Erreur : ' + (e.message ?? e)); }
    finally { this.shareBusy.set(false); }
  }

  openNew(): void {
    const pos = this.store.houses().length + 1;
    this.editing.set({ name: '', tenant_name: '', label: '', occupants_count: 1, color: '#6366f1', position: pos });
  }
  edit(h: House): void { this.editing.set({ ...h }); }

  async save(): Promise<void> {
    const h = this.editing(); const p = this.store.currentPropertyId();
    if (!h || !p) return;
    this.busy.set(true);
    try {
      if (h.id) {
        await this.sb.client.from('houses').update({
          name: h.name, tenant_name: h.tenant_name, label: h.label,
          occupants_count: h.occupants_count, color: h.color,
        }).eq('id', h.id);
      } else {
        const { data: house } = await this.sb.client.from('houses').insert({
          property_id: p, name: h.name, tenant_name: h.tenant_name, label: h.label,
          occupants_count: h.occupants_count, color: h.color, position: h.position,
        }).select('id').single();
        // Crée les 2 sous-compteurs (élec + eau) de la nouvelle maison
        const letter = (h.name ?? '').slice(-1);
        if (house) {
          await this.sb.client.from('meters').insert([
            { property_id: p, kind: 'sub', utility: 'electricity', house_id: (house as any).id, serial: `SC-${letter}-EL` },
            { property_id: p, kind: 'sub', utility: 'water', house_id: (house as any).id, serial: `SC-${letter}-EA` },
          ]);
        }
      }
      await this.store.selectProperty(p);
      this.editing.set(null);
    } finally { this.busy.set(false); }
  }
}
