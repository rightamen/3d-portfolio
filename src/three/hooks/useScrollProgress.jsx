import { useScroll, useTransform } from "motion/react";
import { getScrollProgress } from "../systems/ScrollEngine";

const useScrollProgress = () => {
  const { scrollY } = useScroll();

  const progress = useTransform(() => {
    if (typeof window === "undefined") return 0;

    return getScrollProgress(
      scrollY.get(),
      document.documentElement.scrollHeight,
      window.innerHeight,
    );
  });

  return progress;
};

export default useScrollProgress;
