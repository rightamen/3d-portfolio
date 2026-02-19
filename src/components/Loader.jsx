import { Html, useProgress } from "@react-three/drei";

const Loader = () => {
  const { progress } = useProgress();
  return (
    <Html className="text-xl font-normal text-center" center>
      {progress}% loaded
    </Html>
  );
};

export default Loader;
