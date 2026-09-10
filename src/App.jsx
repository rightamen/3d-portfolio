import { Suspense, lazy, useEffect, useState } from 'react'
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom'
import {
  getCurrentVisitor,
  getExperience,
  getProfile,
  getProjects,
  getWorks,
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
const ExplorePage = lazy(() => import('./pages/ExplorePage'))
const WorkDetailPage = lazy(() => import('./pages/WorkDetailPage'))
const Hero = lazy(() => import('./sections/Hero'))
const Projects = lazy(() => import('./sections/Projects'))
const Community = lazy(() => import('./sections/Community'))
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
//
// One PUSH is exempt: opening a project detail. That navigation only puts an
// overlay on top of the homepage, so yanking the page underneath it to the top
// would lose the visitor's place in the grid the moment they close it again.
const ScrollToTop = () => {
  const { pathname, state } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (navigationType !== 'PUSH') return
    if (state?.preserveScroll) return
    window.scrollTo(0, 0)
  }, [navigationType, pathname, state])

  return null
}

// The hero deferral that used to live here is gone.
//
// It held the 3D hero back on a cold load of /projects/:slug so the detail
// panel could have the bandwidth -- measured, and it worked: 10.1s median down
// to 7.2s. Then that route started answering 301 at the server and nothing
// links to it any more, so `useMatch` never matched and `ready` started true
// on every render. Dead since then, and kept one round longer only so it would
// be removed deliberately rather than rediscovered as a mystery.

// The homepage owns its own data. It used to live in App behind a
// `pathname !== '/'` guard, which existed only because every route shared one
// component; now the fetch simply does not mount anywhere else.
// Auth and language props went with the navbar when it moved above the
// routes: the homepage no longer renders any chrome of its own.
const HomePage = ({ copy, language, visitorToken }) => {
  const [siteData, setSiteData] = useState({
    ownerHandle: '',
    profile: null,
    skills: [],
    projects: [],
    experience: [],
  })
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    let isMounted = true

    Promise.all([
      getProfile(),
      getProjects(),
      getExperience(),
      // The homepage catalogue is the MARKETPLACE, not the owner's four legacy
      // projects. Until this it showed only their works and would have gone on
      // doing so however many creators joined. Soft-fails: a catalogue that
      // cannot be read should cost the visitor that section, not the homepage.
      getWorks({ limit: 12 }).catch(() => ({ works: [] })),
    ])
      .then(([profilePayload, projectsPayload, experiencePayload, worksPayload]) => {
        if (!isMounted) return

        // A work carries the project field names -- that is why the mapper
        // kept them -- so the catalogue section renders one without a
        // translation layer. `url` becomes `workUrl` because that is the name
        // the section's link already reads.
        const works = (worksPayload.works || []).map((work) => ({
          ...work,
          workUrl: work.url,
        }))

        setSiteData({
          ownerHandle: profilePayload.ownerHandle || '',
          profile: profilePayload.profile,
          skills: profilePayload.skills,
          // Falls back to the legacy catalogue when the marketplace is empty:
          // a fresh install, or a database that predates works, should still
          // show the bundled projects rather than an empty homepage.
          projects: works.length
            ? works
            : // The bundled fallback has no work URL, and the tile links by
              // `url`. Giving it the project address keeps those links real
              // rather than rendering `to={undefined}`.
              (projectsPayload.projects || []).map((project) => ({
                ...project,
                url: project.workUrl || `/projects/${project.slug}`,
              })),
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
      <Suspense fallback={<SectionFallback title="Hero" copy={copy} />}>
        {/* No profile prop: the front door stopped being one person's
            introduction. */}
        <Hero copy={copy} language={language} visitorToken={visitorToken} />
      </Suspense>
      <main className="relative z-10 mx-auto max-w-7xl">
        {/* The publish banner that used to sit here is gone: the hero's second
            button and the top bar's Publish already say it, and three calls to
            publish inside 800px is the same "more site than there is" problem
            as a toolbar icon that does nothing. It stays on /explore, which has
            no hero to carry it. */}
        <Suspense fallback={<SectionFallback title="Projects" copy={copy} />}>
          {/* status, so the grid can tell "nobody has published in this
              category" apart from "the catalogue did not load" -- an empty grid
              with a cheerful empty state is how a fetch failure looks like a
              quiet site. */}
          <Projects
            copy={copy}
            language={language}
            projects={siteData.projects}
            status={status}
          />
        </Suspense>
        <Suspense fallback={<SectionFallback title="Community" copy={copy} />}>
          <Community copy={copy} language={language} />
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
    <HomePage copy={copy} language={language} visitorToken={visitorToken} />
  )

  const communityPage = (
    <Suspense fallback={<SectionFallback title="Community" copy={copy} />}>
      <CommunityPage
        authToken={visitorToken}
        copy={copy}
        language={language}
        visitorLoading={visitorLoading}
        visitorUser={visitorUser}
      />
    </Suspense>
  )

  // The bar's link to the owner's profile needs their handle, and the bar is
  // on every page now. HomePage keeps fetching its own data -- see the note on
  // it -- so this duplicates one small request there and is the only one
  // elsewhere.
  const [ownerHandle, setOwnerHandle] = useState('')
  useEffect(() => {
    let isMounted = true
    getProfile()
      .then((payload) => {
        if (isMounted) setOwnerHandle(payload.ownerHandle || '')
      })
      // A bar that loses one link is better than a bar that fails to render.
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <BrowserRouter>
      <ScrollToTop />
      {/* One bar, above the routes, so every page has the same chrome and the
          same way home. Each page used to carry its own header -- a logo and a
          language switch, repeated six times and drifting -- and the work and
          explore pages had no way back to the homepage at all. */}
      <Navbar
        copy={copy}
        language={language}
        onLanguageChange={setLanguage}
        onVisitorLogout={handleVisitorLogout}
        ownerHandle={ownerHandle}
        visitorToken={visitorToken}
        visitorUser={visitorUser}
      />
      <Routes>
        <Route
          path="/login/*"
          element={
            <Suspense fallback={<SectionFallback title="Login" copy={copy} />}>
              <AuthPage
                authStatus={authStatus}
                copy={copy}
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
              <PublicProfilePage copy={copy} language={language} />
            </Suspense>
          }
        />
        {/* Browse is a flat list and a work is a page of its own, both by
            ADR_PLATFORM_PIVOT §5 -- neither is an overlay on the homepage the
            way /projects/:slug is, so neither keeps the 3D scene mounted. */}
        <Route
          path="/explore"
          element={
            <Suspense fallback={<SectionFallback title="Explore" copy={copy} />}>
              <ExplorePage authToken={visitorToken} copy={copy} language={language} />
            </Suspense>
          }
        />
        <Route
          path="/w/:handle/:slug"
          element={
            <Suspense fallback={<SectionFallback title="Work" copy={copy} />}>
              <WorkDetailPage
                authToken={visitorToken}
                copy={copy}
                language={language}
                visitorUser={visitorUser}
              />
            </Suspense>
          }
        />
        <Route path="/" element={homePage} />
        {/* A project detail is an overlay on the homepage, not a page of its
            own, so it renders the same element. Same element type in the same
            position means React keeps HomePage -- and the 3D scene inside it --
            mounted across the navigation. */}
        <Route path="/projects/:slug" element={homePage} />
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
