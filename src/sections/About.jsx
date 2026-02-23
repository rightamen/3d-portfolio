import { useRef } from "react";
import Card from "../components/Card";

const About = () => {
  const grid2Container = useRef(null);
  return (
    <section className="c-space section-spacing">
      <h2 className="text-heading">About Me</h2>

      <div
        className="
        grid grid-cols-1 gap-4
        md:grid-cols-6
        auto-rows-auto
        md:auto-rows-[18rem]
        mt-12
      "
      >
        {/* Grid 1 */}
        <div
          className="
          relative
          grid-default-color grid-1
          overflow-hidden
        "
        >
          {/* Decorative Image */}
          <img
            src="assets/coding-pov.png"
            alt="coding pov"
            className="
              pointer-events-none
              absolute
              opacity-20
              scale-[1.2]
              right-[-3rem]
              top-[-1rem]

              md:opacity-100
              md:scale-[2.5]
              md:right-[-6rem]
            "
          />

          {/* Scroll Container */}
          <div
            className="
              relative z-10
              h-full
              overflow-y-auto
              overscroll-contain
              p-6
              space-y-4

              scrollbar-thin
              scrollbar-thumb-white/20
              scrollbar-track-transparent
            "
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {/* Sticky Header */}
            <p className="text-lg font-semibold tracking-wide">Hi, I'm Right</p>

            <p className="text-[clamp(0.9rem,1.5vw,1rem)] leading-relaxed opacity-90">
              我是一名以三维空间为主要媒介的数字艺术创作者，专注于形体语言与视觉结构的表达。
              通过 ZBrush、Maya、Blender 与 3ds Max
              等工具，我探索雕塑感、材质与光影之间的关系，
              将抽象构想转化为可感知的空间实体。我的创作关注形式本身，以及数字媒介在艺术表达中的可能性。
            </p>

            <div className="h-px w-12 bg-white/20" />

            <p className="text-[clamp(0.8rem,1.3vw,0.95rem)] leading-relaxed opacity-80">
              I am a digital 3D artist working primarily with spatial form as a
              medium of expression. Using ZBrush, Maya, Blender, and 3ds Max, I
              explore sculptural qualities, structure, and light interaction to
              translate abstract ideas into tangible visual forms. My practice
              focuses on form, perception, and the expressive potential of
              digital space.
            </p>

            {/* Extra spacing bottom so last line not clipped */}
            <div className="h-4" />
          </div>
        </div>

        {/* Grid 2 */}
        <div className="grid-default-color grid-2">
          <div
            ref={grid2Container}
            className="relative flex items-center justify-center w-full h-full"
          >
            <p className="flex items-end text-5xl text-gray-500">
              MODEL IS CRAFT
            </p>
            <Card
              rotate={30}
              style={{ top: "30%", left: "20%" }}
              text="Form"
              containerRef={grid2Container}
            />
            <Card
              rotate={-30}
              style={{ top: "60%", left: "45%" }}
              text="Structure"
              containerRef={grid2Container}
            />
            <Card
              rotate={90}
              style={{ bottom: "30%", left: "70%" }}
              text="Light"
              containerRef={grid2Container}
            />
            <Card
              rotate={-45}
              style={{ top: "55%", left: "0%" }}
              text="Materiality"
              containerRef={grid2Container}
            />
            <Card
              rotate={20}
              style={{ top: "10%", left: "30%" }}
              text="Sculptural"
              containerRef={grid2Container}
            />
            <Card
              rotate={30}
              style={{ top: "70%", left: "70%" }}
              image="assets/logos/autodesk-max.svg"
              containerRef={grid2Container}
            />
            <Card
              rotate={-45}
              style={{ top: "70%", left: "25%" }}
              image="assets/logos/autodeskmaya.svg"
              containerRef={grid2Container}
            />
            <Card
              rotate={-45}
              style={{ top: "5%", left: "10%" }}
              image="assets/logos/blender.svg"
              containerRef={grid2Container}
            />
            <Card
              rotate={20}
              style={{ top: "25%", left: "70%" }}
              image="assets/logos/zbrush.svg"
              containerRef={grid2Container}
            />
          </div>
        </div>

        {/* Grid 3 */}
        <div className="grid-black-color grid-3"></div>

        {/* Grid 4 */}
        <div className="grid-special-color grid-4"></div>

        {/* Grid 5 */}
        <div className="grid-default-color grid-5"></div>
      </div>
    </section>
  );
};

export default About;
