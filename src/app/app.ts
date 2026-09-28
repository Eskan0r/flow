import { Component, HostListener, OnInit, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCalendarDays,
  lucideChevronLeft,
  lucideChevronRight,
  lucideDices,
  lucideLightbulb,
  lucideMenu,
  lucideRotateCcw,
  lucideShare2,
  lucideUndo2,
} from '@ng-icons/lucide';
import { BoardComponent } from './board/board.component';
import { FlowStore } from './core/flow-store';
import type { Pack } from './core/packs';
import { HlmBadge } from './ui/badge';
import { HlmButton } from './ui/button';
import { HlmInput } from './ui/input';
import { HlmLabel } from './ui/label';
import { HlmSeparator } from './ui/separator';
import { HlmSwitch } from './ui/switch';

@Component({
  selector: 'app-root',
  imports: [BoardComponent, HlmBadge, HlmButton, HlmInput, HlmLabel, HlmSeparator, HlmSwitch, NgIcon],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCalendarDays,
      lucideChevronLeft,
      lucideChevronRight,
      lucideDices,
      lucideLightbulb,
      lucideMenu,
      lucideRotateCcw,
      lucideShare2,
      lucideUndo2,
    }),
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly store = inject(FlowStore);

  ngOnInit(): void {
    this.store.boot();
  }

  protected progress(p: Pack): { done: number; total: number } {
    return this.store.packProgress(p);
  }

  protected stars(p: Pack, n: number): number {
    return this.store.starsFor(p.id, n);
  }

  protected levelRange(p: Pack): number[] {
    return Array.from({ length: p.count }, (_, i) => i + 1);
  }

  protected dailyDate(): string {
    return this.store.dailyLabelToday();
  }

  protected dailySize(i: number): number {
    return this.store.dailySize(i);
  }

  protected dailyKind(i: number): string {
    return this.store.dailyKind(i);
  }

  protected dailyDone(i: number): boolean {
    return this.store.dailyDoneToday().includes(i);
  }

  protected dailyAllDone(): boolean {
    return this.store.dailyAllDoneToday();
  }

  protected dailyShareText(): string {
    return this.store.shareText(this.store.dailyLabelToday());
  }

  protected copyDailyShare(): void {
    void this.store.shareToday();
  }

  protected playSeed(): void {
    const sd = this.store.seedInput().trim();
    if (!sd) {
      this.store.newRandom();
      return;
    }
    this.store.playCustom(sd, this.store.size());
  }

  protected freePlay(): void {
    this.store.newRandom();
    this.store.panelOpen.set(true);
  }

  protected stepLevel(dir: -1 | 1): void {
    const p = this.store.pack();
    if (p) {
      this.store.playPackLevel(p, this.store.packLevel() + dir);
      return;
    }
    const parsed = this.store.parseDaily();
    if (parsed) {
      const n = parsed.index + dir;
      this.store.daily(n < 1 ? 5 : n > 5 ? 1 : n);
      return;
    }
    this.store.newRandom();
  }

  @HostListener('window:keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    if (this.store.view() !== 'game') return;
    const t = ev.target as HTMLElement | null;
    const tag = t?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    switch (ev.key.toLowerCase()) {
      case 'u':
        this.store.undo();
        break;
      case 'r':
        this.store.reset();
        break;
      case 'h':
        this.store.hint();
        break;
      case 'n':
        this.store.newRandom();
        break;
    }
  }
}
