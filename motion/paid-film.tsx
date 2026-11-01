import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Sequence,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  delayRender,
  continueRender,
} from "remotion";
import {
  autopilot,
  createState,
  update,
  HOME,
  MAPS,
} from "../shared/simulation.mjs";

const yellow = "#F0B90B",
  paper = "#EEE8D9",
  dark = "#121416";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const route = autopilot(49);
const state = createState(49);
const states = [structuredClone(state)];
for (const [mask, count] of route.actions)
  for (let i = 0; i < count; i++) {
    update(state, mask);
    states.push(structuredClone(state));
  }
const art = (name: string, style: React.CSSProperties) => (
  <Img src={staticFile(name)} style={style} />
);

function Scene({
  length,
  children,
}: {
  length: number;
  children: React.ReactNode;
}) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: dark,
        color: paper,
        overflow: "hidden",
        opacity: interpolate(
          f,
          [0, 8, length - 8, length],
          [0, 1, 1, 0],
          clamp,
        ),
        transform: `translateX(${interpolate(f, [0, 9, length - 9, length], [320, 0, 0, -320], clamp)}px)`,
        filter: `blur(${interpolate(f, [0, 9, length - 9, length], [18, 0, 0, 18], clamp)}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}
function Mouse({
  x,
  y,
  size = 400,
  run = false,
  face = 1,
}: {
  x: number;
  y: number;
  size?: number;
  run?: boolean;
  face?: number;
}) {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        transform: `scaleX(${face})`,
      }}
    >
      {run ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundImage: `url(${staticFile("run.png")})`,
            backgroundSize: "400% 100%",
            backgroundPosition: `${((Math.floor(f / 3) % 4) * 100) / 3}% 0`,
          }}
        />
      ) : (
        art("mouse-v1.png", {
          width: "100%",
          height: "100%",
          objectFit: "contain",
        })
      )}
    </div>
  );
}
function Enter() {
  const f = useCurrentFrame(),
    { fps } = useVideoConfig();
  const p = spring({ frame: f - 12, fps, config: { damping: 15 } });
  return (
    <Scene length={150}>
      {art("vault-v1.webp", {
        position: "absolute",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        opacity: 0.26,
        transform: `scale(${1 + f * 0.0003})`,
      })}
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 125,
          fontSize: 100,
          lineHeight: 1,
        }}
      >
        Tiny mouse.
        <br />
        <span style={{ color: yellow }}>Big appetite.</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 130,
          top: 475,
          transform: `translateY(${(1 - p) * 100}px)`,
          opacity: p,
        }}
      >
        <div style={{ fontSize: 34 }}>Enter a paid run</div>
        <div style={{ fontSize: 92, color: yellow, marginTop: 10 }}>
          0.0028 BNB
        </div>
        <div style={{ fontSize: 29, marginTop: 18 }}>
          One entry. A whole vault to raid.
        </div>
        <div
          style={{
            background: f > 100 ? paper : yellow,
            color: dark,
            borderRadius: 18,
            padding: "25px 65px",
            display: "inline-block",
            fontSize: 34,
            marginTop: 40,
            transform: `scale(${f > 92 && f < 105 ? 0.96 : 1})`,
          }}
        >
          {f > 105 ? "Entry confirmed" : "Enter the vault"}
        </div>
      </div>
      <Mouse
        x={interpolate(f, [0, 145], [1200, 1140], clamp)}
        y={325}
        size={620}
      />
    </Scene>
  );
}
function Run() {
  const f = useCurrentFrame();
  const s =
    states[
      Math.min(
        states.length - 1,
        Math.max(
          0,
          Math.floor(interpolate(f, [6, 282], [0, states.length - 1], clamp)),
        ),
      )
    ];
  return (
    <Scene length={300}>
      <div style={{ position: "absolute", left: 100, top: 45, fontSize: 59 }}>
        Grab the crumbs. Dodge the guards.
      </div>
      <div
        style={{
          position: "absolute",
          right: 110,
          top: 55,
          color: yellow,
          fontSize: 43,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {String(Math.ceil((2700 - s.tick) / 60)).padStart(2, "0")}s ·{" "}
        {s.collected}/{s.crumbs.length} crumbs
      </div>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 165,
          width: 1700,
          height: 850,
          borderRadius: 22,
          overflow: "hidden",
          border: "3px solid #3c3e3d",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 960,
            height: 540,
            transform: "scale(1.77,1.574)",
            transformOrigin: "top left",
            background: "#293137",
          }}
        >
          {art(MAPS[s.layout].floor, {
            position: "absolute",
            width: 960,
            height: 540,
            opacity: 0.65,
          })}
          {art("burrow.png", {
            position: "absolute",
            left: HOME.x - 44,
            top: HOME.y - 42,
            width: 88,
            height: 88,
          })}
          {s.blocks.map((b: any, i: number) => (
            <React.Fragment key={i}>
              {art("crate.png", {
                position: "absolute",
                left: b.x,
                top: b.y,
                width: b.w,
                height: b.h,
                objectFit: "fill",
              })}
            </React.Fragment>
          ))}
          {s.crumbs.map(
            (c: any, i: number) =>
              !c.taken && (
                <React.Fragment key={i}>
                  {art("crumb.png", {
                    position: "absolute",
                    left: c.x - 9,
                    top: c.y - 9 + Math.sin(f * 0.12 + i) * 2,
                    width: 18,
                    height: 18,
                  })}
                </React.Fragment>
              ),
          )}
          {s.pickups.map(
            (p: any, i: number) =>
              !p.taken && (
                <div
                  key={"pickup-" + i}
                  style={{
                    position: "absolute",
                    left: p.x - 18,
                    top: p.y - 18,
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: p.kind === "speed" ? "#5bfa8533" : "#bce3ff33",
                    boxShadow:
                      "0 0 0 2px " +
                      (p.kind === "speed" ? "#5bfa85" : "#bce3ff"),
                  }}
                >
                  {art("crumb.png", {
                    width: 36,
                    height: 36,
                    filter:
                      p.kind === "speed"
                        ? "hue-rotate(65deg) saturate(1.4)"
                        : "saturate(.15)",
                  })}
                </div>
              ),
          )}
          {s.bots.map(
            (b: any, i: number) =>
              b.active && (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: b.x - 32,
                    top: b.y - 50,
                    width: 64,
                    height: 64,
                    transform: `scaleX(${b.face})`,
                    backgroundImage: `url(${staticFile("guard-run-v1.png")})`,
                    backgroundSize: "400% 100%",
                    backgroundPosition: `${((Math.floor(f / 3) % 4) * 100) / 3}% 0`,
                  }}
                >
                  {b.mode === "chase" && (
                    <span
                      style={{
                        position: "absolute",
                        top: -17,
                        left: 28,
                        color: yellow,
                        fontSize: 22,
                        transform: `scaleX(${b.face})`,
                      }}
                    >
                      !
                    </span>
                  )}
                </div>
              ),
          )}
          <Mouse x={s.x - 27} y={s.y - 27} size={54} run face={s.face} />
          {s.tick < s.hurtUntil && (
            <div
              style={{
                position: "absolute",
                left: s.x - 45,
                top: s.y - 56,
                color: yellow,
                fontSize: 18,
              }}
            >
              Fee patrol!
            </div>
          )}
          {s.phase === "escaped" && (
            <div
              style={{
                position: "absolute",
                left: 24,
                top: 480,
                color: yellow,
                fontSize: 20,
              }}
            >
              All gold crumbs collected!
            </div>
          )}
        </div>
      </div>
    </Scene>
  );
}
function Home() {
  const f = useCurrentFrame();
  const progress = interpolate(f, [8, 73], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const size = interpolate(progress, [0, 0.5, 1], [330, 280, 125]);
  const center = interpolate(progress, [0, 1], [1200, 1550]);
  const feet = interpolate(progress, [0, 1], [910, 825]);
  return (
    <Scene length={90}>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 155,
          fontSize: 108,
          lineHeight: 1,
        }}
      >
        Home.
        <br />
        <span style={{ color: yellow }}>With the bag.</span>
      </div>
      <div style={{ position: "absolute", left: 120, top: 490, fontSize: 49 }}>
        {route.state.collected} gold crumbs · {route.state.score} points
      </div>
      <div style={{ position: "absolute", left: 120, top: 590, fontSize: 32 }}>
        Now the separate BNB draw.
      </div>
      {art("burrow.png", {
        position: "absolute",
        left: 1230,
        top: 390,
        width: 600,
      })}
      <AbsoluteFill
        style={{
          clipPath:
            'path("M0 0H1430V730Q1430 590 1550 590Q1670 590 1670 730V885H1920V1080H0Z")',
          opacity: interpolate(f, [56, 77], [1, 0], clamp),
        }}
      >
        <Mouse x={center - size / 2} y={feet - size * 0.948} size={size} run />
      </AbsoluteFill>
    </Scene>
  );
}
function Draw() {
  const f = useCurrentFrame();
  const rotation = interpolate(f, [10, 126], [0, 1447.2], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const bands = [
    {
      color: "#666e70",
      chance: "60%",
      range: "80.123–95.877%",
      label: "Partial return",
    },
    {
      color: yellow,
      chance: "35%",
      range: "103.123–107.877%",
      label: "Small plus",
    },
    {
      color: "#b9c9c0",
      chance: "4.5%",
      range: "110.123–119.877%",
      label: "Bigger plus",
    },
    {
      color: paper,
      chance: "0.5%",
      range: "175.123–224.877%",
      label: "Top return",
    },
  ];
  return (
    <Scene length={180}>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 95,
          fontSize: 100,
          lineHeight: 1,
        }}
      >
        One last <span style={{ color: yellow }}>twist.</span>
      </div>
      <div style={{ position: "absolute", left: 115, top: 255, fontSize: 30 }}>
        Verified by Chainlink VRF. Returns include entry.
      </div>
      <div style={{ position: "absolute", left: 115, top: 370, width: 780 }}>
        {bands.map((b, i) => (
          <div
            key={b.chance}
            style={{
              display: "grid",
              gridTemplateColumns: "24px 115px 1fr",
              columnGap: 20,
              alignItems: "center",
              marginBottom: 29,
              opacity: interpolate(f, [8 + i * 5, 18 + i * 5], [0, 1], clamp),
            }}
          >
            <div
              style={{
                width: 20,
                height: 50,
                borderRadius: 6,
                background: b.color,
              }}
            />
            <div style={{ fontSize: 39, color: b.color }}>{b.chance}</div>
            <div>
              <div style={{ fontSize: 28 }}>{b.label}</div>
              <div style={{ fontSize: 30, color: "#b9beb8", marginTop: 3 }}>
                {b.range} returned
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 115,
          top: 840,
          fontSize: 55,
          color: yellow,
          opacity: interpolate(f, [134, 145], [0, 1], clamp),
        }}
      >
        116.345% return
      </div>
      <div
        style={{
          position: "absolute",
          left: 115,
          top: 925,
          fontSize: 26,
          color: "#b9beb8",
        }}
      >
        40% chance above entry. Network gas is separate.
      </div>
      <div
        style={{
          position: "absolute",
          right: 170,
          top: 290,
          width: 610,
          height: 610,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "14px solid " + paper,
            background:
              "conic-gradient(#666e70 0deg 216deg,#f0b90b 216deg 342deg,#b9c9c0 342deg 358.2deg,#eee8d9 358.2deg)",
            transform: "rotate(" + rotation + "deg)",
          }}
        >
          {[
            { angle: 108, label: "60%", color: paper },
            { angle: 279, label: "35%", color: dark },
          ].map((b) => (
            <div
              key={b.label}
              style={{
                position: "absolute",
                left: 291 + 200 * Math.sin((b.angle * Math.PI) / 180),
                top: 291 - 200 * Math.cos((b.angle * Math.PI) / 180),
                fontSize: 40,
                color: b.color,
                transform: "translate(-50%,-50%) rotate(" + -rotation + "deg)",
              }}
            >
              {b.label}
            </div>
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            inset: 195,
            borderRadius: "50%",
            background: dark,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 0 8px #12141633",
          }}
        >
          <span style={{ fontSize: 48 }}>BNB</span>
          <span style={{ fontSize: 18, color: "#b9beb8", marginTop: 8 }}>
            VERIFIED DRAW
          </span>
        </div>
        <div
          style={{
            position: "absolute",
            left: 280,
            top: -34,
            width: 0,
            height: 0,
            borderLeft: "25px solid transparent",
            borderRight: "25px solid transparent",
            borderTop: "65px solid " + yellow,
          }}
        />
      </div>
    </Scene>
  );
}
function Return() {
  const f = useCurrentFrame(),
    { fps } = useVideoConfig();
  const p = spring({ frame: f - 8, fps, config: { damping: 16 } });
  const breath =
    f >= 70 && f < 98 ? 1 + Math.sin(((f - 70) / 28) * Math.PI) * 0.025 : 1;
  return (
    <Scene length={180}>
      <div style={{ position: "absolute", left: 115, top: 110, fontSize: 92 }}>
        A little more comes home.
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 320,
          opacity: p,
          transform: `translateY(${(1 - p) * 75}px)`,
        }}
      >
        <div style={{ fontSize: 32, color: "#bdc0b9" }}>
          Return, including the entry
        </div>
        <div style={{ fontSize: 117, marginTop: 12 }}>0.00325766 BNB</div>
        <div
          style={{
            fontSize: 63,
            color: yellow,
            marginTop: 24,
            transform: `scale(${breath})`,
            transformOrigin: "left center",
          }}
        >
          +0.00045766 BNB
        </div>
        <div style={{ fontSize: 29, marginTop: 12 }}>
          Above entry, before network gas
        </div>
        <div
          style={{
            fontSize: 35,
            background: f > 115 ? paper : yellow,
            color: dark,
            padding: "26px 50px",
            borderRadius: 18,
            display: "inline-block",
            marginTop: 45,
            transform: `scale(${f > 104 && f < 116 ? 0.96 : 1})`,
          }}
        >
          {f > 115 ? "Received in wallet" : "Claim return"}
        </div>
      </div>
      <Mouse x={1410} y={520} size={350} />
    </Scene>
  );
}
function End() {
  const f = useCurrentFrame();
  return (
    <Scene length={150}>
      {art("vault-v1.webp", {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        opacity: 0.25,
        transform: `scale(${1.02 + f * 0.0003})`,
      })}
      <Mouse x={1110} y={190} size={650} />
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 175,
          fontSize: 175,
          color: yellow,
        }}
      >
        Crumbs
      </div>
      <div
        style={{
          position: "absolute",
          left: 130,
          top: 400,
          fontSize: 65,
          lineHeight: 1.1,
        }}
      >
        Small mouse.
        <br />
        Big chain.
      </div>
      <div
        style={{
          position: "absolute",
          left: 130,
          top: 690,
          fontSize: 48,
          opacity: interpolate(f, [20, 40], [0, 1], clamp),
        }}
      >
        playcrumbs.xyz
      </div>
      <div
        style={{
          position: "absolute",
          left: 130,
          top: 790,
          fontSize: 28,
          color: "#b8bab6",
        }}
      >
        Practice without a wallet.
      </div>
    </Scene>
  );
}
export function PaidFilm() {
  const [handle] = useState(() => delayRender("Crumbs typeface"));
  const { fps } = useVideoConfig();
  useEffect(() => {
    document.fonts.load("16px CrumbsFilm").then(() => continueRender(handle));
  }, [handle]);
  return (
    <AbsoluteFill
      style={{ background: dark, fontFamily: "CrumbsFilm,Arial,sans-serif" }}
    >
      <style>{`@font-face{font-family:CrumbsFilm;src:url(${staticFile("lilitaone.ttf")})}`}</style>
      <Sequence from={0} durationInFrames={5 * fps} premountFor={fps}>
        <Enter />
      </Sequence>
      <Sequence from={5 * fps} durationInFrames={10 * fps} premountFor={fps}>
        <Run />
      </Sequence>
      <Sequence from={15 * fps} durationInFrames={3 * fps} premountFor={fps}>
        <Home />
      </Sequence>
      <Sequence from={18 * fps} durationInFrames={6 * fps} premountFor={fps}>
        <Draw />
      </Sequence>
      <Sequence from={24 * fps} durationInFrames={6 * fps} premountFor={fps}>
        <Return />
      </Sequence>
      <Sequence from={30 * fps} durationInFrames={5 * fps} premountFor={fps}>
        <End />
      </Sequence>
    </AbsoluteFill>
  );
}
