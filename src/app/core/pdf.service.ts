import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AllocationRow, Invoice } from './models';
import { formatAriary, formatConsumption, formatDate } from './format';

/**
 * Génération PDF côté client (gratuit, sans backend).
 * Deux sorties : facture détaillée d'une maison, ou récapitulatif global.
 */
@Injectable({ providedIn: 'root' })
export class PdfService {
  /** Facture d'une maison (élec + eau combinés si fournis). */
  houseInvoice(opts: {
    propertyName: string; monthLabel: string;
    house: { name: string; tenant_name: string | null };
    elec?: { invoice: Invoice; row: AllocationRow } | null;
    water?: { invoice: Invoice; row: AllocationRow } | null;
  }): void {
    const doc = new jsPDF();
    this.header(doc, opts.propertyName, `Facture ${opts.monthLabel}`);

    doc.setFontSize(12); doc.setTextColor(20);
    doc.text(`${opts.house.name} — ${opts.house.tenant_name ?? ''}`, 14, 42);

    const body: any[] = [];
    let total = 0;
    if (opts.elec) {
      body.push(['Électricité', formatConsumption(opts.elec.row.consumption, 'electricity'),
        `${Math.round(opts.elec.row.percentage * 100)} %`, formatAriary(opts.elec.row.amount)]);
      total += Number(opts.elec.row.amount);
    }
    if (opts.water) {
      body.push(['Eau', `${opts.water.row.occupants_count} pers.`,
        `${Math.round(opts.water.row.percentage * 100)} %`, formatAriary(opts.water.row.amount)]);
      total += Number(opts.water.row.amount);
    }

    autoTable(doc, {
      startY: 50,
      head: [['Énergie', 'Consommation', 'Part', 'Montant dû']],
      body,
      foot: [['', '', 'TOTAL', formatAriary(total)]],
      theme: 'grid',
      headStyles: { fillColor: [14, 22, 38], textColor: 255 },
      footStyles: { fillColor: [245, 247, 250], textColor: 20, fontStyle: 'bold' },
      styles: { font: 'helvetica', fontSize: 10 },
    });

    const due = opts.elec?.invoice.due_date ?? opts.water?.invoice.due_date;
    if (due) {
      const y = (doc as any).lastAutoTable.finalY + 12;
      doc.setFontSize(10); doc.setTextColor(120);
      doc.text(`Date limite de paiement : ${formatDate(due)}`, 14, y);
    }
    doc.save(`facture-${opts.house.name}-${opts.monthLabel}.pdf`.replace(/\s+/g, '-'));
  }

  /** Récapitulatif global (toutes les maisons). */
  summary(opts: { propertyName: string; monthLabel: string; rows: { house: string; tenant: string | null; elec: number; water: number }[]; due?: string }): void {
    const doc = new jsPDF();
    this.header(doc, opts.propertyName, `Récapitulatif ${opts.monthLabel}`);
    let grand = 0;
    const body = opts.rows.map((r) => {
      const t = r.elec + r.water; grand += t;
      return [r.house, r.tenant ?? '', formatAriary(r.elec), formatAriary(r.water), formatAriary(t)];
    });
    autoTable(doc, {
      startY: 46,
      head: [['Maison', 'Locataire', 'Électricité', 'Eau', 'Total']],
      body,
      foot: [['', '', '', 'TOTAL GÉNÉRAL', formatAriary(grand)]],
      theme: 'grid',
      headStyles: { fillColor: [14, 22, 38], textColor: 255 },
      footStyles: { fillColor: [245, 247, 250], textColor: 20, fontStyle: 'bold' },
      styles: { font: 'helvetica', fontSize: 10 },
    });
    if (opts.due) {
      const y = (doc as any).lastAutoTable.finalY + 12;
      doc.setTextColor(120); doc.setFontSize(10);
      doc.text(`Date limite de paiement : ${formatDate(opts.due)}`, 14, y);
    }
    doc.save(`recap-${opts.monthLabel}.pdf`.replace(/\s+/g, '-'));
  }

  private header(doc: jsPDF, propertyName: string, title: string): void {
    doc.setFillColor(14, 22, 38); doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(255); doc.setFontSize(15);
    doc.text('TA·JIRO·RANO', 14, 13);
    doc.setFontSize(9); doc.setTextColor(200);
    doc.text(propertyName, 14, 20);
    doc.setTextColor(20); doc.setFontSize(15);
    doc.text(title, 14, 36);
  }
}
