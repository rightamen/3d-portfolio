import { Suspense, lazy, useEffect, useState } from 'react'
import {
  getCurrentVisitor,
  getExperience,
  getProfile,
  getProjects,
  loginVisitor,
  logoutVisitor,
  registerVisitor,
  resendVisitorVerification,
  verifyVisitorEmail,
} from './lib/api'
import { getCopy, getInitialLanguage } from './lib/i18n'
import Navbar from './sections/Navbar'

const AuthPage = lazy(() => import('./pages/AuthPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const Hero = lazy(() => import('./sections/Hero'))
const About = lazy(() => import('./sections/About'))
const Projects = lazy(() => import('./sections/Projects'))
const Community = lazy(() => import('./sections/Community'))
const Experience = lazy(() => import('./sections/Experience'))
const Contact = lazy(() => import('./sections/Contact'))
const Footer = lazy(() => import('./sections/Footer'))
const visitorTokenKey = 'mrright-visitor-token'

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
  const [visitorToken, setVisitorToken] = useState(
    () => window.localStorage.getItem(visitorTokenKey) || '',
  )
  const [visitorUser, setVisitorUser] = useState(null)
  const [authStatus, setAuthStatus] = useState('idle')
  const visitorLoading = Boolean(visitorToken && !visitorUser)

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

  useEffect(() => {
    let isMounted = true

    if (!visitorToken) {
      return () => {
        isMounted = false
      }
    }

    getCurrentVisitor(visitorToken)
      .then((payload) => {
        if (!isMounted) return
        setVisitorUser(payload.user)
        if (!payload.user) {
          window.localStorage.removeItem(visitorTokenKey)
          setVisitorToken('')
        }
      })
      .catch(() => {
        if (!isMounted) return
        window.localStorage.removeItem(visitorTokenKey)
        setVisitorToken('')
        setVisitorUser(null)
      })

    return () => {
      isMounted = false
    }
  }, [visitorToken])

  const saveVisitorSession = (payload) => {
    window.localStorage.setItem(visitorTokenKey, payload.session.token)
    setVisitorToken(payload.session.token)
    setVisitorUser(payload.user)
  }

  const handleVisitorLogin = async (payload) => {
    setAuthStatus('saving')
    try {
      const result = await loginVisitor(payload)
      saveVisitorSession(result)
      setAuthStatus('idle')
    } catch (error) {
      setAuthStatus(error.message.includes('not configured') ? 'unavailable' : 'error')
      throw error
    }
  }

  const handleVisitorRegister = async (payload) => {
    setAuthStatus('saving')
    try {
      const result = await registerVisitor(payload)
      setAuthStatus('idle')
      return result
    } catch (error) {
      setAuthStatus(error.message.includes('not configured') ? 'unavailable' : 'error')
      throw error
    }
  }

  const handleVisitorVerifyEmail = async (payload) => {
    setAuthStatus('saving')
    try {
      const result = await verifyVisitorEmail(payload)
      saveVisitorSession(result)
      setAuthStatus('idle')
      return result
    } catch (error) {
      setAuthStatus(error.message.includes('not configured') ? 'unavailable' : 'error')
      throw error
    }
  }

  const handleVisitorResendVerification = async (payload) => {
    setAuthStatus('saving')
    try {
      const result = await resendVisitorVerification(payload)
      setAuthStatus('idle')
      return result
    } catch (error) {
      setAuthStatus(error.message.includes('not configured') ? 'unavailable' : 'error')
      throw error
    }
  }

  const handleVisitorLogout = async () => {
    const token = visitorToken
    window.localStorage.removeItem(visitorTokenKey)
    setVisitorToken('')
    setVisitorUser(null)
    if (token) logoutVisitor(token).catch(() => {})
  }

  const routePath = window.location.pathname

  if (routePath.startsWith('/login')) {
    return (
      <Suspense fallback={<SectionFallback title="Login" copy={copy} />}>
        <AuthPage
          authStatus={authStatus}
          copy={copy}
          language={language}
          onLanguageChange={setLanguage}
          onLogin={handleVisitorLogin}
          onRegister={handleVisitorRegister}
          onResendVerification={handleVisitorResendVerification}
          onVerifyEmail={handleVisitorVerifyEmail}
          visitorUser={visitorUser}
        />
      </Suspense>
    )
  }

  if (routePath.startsWith('/account')) {
    return (
      <Suspense fallback={<SectionFallback title="Account" copy={copy} />}>
        <AccountPage
          copy={copy}
          language={language}
          onLanguageChange={setLanguage}
          onLogout={handleVisitorLogout}
          visitorLoading={visitorLoading}
          visitorUser={visitorUser}
        />
      </Suspense>
    )
  }

  return (
    <div id="home" className="min-h-screen overflow-hidden">
      <Navbar
        authStatus={authStatus}
        copy={copy}
        language={language}
        onLanguageChange={setLanguage}
        onVisitorLogin={handleVisitorLogin}
        onVisitorLogout={handleVisitorLogout}
        onVisitorRegister={handleVisitorRegister}
        visitorUser={visitorUser}
      />
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
          <Projects
            authToken={visitorToken}
            copy={copy}
            language={language}
            projects={siteData.projects}
            visitorUser={visitorUser}
          />
        </Suspense>
        <Suspense fallback={<SectionFallback title="Community" copy={copy} />}>
          <Community
            authToken={visitorToken}
            copy={copy}
            language={language}
            visitorUser={visitorUser}
          />
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
