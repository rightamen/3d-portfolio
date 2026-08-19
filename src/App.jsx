import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import {
  getCurrentVisitor,
  getExperience,
  getProfile,
  getProjects,
  loginVisitor,
  logoutVisitor,
  registerVisitor,
  requestPasswordReset,
  resendVisitorVerification,
  resetVisitorPassword,
  verifyVisitorEmail,
} from './lib/api'
import { getCopy, getInitialLanguage } from './lib/i18n'
import Navbar from './sections/Navbar'

const AuthPage = lazy(() => import('./pages/AuthPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const CommunityPage = lazy(() => import('./pages/CommunityPage'))
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage'))
const Hero = lazy(() => import('./sections/Hero'))
const About = lazy(() => import('./sections/About'))
const Projects = lazy(() => import('./sections/Projects'))
const Community = lazy(() => import('./sections/Community'))
const Experience = lazy(() => import('./sections/Experience'))
const Contact = lazy(() => import('./sections/Contact'))
const Footer = lazy(() => import('./sections/Footer'))
const visitorTokenKey = 'mrright-visitor-token'
const getStoredVisitorToken = () => window.localStorage.getItem(visitorTokenKey) || ''

const SectionFallback = ({ title, copy }) => (
  <section className="c-space flex min-h-screen items-center">
    <h2 className="text-heading text-neutral-500">{copy.loading} {title}...</h2>
  </section>
)

// A full page load used to reset the scroll position for us. Client-side
// navigation does not, so do it here -- but only for PUSH. On POP the browser
// restores the previous offset, which is what a Back button should do, and
// scrolling to the top would undo it.
const ScrollToTop = () => {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (navigationType !== 'PUSH') return
    window.scrollTo(0, 0)
  }, [navigationType, pathname])

  return null
}

