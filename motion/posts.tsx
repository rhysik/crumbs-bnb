import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  delayRender,
  continueRender,
} from "remotion";
const headings: Record<number, string> = {
  2: "Tiny paws. Big plans.",
  3: "One last twist.",
  4: "$NIBBLZ is live.",
  5: "Found our people.",
  6: "Oops. The guards.",
  7: "A little backup.",
  8: "Pick your tiny troublemaker.",
  9: "Your bag is still here.",
  10: "One more tiny heist.",
};
export function Post({ n }: { n: number }) {
  const [handle] = useState(() => delayRender("campaign font"));
  useEffect(() => {
    document.fonts.load("16px CrumbsFilm").then(() => continueRender(handle));
  }, [handle]);
  return (
    <AbsoluteFill
      style={{
        background: "#121416",
        color: "#eee8d9",
        fontFamily: "CrumbsFilm,Arial,sans-serif",
        overflow: "hidden",
      }}
    >
      <style>
        {"@font-face{font-family:CrumbsFilm;src:url(" +
          staticFile("lilitaone.ttf") +
          ")}"}
      </style>
      <Img
        src={staticFile("post-art-" + n + "-v2.webp")}
        style={{ width: 1600, height: 900, objectFit: "cover" }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg,#12141665 0%,transparent 38%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 42,
          fontSize: 32,
          color: "#f0b90b",
        }}
      >
        crumbs
      </div>
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 101,
          fontSize: n === 8 ? 62 : 72,
          lineHeight: 1.08,
          maxWidth: n === 9 || n === 10 ? 460 : 1050,
          textShadow: "0 3px 12px #121416",
        }}
      >
        {headings[n]}
      </div>
    </AbsoluteFill>
  );
}
