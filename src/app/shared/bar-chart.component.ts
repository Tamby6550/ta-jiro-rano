import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef,
  Input, OnChanges, OnDestroy, ViewChild,
} from '@angular/core';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export interface MonthlyPoint { label: string; elec: number; water: number; }

/**
 * Petit graphe à barres « Électricité / Eau » par mois (dashboard + tenant).
 * Couleurs alignées sur le design (orange élec, teal eau).
 */
@Component({
  selector: 'tjr-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div style="position:relative;height:200px"><canvas #cv></canvas></div>`,
})
export class BarChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() data: MonthlyPoint[] = [];
  @ViewChild('cv') cv!: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;

  ngAfterViewInit(): void { this.render(); }
  ngOnChanges(): void { if (this.chart) this.render(); }
  ngOnDestroy(): void { this.chart?.destroy(); }

  private render(): void {
    if (!this.cv) return;
    this.chart?.destroy();
    this.chart = new Chart(this.cv.nativeElement, {
      type: 'bar',
      data: {
        labels: this.data.map((d) => d.label),
        datasets: [
          { label: 'Électricité', data: this.data.map((d) => d.elec), backgroundColor: '#f5a524', borderRadius: 4, barPercentage: 0.55 },
          { label: 'Eau', data: this.data.map((d) => d.water), backgroundColor: '#0fb5ad', borderRadius: 4, barPercentage: 0.55 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: '#8a95a6', font: { family: 'IBM Plex Sans' } } },
          y: { display: false, beginAtZero: true },
        },
      },
    });
  }
}
