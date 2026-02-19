import Navbar from './sections/Navbar'
import Hero from './sections/Hero'

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

      <PlaceholderSection id="about" title="About" />
      <PlaceholderSection id="work" title="Work" />
      <PlaceholderSection id="contact" title="Contact" />
    </div>
  )
}

export default App
