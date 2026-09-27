/* Tiny WebAudio bleeps. All window access is lazy + guarded. */

export class Sound {
  private ctx: AudioContext | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  unlock(): void {
    this.ensure();
  }

  private beep(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.1, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {
      /* silent */
    }
  }

  click(): void {
    this.beep(520, 0.05, 'sine', 0.05);
  }
  cut(): void {
    this.beep(220, 0.06, 'sawtooth', 0.04);
  }
  bad(): void {
    this.beep(150, 0.08, 'square', 0.03);
  }
  done(): void {
    this.beep(660, 0.09, 'sine', 0.12);
    this.beep(990, 0.12, 'sine', 0.1, 0.07);
  }
  win(): void {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.beep(f, 0.16, 'triangle', 0.1, i * 0.09));
  }
}
