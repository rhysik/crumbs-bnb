import React from "react";
import { Composition, Still } from "remotion";
import { Post } from "./posts";
import { PaidFilm } from "./paid-film";
export function Root() {
  return (
    <>
      <Composition
        id="CrumbsLaunch"
        component={PaidFilm}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={1050}
      />
      {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <Still
          key={n}
          id={"Post" + n}
          component={Post}
          defaultProps={{ n }}
          width={1600}
          height={900}
        />
      ))}
    </>
  );
}
