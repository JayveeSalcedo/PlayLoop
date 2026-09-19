/**
 * Zero-dependency Web Audio API synthesizer for PlayLoop Live Arena Activations.
 * Provides high-impact interactive sound effects for the big-screen LED wall
 * and mobile companion without requiring external audio assets.
 */

class ArenaAudioController {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("playloop_arena_sound_muted");
        this.muted = saved === "true";
      } catch {
        this.muted = false;
      }
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("playloop_arena_sound_muted", String(this.muted));
      } catch {
        // ignore
      }
    }
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("playloop_arena_sound_muted", String(muted));
      } catch {
        // ignore
      }
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === "undefined" || this.muted) return null;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Countdown beeps for 3, 2, 1 and high-pitch horn for GO!
   */
  public playCountdown(isGo = false): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = isGo ? "triangle" : "sine";
      osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
      if (isGo) {
        osc.frequency.exponentialRampToValueAtTime(1174, now + 0.3); // Pitch sweep to D6
      }

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(isGo ? 0.35 : 0.25, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (isGo ? 0.45 : 0.18));

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + (isGo ? 0.46 : 0.2));
    } catch {
      // AudioContext failure gracefully ignored
    }
  }

  /**
   * Tactile pop sound on mobile tap or target hit.
   */
  public playTap(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.05);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.055);
    } catch {
      // ignore
    }
  }

  /**
   * Combo streak sound (ascending pentatonic notes).
   */
  public playCombo(comboCount = 3): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      const pitch = notes[Math.min(notes.length - 1, Math.max(0, Math.floor(comboCount / 5)))] ?? 523.25;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(pitch, now);
      osc.frequency.exponentialRampToValueAtTime(pitch * 1.25, now + 0.12);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.19);
    } catch {
      // ignore
    }
  }

  /**
   * Triumphant victory fanfare for podium awards ceremony.
   */
  public playVictory(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const chords = [
        { notes: [523.25, 659.25, 783.99], time: 0, dur: 0.18 }, // C major
        { notes: [587.33, 739.99, 880.0], time: 0.18, dur: 0.18 }, // D major
        { notes: [659.25, 830.61, 987.77], time: 0.36, dur: 0.18 }, // E major
        { notes: [1046.5, 1318.5, 1567.98], time: 0.54, dur: 0.75 }, // High C major victory hold
      ];

      chords.forEach(({ notes, time, dur }) => {
        notes.forEach((freq) => {
          const now = ctx.currentTime + time;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + dur + 0.02);
        });
      });
    } catch {
      // ignore
    }
  }
}

export const arenaAudio = new ArenaAudioController();
