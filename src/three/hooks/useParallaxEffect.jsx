import { useSpring, useTransform } from "motion/react";
import {
  calculateScrollOffset,
  mapScrollTo3DPosition,
} from "../systems/ScrollEngine";
import useScrollProgress from "./useScrollProgress";

const useParallaxEffect = () => {
  const progress = useScrollProgress();

  const smooth = useSpring(progress, {
    stiffness: 80,
    damping: 20,
    mass: 0.4,
  });

  const mountain3Y = useTransform(smooth, (value) => `${calculateScrollOffset(value, 0, 80)}%`);
  const mountain2Y = useTransform(smooth, (value) => `${calculateScrollOffset(value, 0, 40)}%`);
  const mountain1Y = useTransform(smooth, (value) => `${calculateScrollOffset(value, 0, 10)}%`);
  const planetsX = useTransform(smooth, (value) => `${calculateScrollOffset(value, 0, -30)}%`);

  const blurFar = useTransform(smooth, (value) => `${calculateScrollOffset(value, 2, 6)}px`);
  const blurMid = useTransform(smooth, (value) => `${calculateScrollOffset(value, 1, 3)}px`);

  const scenePosition = useTransform(smooth, (value) =>
    mapScrollTo3DPosition(value, {
      x: [0, -0.3],
      y: [0.25, -0.25],
      z: [0, 0],
    }),
  );

  return {
    mountain3Y,
    mountain2Y,
    mountain1Y,
    planetsX,
    blurFar,
    blurMid,
    scenePosition,
  };
};

export default useParallaxEffect;
