import { FlipWords } from "../components/FlipWords";
import { motion } from "motion/react";
const HeroText = () => {
  const words = [
    "High-Quality 3D Models",
    "Optimized Game Assets",
    "Realistic Textures",
    "Creative 3D Designs",
  ];
  const variants = {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0 },
  };
  return (
    <div
      className="
        z-10
        mt-20
        rounded-3xl
        bg-clip-text
        text-center
        md:mt-40
        md:text-left
      "
    >
      {/* Desktop View */}
      <div
        className="
        flex-col
        hidden
        md:flex
        c-space
      "
      >
        <motion.h1
          className="
          text-4xl
          font-medium
        "
          variants={variants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 1 }}
        >
          Hi I'm Right
        </motion.h1>
        <div
          className="
          flex
          flex-col
          items-start
        "
        >
          <motion.p
            className="
            text-5xl
            font-medium
            text-neutral-300
          "
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.2 }}
          >
            A 3D Artist
            <br /> Dedicated to crafting
          </motion.p>
          <motion.div
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.5 }}
          >
            <FlipWords
              words={words}
              className="
                font-black
                text-white
                text-6xl
              "
            />
          </motion.div>
          <motion.p
            className="
            text-4xl
            font-medium
            text-neutral-300
          "
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.8 }}
          >
            Model Creation
          </motion.p>
        </div>
      </div>
      {/* Mobile View */}
      <div
        className="
        flex-
        flex-col
        space-y-6
        md:hidden
      "
      >
        <motion.p
          className="
          text-4xl
          font-medium
        "
          variants={variants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 1 }}
        >
          Hi,I'm Right
        </motion.p>
        <div>
          <motion.p
            className="
              text-4xl
              font-black
              text-neutral-300
          "
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.2 }}
          >
            Crafit
          </motion.p>
          <motion.div
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.5 }}
          >
            <FlipWords
              words={words}
              className="
                font-bold
                text-white
                text-5xl
              "
            />
          </motion.div>
          <motion.p
            className="
            text-4xl
            font-black
            text-neutral-300
          "
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.8 }}
          >
            Model Sculpture
          </motion.p>
        </div>
      </div>
    </div>
  );
};

export default HeroText;