// The homepage owns its own data. It used to live in App behind a
// `pathname !== '/'` guard, which existed only because every route shared one
// component; now the fetch simply does not mount anywhere else.
const HomePage = ({
  authStatus,
  copy,
  language,
  onLanguageChange,
  onVisitorLogin,
  onVisitorLogout,
  onVisitorRegister,
  visitorToken,
  visitorUser,
}) => {
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
    <div id="home" className="site-home min-h-screen overflow-hidden">
      <Navbar
        authStatus={authStatus}
        copy={copy}
        language={language}
        onLanguageChange={onLanguageChange}
        onVisitorLogin={onVisitorLogin}
        onVisitorLogout={onVisitorLogout}
        onVisitorRegister={onVisitorRegister}
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
          <Community copy={copy} />
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

const App = () => {
  const [language, setLanguage] = useState(getInitialLanguage)
  const copy = getCopy(language)
  const [visitorToken, setVisitorToken] = useState(getStoredVisitorToken)
  const [visitorUser, setVisitorUser] = useState(null)
  const [visitorSessionChecked, setVisitorSessionChecked] = useState(() => !getStoredVisitorToken())
  const [authStatus, setAuthStatus] = useState('idle')
  const visitorLoading = !visitorSessionChecked

  useEffect(() => {
    window.localStorage.setItem('mrright-language', language)
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language === 'ja' ? 'ja' : 'en'
  }, [language])

  useEffect(() => {
    const syncVisitorToken = () => {
      const storedToken = getStoredVisitorToken()

      setVisitorToken((currentToken) => {
        if (currentToken === storedToken) return currentToken
        if (!storedToken) {
          setVisitorUser(null)
          setVisitorSessionChecked(true)
        } else {
          setVisitorSessionChecked(false)
        }
        return storedToken
      })
    }

    const handleStorage = (event) => {
      if (event.key === visitorTokenKey) syncVisitorToken()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncVisitorToken()
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', syncVisitorToken)
    window.addEventListener('pageshow', syncVisitorToken)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', syncVisitorToken)
      window.removeEventListener('pageshow', syncVisitorToken)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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
      .finally(() => {
        if (isMounted) setVisitorSessionChecked(true)
      })

    return () => {
      isMounted = false
    }
  }, [visitorToken])

  const saveVisitorSession = (payload) => {
    window.localStorage.setItem(visitorTokenKey, payload.session.token)
    setVisitorToken(payload.session.token)
    setVisitorUser(payload.user)
    setVisitorSessionChecked(true)
  }

  const handleVisitorLogin = async (payload) => {
    setAuthStatus('saving')
    try {
      const result = await loginVisitor(payload)
      saveVisitorSession(result)
      setAuthStatus('idle')
      return result
    } catch (error) {
      setAuthStatus(error.code === 'SERVICE_UNAVAILABLE' ? 'unavailable' : 'error')
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
      setAuthStatus(error.code === 'SERVICE_UNAVAILABLE' ? 'unavailable' : 'error')
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
      setAuthStatus(error.code === 'SERVICE_UNAVAILABLE' ? 'unavailable' : 'error')
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
      setAuthStatus(error.code === 'SERVICE_UNAVAILABLE' ? 'unavailable' : 'error')
      throw error
    }
  }

  const handleRequestPasswordReset = async (payload) => {
    setAuthStatus('saving')
    try {
      const result = await requestPasswordReset(payload)
      setAuthStatus('idle')
      return result
    } catch (error) {
      setAuthStatus(error.code === 'SERVICE_UNAVAILABLE' ? 'unavailable' : 'error')
      throw error
    }
  }

  // The reset response carries a fresh session: the server drops every session
  // the account had, so without this the visitor would land on a sign-in form
  // immediately after proving control of the address.
  const handleResetPassword = async (payload) => {
    setAuthStatus('saving')
    try {
      const result = await resetVisitorPassword(payload)
      saveVisitorSession(result)
      setAuthStatus('idle')
      return result
    } catch (error) {
      setAuthStatus(error.code === 'SERVICE_UNAVAILABLE' ? 'unavailable' : 'error')
      throw error
    }
  }

  const handleVisitorLogout = async () => {
    const token = visitorToken
    window.localStorage.removeItem(visitorTokenKey)
    setVisitorToken('')
    setVisitorUser(null)
    setVisitorSessionChecked(true)
    if (token) logoutVisitor(token).catch(() => {})
  }

  const homePage = (
    <HomePage
      authStatus={authStatus}
      copy={copy}
      language={language}
      onLanguageChange={setLanguage}
      onVisitorLogin={handleVisitorLogin}
      onVisitorLogout={handleVisitorLogout}
      onVisitorRegister={handleVisitorRegister}
      visitorToken={visitorToken}
      visitorUser={visitorUser}
    />
  )

  const communityPage = (
    <Suspense fallback={<SectionFallback title="Community" copy={copy} />}>
      <CommunityPage
        authToken={visitorToken}
        copy={copy}
        language={language}
        onLanguageChange={setLanguage}
        visitorLoading={visitorLoading}
        visitorUser={visitorUser}
      />
    </Suspense>
  )

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route
          path="/login/*"
          element={
            <Suspense fallback={<SectionFallback title="Login" copy={copy} />}>
              <AuthPage
                authStatus={authStatus}
                copy={copy}
                language={language}
                onLanguageChange={setLanguage}
                onLogin={handleVisitorLogin}
                onRegister={handleVisitorRegister}
                onRequestPasswordReset={handleRequestPasswordReset}
                onResendVerification={handleVisitorResendVerification}
                onResetPassword={handleResetPassword}
                onVerifyEmail={handleVisitorVerifyEmail}
                visitorUser={visitorUser}
              />
            </Suspense>
          }
        />
        <Route
          path="/account/*"
          element={
            <Suspense fallback={<SectionFallback title="Account" copy={copy} />}>
              <AccountPage
                authToken={visitorToken}
                copy={copy}
                language={language}
                onLanguageChange={setLanguage}
                onLogout={handleVisitorLogout}
                visitorLoading={visitorLoading}
                visitorUser={visitorUser}
              />
            </Suspense>
          }
        />
        <Route
          path="/u/:handle/*"
          element={
            <Suspense fallback={<SectionFallback title="Profile" copy={copy} />}>
              <PublicProfilePage
                copy={copy}
                language={language}
                onLanguageChange={setLanguage}
              />
            </Suspense>
          }
        />
        <Route path="/" element={homePage} />
        <Route path="/community" element={communityPage} />
        <Route path="/community/:postId/*" element={communityPage} />
        {/* The trailing splats keep the prefix semantics the pathname checks
            had before the router existed: /account/anything used to render the
            account page, and unknown paths still fall through to the
            homepage. */}
        <Route path="*" element={homePage} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
