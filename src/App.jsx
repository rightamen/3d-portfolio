import { Suspense, lazy } from 'react'
import Navbar from './sections/Navbar'

const Hero = lazy(() => import('./sections/Hero'))
const About = lazy(() => import('./sections/About'))

const PlaceholderSection = ({ id, title }) => (
  <section id={id} className="c-space flex min-h-screen items-center">
    <h2 className="text-heading text-neutral-300">{title} (Coming Soon)</h2>
  </section>
)

const SectionFallback = ({ title }) => (
  <section className="c-space flex min-h-screen items-center">
    <h2 className="text-heading text-neutral-500">Loading {title}...</h2>
  </section>
)

const App = () => {
  return (
    <div id="home" className="container mx-auto max-w-7xl">
      <Navbar />
      <Suspense fallback={<SectionFallback title="Hero" />}>
        <Hero />
      </Suspense>
      <Suspense fallback={<SectionFallback title="About" />}>
        <About />
      </Suspense>
      <PlaceholderSection id="projects" title="Projects" />
      <PlaceholderSection id="experience" title="Experience" />
      <PlaceholderSection id="testimonials" title="Testimonials" />
      <PlaceholderSection id="contact" title="Contact" />
      <PlaceholderSection id="footer" title="Footer" />
    </div>
  )
}

export default App
