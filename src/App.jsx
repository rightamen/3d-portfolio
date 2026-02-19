import Navbar from './sections/Navbar'
import Hero from './sections/Hero'
import About from './sections/About';

const PlaceholderSection = ({ id, title }) => (
  <section id={id} className="c-space flex min-h-screen items-center">
    <h2 className="text-heading text-neutral-300">{title} (Coming Soon)</h2>
  </section>
)

const App = () => {
  return (
    <div id="home" className="container mx-auto max-w-7xl">
      <Navbar />
      <Hero />
      <About />
      <PlaceholderSection id="projects" title="Projects" />
      <PlaceholderSection id="experience" title="Experience" />
      <PlaceholderSection id="testimonials" title="Testimonials" />
      <PlaceholderSection id="contact" title="Contact" />
      <PlaceholderSection id="footer" title="Footer" />
    </div>
  );
};

export default App;
