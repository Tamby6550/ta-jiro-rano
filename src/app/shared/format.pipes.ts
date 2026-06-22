import { Pipe, PipeTransform } from '@angular/core';
import { formatAriary, formatConsumption, formatPercent, formatDate, formatDateLong } from '../core/format';
import { Utility } from '../core/models';

@Pipe({ name: 'ar', standalone: true })
export class AriaryPipe implements PipeTransform {
  transform(v: number | null | undefined, suffix = true): string {
    return formatAriary(v, suffix);
  }
}

@Pipe({ name: 'conso', standalone: true })
export class ConsumptionPipe implements PipeTransform {
  transform(v: number | null | undefined, utility: Utility): string {
    return formatConsumption(v, utility);
  }
}

@Pipe({ name: 'pct', standalone: true })
export class PercentPipe implements PipeTransform {
  transform(v: number | null | undefined): string {
    return formatPercent(v);
  }
}

@Pipe({ name: 'fdate', standalone: true })
export class FDatePipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return formatDate(v);
  }
}

@Pipe({ name: 'fdatelong', standalone: true })
export class FDateLongPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return formatDateLong(v);
  }
}
