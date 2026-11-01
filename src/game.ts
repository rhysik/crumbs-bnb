import Phaser from "phaser";
import { keyBit } from "./input";
import {
  createState,
  update,
  encodeInput,
  WIDTH,
  HEIGHT,
  HOME,
  MAPS,
} from "../shared/simulation.mjs";
export type GameState = ReturnType<typeof createState> & { paused?: boolean };
export type RunResult = { state: GameState; actions: number[][] };
export function mountGame(
  parent: HTMLElement,
  seed: number,
  onChange: (s: GameState) => void,
  onFinish: (r: RunResult) => void,
  skin: string = "original",
  onReady?: () => void,
) {
  let mask = 0,
    paused = Boolean(onReady),
    hasStarted = !onReady,
    simulation = createState(seed),
    actions: number[][] = [],
    game: Phaser.Game,
    accumulator = 0;
  const isPortrait = () =>
    matchMedia("(max-width:600px) and (orientation:portrait)").matches;
  let scene: Vault | null = null;
  const resize = () => {
    const portrait = isPortrait();
    game.scale.setGameSize(portrait ? 540 : WIDTH, portrait ? 720 : HEIGHT);
    if (scene) {
      const camera = scene.cameras.main;
      camera.setBounds(0, 0, WIDTH, HEIGHT);
      camera.setZoom(portrait ? 1.35 : 1);
      if (portrait) camera.startFollow(scene.mouse, true, 0.15, 0.15);
      else {
        camera.stopFollow();
        camera.setScroll(0, 0);
      }
    }
  };
  const keys = new Set<number>();
  const taps = new Map<number, number>();
  const setKey = (e: KeyboardEvent, on: boolean) => {
    if (!hasStarted) return;
    if (paused && e.target instanceof HTMLElement && e.target.closest("button"))
      return;
    const bit = keyBit(e);
    if (bit) {
      e.preventDefault();
      if (on) keys.add(bit);
      else keys.delete(bit);
    }
    if (on && e.key === "Escape" && !e.repeat) {
      paused = !paused;
      onChange({ ...simulation, paused });
    }
  };
  const down = (e: KeyboardEvent) => setKey(e, true),
    up = (e: KeyboardEvent) => setKey(e, false),
    blur = () => {
      if (!hasStarted) return;
      paused = true;
      keys.clear();
      taps.clear();
      mask = 0;
      onChange({ ...simulation, paused });
    };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  let count = 0;
  class Vault extends Phaser.Scene {
    mouse!: Phaser.GameObjects.Sprite;
    crumbs: any[] = [];
    bots: Phaser.GameObjects.Sprite[] = [];
    alerts: Phaser.GameObjects.Text[] = [];
    alertRings: Phaser.GameObjects.Arc[] = [];
    pickups: any[] = [];
    pickupGlows: Phaser.GameObjects.Arc[] = [];
    whale!: Phaser.GameObjects.Rectangle;
    preload() {
      this.load.image("floor", "/game/" + MAPS[simulation.layout].floor);
      this.load.image("mouse-selected", "/game/" + skin + ".png");
      this.load.spritesheet("run", "/game/run.png", {
        frameWidth: 192,
        frameHeight: 192,
      });
      this.load.spritesheet("guard-run", "/game/guard-run-v1.png", {
        frameWidth: 192,
        frameHeight: 192,
      });
      for (const name of ["crumb", "collector", "crate", "burrow"])
        this.load.image(name, "/game/" + name + ".png");
    }
    create() {
      scene = this;
      this.add
        .image(WIDTH / 2, HEIGHT / 2, "floor")
        .setDisplaySize(WIDTH, HEIGHT);
      this.add
        .image(HOME.x, HOME.y - 7, "burrow")
        .setDisplaySize(105, 105)
        .setDepth(1);
      for (const b of simulation.blocks)
        this.add
          .image(b.x + b.w / 2, b.y + b.h / 2 - 10, "crate")
          .setDisplaySize(b.w + 15, b.h + 45)
          .setDepth(b.y + b.h);
      this.crumbs = simulation.crumbs.map((c) =>
        this.add.image(c.x, c.y, "crumb").setDisplaySize(32, 32).setDepth(5),
      );
      this.bots = simulation.bots.map((b) =>
        this.add.sprite(b.x, b.y - 27, "guard-run", 0).setDisplaySize(94, 94),
      );
      this.alertRings = simulation.bots.map((b) =>
        this.add
          .circle(b.x, b.y, 24, 0xec895a, 0.08)
          .setStrokeStyle(2, 0xec895a, 0.65)
          .setDepth(1),
      );
      this.alerts = simulation.bots.map((b) =>
        this.add
          .text(b.x, b.y - 76, "!", {
            fontFamily: "Arial",
            fontSize: "26px",
            fontStyle: "bold",
            color: "#ffe3b8",
            stroke: "#121416",
            strokeThickness: 5,
          })
          .setOrigin(0.5)
          .setDepth(1000)
          .setVisible(false),
      );
      this.pickups = simulation.pickups.map((c) => {
        this.pickupGlows.push(
          this.add
            .circle(
              c.x,
              c.y,
              25,
              c.kind === "speed" ? 0x5bfa85 : 0xbce3ff,
              0.16,
            )
            .setStrokeStyle(2, c.kind === "speed" ? 0x5bfa85 : 0xbce3ff, 0.85)
            .setDepth(4),
        );
        const img = this.add
          .image(c.x, c.y, "crumb")
          .setDisplaySize(45, 45)
          .setTint(c.kind === "shield" ? 0xbce3ff : 0x77ff66)
          .setDepth(5);
        return img;
      });
      this.mouse = this.add
        .sprite(
          simulation.x,
          simulation.y - 25,
          skin === "original" ? "run" : "mouse-selected",
          0,
        )
        .setDisplaySize(90, 90);
      this.whale = this.add
        .rectangle(WIDTH / 2, 275, WIDTH - 75, 45, 0xf0b90b, 0.13)
        .setDepth(1)
        .setVisible(false);
      this.anims.create({
        key: "scurry",
        frames: this.anims.generateFrameNumbers("run", { start: 0, end: 3 }),
        frameRate: 12,
        repeat: -1,
      });
      this.anims.create({
        key: "pursuit",
        frames: this.anims.generateFrameNumbers("guard-run", {
          start: 0,
          end: 3,
        }),
        frameRate: 10,
        repeat: -1,
      });
      resize();
      onChange({ ...simulation, paused });
      onReady?.();
    }
    update(_t: number, delta: number) {
      if (paused || simulation.phase !== "playing") return;
      accumulator += Math.min(delta, 100);
      let input = mask;
      for (const bit of keys) input |= bit;
      for (const [bit, until] of taps) {
        if (simulation.tick < until) input |= bit;
        else taps.delete(bit);
      }
      while (accumulator >= 1000 / 60 && simulation.phase === "playing") {
        update(simulation, input);
        encodeInput(actions, input);
        accumulator -= 1000 / 60;
      }
      this.mouse
        .setPosition(simulation.x, simulation.y - 25)
        .setFlipX(simulation.face < 0)
        .setDepth(simulation.y + 2)
        .setAlpha(
          simulation.tick < simulation.hurtUntil &&
            Math.floor(simulation.tick / 5) % 2
            ? 0.45
            : 1,
        );
      if (skin === "original") {
        if (input & 15) this.mouse.anims.play("scurry", true);
        else {
          this.mouse.anims.stop();
          this.mouse.setFrame(0);
        }
      } else if (input & 15) this.mouse.y += Math.sin(simulation.tick / 5) * 2;
      this.crumbs.forEach((c, i) => {
        c.setVisible(!simulation.crumbs[i].taken);
        c.y = simulation.crumbs[i].y + Math.sin(simulation.tick / 15 + i) * 2;
      });
      this.bots.forEach((b, i) => {
        const guard = simulation.bots[i],
          stunned = simulation.tick < guard.stunnedUntil;
        b.setVisible(guard.active)
          .setPosition(guard.x, guard.y - 27)
          .setFlipX(guard.face < 0)
          .setDepth(guard.y)
          .setAlpha(stunned ? 0.5 : 1);
        if (guard.active && !stunned) b.anims.play("pursuit", true);
        else b.anims.stop();
        b.anims.timeScale = guard.mode === "chase" ? 1.3 : 0.8;
        this.alerts[i]
          .setVisible(guard.active && (guard.mode !== "patrol" || stunned))
          .setText(stunned ? "…" : guard.mode === "chase" ? "!" : "?")
          .setPosition(guard.x, guard.y - 76);
        this.alertRings[i]
          .setVisible(guard.active && guard.mode === "chase" && !stunned)
          .setPosition(guard.x, guard.y);
      });
      this.pickups.forEach((b, i) => {
        b.setVisible(!simulation.pickups[i].taken);
        this.pickupGlows[i]
          .setVisible(!simulation.pickups[i].taken)
          .setRadius(24 + Math.sin(simulation.tick / 12 + i) * 2);
      });
      this.whale.setVisible(simulation.tick < simulation.whaleUntil);
      if (++count % 3 === 0) onChange({ ...simulation, paused });
      if (simulation.phase !== "playing") {
        onChange({ ...simulation, paused });
        onFinish({ state: simulation, actions });
      }
    }
  }
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: isPortrait() ? 540 : WIDTH,
    height: isPortrait() ? 720 : HEIGHT,
    backgroundColor: "#121416",
    transparent: false,
    scene: Vault,
    render: { antialias: true, pixelArt: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    audio: { noAudio: true },
  });
  window.addEventListener("resize", resize);
  return {
    pause(value?: boolean) {
      paused = value ?? !paused;
      if (!paused) hasStarted = true;
      keys.clear();
      taps.clear();
      mask = 0;
      accumulator = 0;
      onChange({ ...simulation, paused });
    },
    input(bit: number, pressed: boolean) {
      if (pressed) {
        mask |= bit;
        taps.set(bit, simulation.tick + 8);
      } else mask &= ~bit;
    },
    destroy() {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      game.destroy(true);
    },
    state: () => simulation,
  };
}
