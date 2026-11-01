import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  delayRender,
  continueRender,
} from "remotion";
const yellow = "#F0B90B",
  paper = "#EEE8D9",
  dark = "#121416";
const Art = ({ name, style }: any) => (
  <Img src={staticFile(name)} style={style} />
);
function Wheel() {
  return (
    <div
      style={{
        width: 510,
        height: 510,
        border: "12px solid " + paper,
        borderRadius: "50%",
        background:
          "conic-gradient(#343a3c 0deg 216deg,#f0b90b 216deg 342deg,#b9c9c0 342deg 358.2deg,#fff 358.2deg)",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 184,
          top: 184,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: dark,
          display: "grid",
          placeItems: "center",
          fontSize: 36,
        }}
      >
        BNB
      </div>
    </div>
  );
}
export function Post({ n }: any) {
  const [h] = useState(() => delayRender("post font"));
  useEffect(() => {
    document.fonts.load("16px CrumbsFilm").then(() => continueRender(h));
  }, [h]);
  const headlines: Record<number, React.ReactNode> = {
    2: (
      <>
        Different maps.
        <br />
        Same appetite.
      </>
    ),
    3: (
      <>
        One last
        <br />
        twist.
      </>
    ),
    4: (
      <>
        $NIBBLZ
        <br />
        is live.
      </>
    ),
    5: (
      <>
        The mouse found
        <br />
        its people.
      </>
    ),
    6: (
      <>
        Guards want
        <br />
        your bag.
      </>
    ),
    7: (
      <>
        Every entry.
        <br />
        Reserved first.
      </>
    ),
    8: (
      <>
        Same chaos.
        <br />
        Different crew.
      </>
    ),
    9: (
      <>
        Close the tab.
        <br />
        Keep your return.
      </>
    ),
    10: (
      <>
        One more
        <br />
        run.
      </>
    ),
  };
  return (
    <AbsoluteFill
      style={{
        background: dark,
        color: paper,
        fontFamily: "CrumbsFilm,Arial,sans-serif",
        overflow: "hidden",
      }}
    >
      <style>
        {"@font-face{font-family:CrumbsFilm;src:url(" +
          staticFile("lilitaone.ttf") +
          ")}"}
      </style>
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 55,
          fontSize: 44,
          color: yellow,
        }}
      >
        crumbs
      </div>
      <div
        style={{
          position: "absolute",
          left: 80,
          top: n === 5 ? 155 : 220,
          fontSize: n === 9 ? 92 : 112,
          lineHeight: 1.02,
          letterSpacing: -2,
          maxWidth: n === 5 ? 1200 : n === 8 ? 800 : 850,
          zIndex: 2,
        }}
      >
        {headlines[n]}
      </div>
      {n === 2 && (
        <>
          <Art
            name="crate.png"
            style={{ position: "absolute", right: 290, top: 180, width: 180 }}
          />
          <Art
            name="crate.png"
            style={{ position: "absolute", right: 90, top: 430, width: 160 }}
          />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Art
              key={i}
              name="crumb.png"
              style={{
                position: "absolute",
                right: 100 + (i % 3) * 130,
                top: 210 + Math.floor(i / 3) * 270,
                width: 65,
              }}
            />
          ))}
          <Art
            name="mouse-v1.png"
            style={{
              position: "absolute",
              right: 280,
              bottom: 40,
              height: 380,
            }}
          />
        </>
      )}
      {n === 3 && (
        <>
          <div style={{ position: "absolute", right: 95, top: 180 }}>
            <Wheel />
          </div>
          <div
            style={{
              position: "absolute",
              left: 85,
              bottom: 120,
              fontSize: 29,
              color: yellow,
            }}
          >
            40% higher gross returns.
            <br />
            Gas is separate.
          </div>
        </>
      )}
      {n === 4 && (
        <Art
          name="mouse-v1.png"
          style={{ position: "absolute", right: 120, bottom: 20, height: 680 }}
        />
      )}
      {n === 5 && (
        <Art
          name="crew-v1.png"
          style={{ position: "absolute", bottom: 30, left: 240, width: 1120 }}
        />
      )}
      {n === 8 && (
        <>
          <Art
            name="veteran.png"
            style={{ position: "absolute", right: 105, top: 155, height: 660 }}
          />
          <div
            style={{
              position: "absolute",
              left: 85,
              bottom: 150,
              color: yellow,
              fontSize: 32,
            }}
          >
            Earn the look. Keep the game fair.
          </div>
        </>
      )}
      {n === 6 && (
        <>
          <Art
            name="guard-v1.png"
            style={{
              position: "absolute",
              right: 430,
              top: 335,
              height: 535,
              width: 330,
              objectFit: "contain",
              transform: "rotate(-8deg)",
            }}
          />
          <Art
            name="mouse-v1.png"
            style={{ position: "absolute", right: 65, top: 125, height: 475 }}
          />
          <Art
            name="crumb.png"
            style={{ position: "absolute", right: 90, bottom: 80, width: 85 }}
          />
        </>
      )}
      {n === 7 && (
        <>
          <div
            style={{
              position: "absolute",
              right: 100,
              top: 240,
              width: 430,
              fontSize: 26,
            }}
          >
            <div
              style={{
                height: 115,
                background: "#343a3c",
                padding: 35,
                marginBottom: 15,
              }}
            >
              Player returns
            </div>
            <div
              style={{
                height: 115,
                background: yellow,
                color: dark,
                padding: 35,
              }}
            >
              Locked before play
            </div>
            <div style={{ marginTop: 30, fontSize: 24 }}>
              Unreserved funds stay separate.
            </div>
          </div>
        </>
      )}
      {n === 9 && (
        <>
          <Art
            name="burrow.png"
            style={{ position: "absolute", right: 95, bottom: 50, width: 460 }}
          />
          <Art
            name="mouse-v1.png"
            style={{ position: "absolute", right: 255, top: 200, height: 400 }}
          />
        </>
      )}
      {n === 10 && (
        <>
          <Art
            name="mouse-v1.png"
            style={{
              position: "absolute",
              right: 190,
              bottom: 20,
              height: 650,
            }}
          />
          {[0, 1, 2].map((i) => (
            <Art
              key={i}
              name="crumb.png"
              style={{
                position: "absolute",
                left: 150 + i * 145,
                bottom: 130,
                width: 75,
              }}
            />
          ))}
        </>
      )}
    </AbsoluteFill>
  );
}
