import { Suspense, lazy, useEffect, useState } from 'react'
import { getExperience, getProfile, getProjects } from './lib/api'
import { getCopy, getInitialLanguage } from './lib/i18n'
import Navbar from './sections/Navbar'

const Hero = lazy(() => import('./sections/Hero'))
const About = lazy(() => import('./sections/About'))
const Projects = lazy(() => import('./sections/Projects'))
const Experience = lazy(() => import('./sections/Experience'))
const Contact = lazy(() => import('./sections/Contact'))
const Footer = lazy(() => import('./sections/Footer'))

const SectionFallback = ({ title, copy }) => (
  <section className="c-space flex min-h-screen items-center">
    <h2 className="text-heading text-neutral-500">{copy.loading} {title}...</h2>
  </section>
)

const App = () => {
  const [language, setLanguage] = useState(getInitialLanguage)
  const copy = getCopy(language)
  const [siteData, setSiteData] = useState({
    profile: null,
    skills: [],
    projects: [],
    experience: [],
  })
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    window.localStorage.setItem('mrright-language', language)
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language === 'ja' ? 'ja' : 'en'
  }, [language])

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
      <Navbar language={language} onLanguageChange={setLanguage} copy={copy} />
      <Suspense fallback={<SectionFallback title="Hero" copy={copy} />}>
        <Hero profile={siteData.profile} status={status} language={language} copy={copy} />
      </Suspense>
      <main className="relative z-10 mx-auto max-w-7xl">
        <Suspense fallback={<SectionFallback title="About" copy={copy} />}>
          <About
            profile={siteData.profile}
            skills={siteData.skills}
            language={language}
            copy={copy}
          />
        </Suspense>
        <Suspense fallback={<SectionFallback title="Projects" copy={copy} />}>
          <Projects projects={siteData.projects} language={language} copy={copy} />
        </Suspense>
        <Suspense fallback={<SectionFallback title="Experience" copy={copy} />}>
          <Experience
            experience={siteData.experience}
            skills={siteData.skills}
            language={language}
            copy={copy}
          />
        </Suspense>
        <Suspense fallback={<SectionFallback title="Contact" copy={copy} />}>
          <Contact profile={siteData.profile} copy={copy} />
        </Suspense>
        <Suspense fallback={null}>
          <Footer profile={siteData.profile} copy={copy} />
        </Suspense>
      </main>
    </div>
  )
}

export default App
