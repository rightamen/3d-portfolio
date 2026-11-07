import './communication.css'
import { Suspense, lazy, useEffect, useState } from 'react'
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom'
import {
  getProfile,
  getWorks,
  loginVisitor,
  registerVisitor,
  requestPasswordReset,
  resendVisitorVerification,
  resetVisitorPassword,
  verifyVisitorEmail,
} from './lib/api'
import { isExhibitionEligible } from '../server/exhibition.js'
import { getCopy, getInitialLanguage } from './lib/i18n'
import { useVisitorSession } from './hooks/useVisitorSession'
import Navbar from './sections/Navbar'
import ModuleEffects from './components/ModuleEffects'

const AuthPage = lazy(() => import('./pages/AuthPage'))
const InterfaceSettings = lazy(() => import('./components/InterfaceSettings'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const CommunityPage = lazy(() => import('./pages/CommunityPage'))
const MessagesPage = lazy(() => import('./pages/MessagesPage'))
const FollowingFeedPage = lazy(() => import('./pages/FollowingFeedPage'))
const CreatorsPage = lazy(() => import('./pages/CreatorsPage'))
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage'))
const ExplorePage = lazy(() => import('./pages/ExplorePage'))
const WorkDetailPage = lazy(() => import('./pages/WorkDetailPage'))
const Hero = lazy(() => import('./sections/Hero'))
const Projects = lazy(() => import('./sections/Projects'))
const Community = lazy(() => import('./sections/Community'))
const Footer = lazy(() => import('./sections/Footer'))

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
const HomePage = ({ copy, language, profile, visitorToken }) => {
  const [projects, setProjects] = useState([])
  const [exhibition, setExhibition] = useState({ works: [], status: 'loading', demo: false })
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    let isMounted = true

    // The catalogue depends only on works. A slow owner profile must not hold
    // up the grid, and an API failure must not masquerade as a legacy catalogue.
    getWorks({ limit: 12 })
      .then((worksPayload) => {
        if (!isMounted) return
        setProjects(worksPayload.works || [])
        setStatus('ready')
      })
      .catch(() => {
        if (isMounted) setStatus('error')
      })

    // Selection has its own server-filtered request: an older qualifying work
    // must not disappear just because it is outside the newest twelve.
    getWorks({ exhibition: true, limit: 8 })
      .then(payload => {
        if (isMounted) setExhibition({ works: (payload.works || []).filter(isExhibitionEligible), status: 'ready', demo: import.meta.env.DEV && payload.previewDemo === true })
      })
      .catch(() => {
        if (isMounted) setExhibition({ works: [], status: 'error' })
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
        <Hero copy={copy} language={language} visitorToken={visitorToken} works={exhibition.works} status={exhibition.status} demo={exhibition.demo} />
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
            projects={projects}
            status={status}
          />
        </Suspense>
        <Suspense fallback={<SectionFallback title="Community" copy={copy} />}>
          <Community copy={copy} language={language} />
        </Suspense>
        <Suspense fallback={null}>
          <Footer profile={profile} copy={copy} />
        </Suspense>
      </main>
    </div>
  )
}

const App = () => {
  const [language, setLanguage] = useState(getInitialLanguage)
  const copy = getCopy(language)
  const {
    visitorToken, visitorUser, visitorLoading, visitorSessionError, retrySession,
    saveSession: saveVisitorSession, logout: handleVisitorLogout,
  } = useVisitorSession()
  const [authStatus, setAuthStatus] = useState('idle')

  useEffect(() => {
    window.localStorage.setItem('mrright-language', language)
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language === 'ja' ? 'ja' : 'en'
  }, [language])

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

  // Share one profile response between the navbar and footer.
  const [siteProfile, setSiteProfile] = useState(null)
  useEffect(() => {
    let isMounted = true
    getProfile()
      .then((payload) => {
        if (isMounted) setSiteProfile(payload)
      })
      // A bar that loses one link is better than a bar that fails to render.
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [])

  const homePage = (
    <HomePage copy={copy} language={language} profile={siteProfile?.profile} visitorToken={visitorToken} />
  )

  return (
    <BrowserRouter>
      <div className="studio-app">
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
        onRetrySession={retrySession}
        ownerHandle={siteProfile?.ownerHandle || ''}
        visitorToken={visitorToken}
        visitorUser={visitorUser}
        visitorLoading={visitorLoading}
        visitorSessionError={visitorSessionError}
      />
      <ModuleEffects>
      <Routes>
        <Route path="/messages/:threadId?" element={<Suspense fallback={<SectionFallback title={copy.commMessages} copy={copy}/>}><MessagesPage key={visitorToken} visitorUser={visitorUser} copy={copy} language={language} authToken={visitorToken}/></Suspense>}/>
        <Route path="/following" element={<Suspense fallback={<SectionFallback title={copy.commFollowing} copy={copy}/>}><FollowingFeedPage key={visitorToken} copy={copy} language={language} authToken={visitorToken}/></Suspense>}/>
        <Route path="/creators" element={<Suspense fallback={<SectionFallback title={copy.socialCreators} copy={copy}/>}><CreatorsPage copy={copy} language={language} authToken={visitorToken} visitorUser={visitorUser}/></Suspense>}/>
        <Route path="/settings" element={<Suspense fallback={<SectionFallback title={copy.systemSettings} copy={copy} />}><InterfaceSettings language={language} standalone /></Suspense>} />
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
                key={visitorToken}
                authToken={visitorToken}
                copy={copy}
                language={language}
                onLanguageChange={setLanguage}
                onLogout={handleVisitorLogout}
                onRetrySession={retrySession}
                visitorLoading={visitorLoading}
                visitorSessionError={visitorSessionError}
                visitorUser={visitorUser}
              />
            </Suspense>
          }
        />
        <Route
          path="/u/:handle/*"
          element={
            <Suspense fallback={<SectionFallback title="Profile" copy={copy} />}>
              <PublicProfilePage copy={copy} language={language} authToken={visitorToken} visitorUser={visitorUser} />
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
      </ModuleEffects>
    </div>
    </BrowserRouter>
  )
}

export default App
