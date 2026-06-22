import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Gros spinner centré, affiché en overlay pendant le chargement des données.
 * Couleurs de la marque (orange élec / teal eau).
 */
@Component({
  selector: 'tjr-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ov">
      <div class="box">
        <div class="ring"></div>
        @if (label()) { <div class="lbl">{{ label() }}</div> }
      </div>
    </div>
  `,
  styles: [`
    .ov {
      position: fixed; inset: 0; z-index: 40;
      display: flex; align-items: center; justify-content: center;
      background: rgba(238, 240, 244, 0.55); backdrop-filter: blur(2px);
    }
    .box { display: flex; flex-direction: column; align-items: center; gap: 14px; }
    .ring {
      width: 58px; height: 58px; border-radius: 50%;
      border: 5px solid #e6e9ef;
      border-top-color: #f5a524;   /* élec */
      border-right-color: #0fb5ad; /* eau */
      animation: tjr-spin 0.8s linear infinite;
    }
    .lbl { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 13px; color: #6b7689; letter-spacing: .02em; }
    @keyframes tjr-spin { to { transform: rotate(360deg); } }
  `],
})
export class SpinnerComponent {
  label = input<string>('');
}
