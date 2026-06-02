import { Suspense, lazy, useEffect, useState } from 'react'
import { getExperience, getProfile, getProjects } from './lib/api'
import Navbar from './sections/Navbar'

const Hero = lazy(() => import('./sections/Hero'))
const About = lazy(() => import('./sections/About'))
const Projects = lazy(() => import('./sections/Projects'))
const Experience = lazy(() => import('./sections/Experience'))
const Contact = lazy(() => import('./sections/Contact'))
const Footer = lazy(() => import('./sections/Footer'))

const SectionFallback = ({ title }) => (
  <section className="c-space flex min-h-screen items-center">
    <h2 className="text-heading text-neutral-500">Loading {title}...</h2>
  </section>
)

const App = () => {
  const [siteData, setSiteData] = useState({
    profile: null,
    skills: [],
    projects: [],
    experience: [],
  })
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let isMounted = true

    Promise.all([getProfile(), getProjects(), getExperience()])
      .then(([profilePayload, projectsPayload, experiencePayload]) => {
        if (!isMounted) return

        setSiteData({
          profile: profilePayload.profile,
          skills: profilePayload.skills,
          projects: projectsPayload.projects,
          experience: experiencePayload.experience,
        })
        setStatus('ready')
      })
      .catch(() => {
        if (isMounted) setStatus('error')
      })

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div id="home" className="min-h-screen overflow-hidden">
      <Navbar />
      <Suspense fallback={<SectionFallback title="Hero" />}>
        <Hero profile={siteData.profile} status={status} />
      </Suspense>
      <main className="relative z-10 mx-auto max-w-7xl">
        <Suspense fallback={<SectionFallback title="About" />}>
          <About profile={siteData.profile} skills={siteData.skills} />
        </Suspense>
        <Suspense fallback={<SectionFallback title="Projects" />}>
          <Projects projects={siteData.projects} />
        </Suspense>
        <Suspense fallback={<SectionFallback title="Experience" />}>
          <Experience experience={siteData.experience} skills={siteData.skills} />
        </Suspense>
        <Suspense fallback={<SectionFallback title="Contact" />}>
          <Contact profile={siteData.profile} />
        </Suspense>
        <Suspense fallback={null}>
          <Footer profile={siteData.profile} />
        </Suspense>
      </main>
    </div>
  )
}

export default App
