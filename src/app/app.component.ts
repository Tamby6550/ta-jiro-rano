import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'tjr-root',
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class AppComponent implements OnInit {
  private auth = inject(AuthService);

  async ngOnInit(): Promise<void> {
    // Restaure la session (et le profil) avant tout rendu de route protégée.
    await this.auth.init();
  }
}
