/* Win dialog content, opened programmatically with a WinDialogContext. */

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '../ui/button';
import { HlmDialogDescription, HlmDialogFooter, HlmDialogHeader, HlmDialogTitle } from '../ui/dialog';

export interface WinDialogContext {
  stars: number;
  time: string;
  moves: number;
  perfect: boolean;
  hints: number;
  isBest: boolean;
  nextLabel: string;
  showShare: boolean;
  /** Prebuilt share card text (daily wins only, null otherwise). */
  shareText: string | null;
  /** False for dailies (one-shot: no replay once played). Defaults to true. */
  showReplay?: boolean;
  onReplay: () => void;
  onNext: () => void;
  onShare: () => void;
}

@Component({
  selector: 'flow-win-dialog',
  imports: [HlmButton, HlmDialogHeader, HlmDialogTitle, HlmDialogDescription, HlmDialogFooter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader data-testid="win-dialog" class="text-center sm:text-center">
      @if (perfect) {
        <div class="text-3xl tracking-[0.3em] text-yellow-500" aria-label="Perfect: 3 out of 3 stars">
          <span>★</span><span>★</span><span>★</span>
        </div>
        <h2 hlmDialogTitle class="text-xl tracking-[0.2em]">PERFECT</h2>
      } @else {
        <div class="text-3xl text-green-600" aria-label="Completed">✓</div>
        <h2 hlmDialogTitle class="text-xl tracking-[0.2em]">COMPLETE</h2>
      }
      <p hlmDialogDescription>
        <span id="flow-win-desc">
          @if (perfect) {
            Perfect — every pipe first try.
          } @else if (hints > 0) {
            {{ hints }} hint{{ hints > 1 ? 's' : '' }} used.
          } @else {
            Board filled.
          }
          @if (isBest) {
            New best time.
          }
        </span>
      </p>
    </div>
    <div class="flex items-center justify-center gap-8 py-1">
      <div class="text-center">
        <div class="text-[11px] tracking-widest text-muted-foreground">TIME</div>
        <div class="text-lg font-semibold tabular-nums">{{ time }}</div>
      </div>
      <div class="text-center">
        <div class="text-[11px] tracking-widest text-muted-foreground">MOVES</div>
        <div class="text-lg font-semibold tabular-nums">{{ moves }}</div>
      </div>
    </div>
    <div hlmDialogFooter class="flex-col gap-2 sm:flex-col sm:justify-center">
      @if (showShare && shareText) {
        <div data-testid="share-text" class="w-full rounded-lg border bg-muted/50 p-3 text-left text-sm whitespace-pre-line select-all">{{ shareText }}</div>
        <button hlmBtn variant="outline" data-testid="share-btn" class="w-full" (click)="share()">Copy</button>
      }
      <div class="flex w-full justify-center gap-2">
        @if (showReplay) {
          <button hlmBtn variant="outline" data-testid="replay-btn" (click)="replay()">Replay</button>
        }
        <button hlmBtn data-testid="next-btn" (click)="next()">{{ nextLabel }}</button>
      </div>
    </div>
  `,
})
export class WinDialogComponent {
  private readonly ref = inject(BrnDialogRef);
  private readonly ctx = injectBrnDialogContext<WinDialogContext>({ optional: true });

  protected get time(): string {
    return this.ctx?.time ?? '0:00';
  }
  protected get moves(): number {
    return this.ctx?.moves ?? 0;
  }
  protected get perfect(): boolean {
    return this.ctx?.perfect ?? false;
  }
  protected get hints(): number {
    return this.ctx?.hints ?? 0;
  }
  protected get isBest(): boolean {
    return this.ctx?.isBest ?? false;
  }
  protected get nextLabel(): string {
    return this.ctx?.nextLabel ?? 'Next';
  }
  protected get showShare(): boolean {
    return this.ctx?.showShare ?? false;
  }
  protected get showReplay(): boolean {
    return this.ctx?.showReplay ?? true;
  }
  protected get shareText(): string | null {
    return this.ctx?.shareText ?? null;
  }

  protected replay(): void {
    this.ref.close({});
    this.ctx?.onReplay();
  }

  protected next(): void {
    this.ref.close({});
    this.ctx?.onNext();
  }

  protected share(): void {
    this.ctx?.onShare();
  }
}
