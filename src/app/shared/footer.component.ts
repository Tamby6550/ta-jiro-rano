import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Pied de page : copyright + design by. Présent sur l'app, le login et le lien public. */
@Component({
  selector: 'tjr-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="tjr-foot" [class.dark]="dark()">
      © 2026 RASOLONDRAIBE Tamby Arimisa · Design &amp; développement par RASOLONDRAIBE Tamby Arimisa
    </footer>
  `,
  styles: [`
    .tjr-foot {
      text-align: center;
      font-size: 12px;
      color: var(--muted-3);
      padding: 22px 16px 8px;
      letter-spacing: .01em;
    }
    .tjr-foot.dark { color: #5d6a80; }
  `],
})
export class FooterComponent {
  /** true sur fond sombre (écran de connexion). */
  dark = input(false);
}
