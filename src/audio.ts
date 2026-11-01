type Preferences = { muted: boolean; music: number; effects: number };
type Effect =
  | "crumb"
  | "boost"
  | "shield"
  | "dash"
  | "caught"
  | "alert"
  | "win"
  | "lose"
  | "tick"
  | "plus"
  | "return";
const defaults: Preferences = { muted: false, music: 0.12, effects: 0.55 };
const storageKey = "crumbs-audio-v1";
let preferences = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
  if (saved)
    preferences = {
      muted: saved.muted === true,
      music: Number.isFinite(saved.music)
        ? Math.max(0, Math.min(1, saved.music))
        : defaults.music,
      effects: Number.isFinite(saved.effects)
        ? Math.max(0, Math.min(1, saved.effects))
        : defaults.effects,
    };
} catch {}
let context: AudioContext | undefined;
let music: HTMLAudioElement | undefined;
let master: GainNode, musicGain: GainNode, effectsGain: GainNode;
let gameplay = false;
let rollTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function levels() {
  if (!context) return;
  master.gain.setTargetAtTime(
    preferences.muted ? 0 : 0.8,
    context.currentTime,
    0.025,
  );
  musicGain.gain.setTargetAtTime(preferences.music, context.currentTime, 0.025);
  effectsGain.gain.setTargetAtTime(
    preferences.effects,
    context.currentTime,
    0.025,
  );
}
function initialize() {
  if (context) return;
  context = new AudioContext();
  master = context.createGain();
  musicGain = context.createGain();
  effectsGain = context.createGain();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.ratio.value = 6;
  music = document.createElement("audio");
  music.src = "/audio/sneaky-snitch-v1.mp3";
  music.preload = "none";
  music.loop = true;
  music.hidden = true;
  music.dataset.crumbsMusic = "";
  document.body.append(music);
  context.createMediaElementSource(music).connect(musicGain).connect(master);
  effectsGain.connect(master);
  master.connect(limiter).connect(context.destination);
  levels();
}
function unlock() {
  try {
    initialize();
    void context!.resume().catch(() => {});
  } catch {
    /* Audio support must never block a run. */
  }
}
function syncMusic() {
  if (!music) return;
  if (
    gameplay &&
    !document.hidden &&
    !preferences.muted &&
    preferences.music > 0
  ) {
    void music.play().catch(() => {});
  } else music.pause();
}
function tone(
  frequency: number,
  at: number,
  duration = 0.12,
  end = frequency,
  type: OscillatorType = "sine",
) {
  if (
    !context ||
    preferences.muted ||
    !preferences.effects ||
    document.hidden ||
    context.state !== "running"
  )
    return;
  const oscillator = context.createOscillator(),
    envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(20, end),
    at + duration,
  );
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(0.14, at + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.001, at + duration);
  oscillator.connect(envelope).connect(effectsGain);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
  oscillator.onended = () => {
    oscillator.disconnect();
    envelope.disconnect();
  };
}
export const audio = {
  unlock,
  gameplay(active: boolean, reset = false) {
    gameplay = active;
    if (active) unlock();
    if (reset && music) music.currentTime = 0;
    syncMusic();
  },
  effect(kind: Effect) {
    if (!context) return;
    const now = context.currentTime;
    switch (kind) {
      case "crumb":
        tone(760, now, 0.08, 1120, "triangle");
        break;
      case "boost":
        tone(330, now, 0.24, 990);
        tone(660, now + 0.08, 0.2, 1320);
        break;
      case "shield":
        [660, 880, 1100].forEach((f, i) => tone(f, now + i * 0.065, 0.18));
        break;
      case "dash":
        tone(330, now, 0.1, 80, "triangle");
        break;
      case "caught":
        tone(240, now, 0.24, 90, "triangle");
        break;
      case "alert":
        tone(440, now, 0.09);
        tone(520, now + 0.12, 0.09);
        break;
      case "win":
      case "plus":
        [523, 659, 784, 1047].forEach((f, i) =>
          tone(f, now + i * 0.105, 0.23, f, "triangle"),
        );
        break;
      case "lose":
        [330, 294, 220].forEach((f, i) => tone(f, now + i * 0.16, 0.2));
        break;
      case "tick":
        tone(1000, now, 0.035, 700, "triangle");
        break;
      case "return":
        [523, 659].forEach((f, i) => tone(f, now + i * 0.12, 0.2));
        break;
    }
  },
  stopRoll() {
    clearTimeout(rollTimer);
  },
  roll(duration: number) {
    unlock();
    audio.stopRoll();
    const started = performance.now();
    const tick = () => {
      const elapsed = performance.now() - started;
      if (elapsed >= duration) return;
      audio.effect("tick");
      rollTimer = setTimeout(tick, 60 + (elapsed / duration) ** 2 * 220);
    };
    tick();
  },
  preferences: () => ({ ...preferences }),
  set(next: Partial<Preferences>) {
    unlock();
    preferences = { ...preferences, ...next };
    levels();
    syncMusic();
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {}
    listeners.forEach((listener) => listener());
  },
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    gameplay = false;
    music?.pause();
    audio.stopRoll();
  }
});
window.addEventListener("blur", () => {
  gameplay = false;
  music?.pause();
  audio.stopRoll();
});

export function mountAudioControls(host: HTMLElement) {
  const controller = new AbortController(),
    options = { signal: controller.signal };
  host.classList.add("sound-controls");
  host.innerHTML = `<button class="sound-toggle" type="button" aria-expanded="false">Sound</button><div class="sound-panel" hidden><label>Music <input type="range" min="0" max="100" aria-label="Music volume"/></label><label>Effects <input type="range" min="0" max="100" aria-label="Effects volume"/></label><button class="mute-audio" type="button" aria-pressed="false">Mute all</button><a href="/docs/#audio-credits" target="_blank" rel="noopener">Music credits</a></div>`;
  const toggle = host.querySelector<HTMLButtonElement>(".sound-toggle")!,
    panel = host.querySelector<HTMLElement>(".sound-panel")!;
  const musicSlider = host.querySelector<HTMLInputElement>(
      '[aria-label="Music volume"]',
    )!,
    effectsSlider = host.querySelector<HTMLInputElement>(
      '[aria-label="Effects volume"]',
    )!,
    mute = host.querySelector<HTMLButtonElement>(".mute-audio")!;
  const refresh = () => {
    musicSlider.value = String(Math.round(preferences.music * 100));
    effectsSlider.value = String(Math.round(preferences.effects * 100));
    mute.setAttribute("aria-pressed", String(preferences.muted));
    mute.textContent = preferences.muted ? "Unmute" : "Mute all";
    toggle.textContent = preferences.muted ? "Sound off" : "Sound";
  };
  const close = () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener(
    "click",
    () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute("aria-expanded", String(!panel.hidden));
    },
    options,
  );
  musicSlider.addEventListener(
    "input",
    () => audio.set({ music: Number(musicSlider.value) / 100 }),
    options,
  );
  effectsSlider.addEventListener(
    "input",
    () => {
      audio.set({ effects: Number(effectsSlider.value) / 100 });
      audio.effect("crumb");
    },
    options,
  );
  mute.addEventListener(
    "click",
    () => audio.set({ muted: !preferences.muted }),
    options,
  );
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!host.contains(e.target as Node)) close();
    },
    options,
  );
  host.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        toggle.focus();
      } else e.stopPropagation();
    },
    options,
  );
  listeners.add(refresh);
  refresh();
  return () => {
    controller.abort();
    listeners.delete(refresh);
  };
}
