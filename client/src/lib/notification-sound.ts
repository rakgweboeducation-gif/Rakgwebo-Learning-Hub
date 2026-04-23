let audioContext: AudioContext | null = null;

export function playNotificationSound() {
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    const ctx = audioContext;
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.08);
    oscillator.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.16);
    gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch (e) {
    // Silently fail if audio isn't available
  }
}
