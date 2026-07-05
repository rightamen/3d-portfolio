import { motion as Motion } from "motion/react";

const Card = ({ style, text, image, rotate = 0, containerRef }) => {
  const baseClass = "absolute cursor-grab select-none";

  if (image) {
    return (
      <Motion.img
        src={image}
        alt=""
        draggable={false}
        drag
        dragConstraints={containerRef}
        className={`${baseClass} w-14`}
        style={style}
        animate={{ rotate }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      />
    );
  }

  return (
    <Motion.div
      className={`${baseClass}
        px-4 py-2
        text-sm
        text-center
        rounded-full
        ring ring-gray-700
        font-extralight
        bg-storm`}
      style={style}
      draggable={false}
      drag
      dragConstraints={containerRef}
      animate={{ rotate }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {text}
    </Motion.div>
  );
};

export default Card;
