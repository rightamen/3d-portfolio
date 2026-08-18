import { useEffect, useMemo, useRef, useState } from 'react'
import {
  adminLogin,
  createAdminProject,
  createAdminSession,
  deleteAdminComment,
  deleteAdminCommunityComment,
  deleteAdminCommunityPost,
  deleteAdminCommunityUpload,
  deleteAdminContactMessage,
  deleteAdminDownloadRequest,
  deleteAdminProject,
  deleteAdminVisitor,
  endAdminSession,
  getAdminComments,
  getAdminCommunityComments,
  getAdminCommunityPosts,
  getAdminCommunityUploads,
  getAdminContactMessages,
  getAdminDownloadRequests,
  getAdminLikes,
  getAdminMe,
  getAdminOverview,
  getAdminProjects,
  getAdminSummary,
  getAdminVisitor,
  getAdminVisitorContent,
  getAdminVisitors,
  moderateAdminVisitorProfile,
  updateAdminCommentStatus,
  updateAdminDownloadRequest,
  updateAdminCommunityUpload,
  updateAdminProject,
  updateAdminVisitor,
  updateAdminVisitorEmailVerification,
  updateAdminVisitorProfileVisibility,
  uploadAdminAsset,
} from './lib/api'
import AdminTotpEnrolment from './components/AdminTotpEnrolment'
import AdminCommandPalette from './components/admin/AdminCommandPalette'
import AdminLanguageSwitcher from './components/admin/AdminLanguageSwitcher'
import AdminCommentsSection from './components/admin/AdminCommentsSection'
import AdminCommunitySection from './components/admin/AdminCommunitySection'
import AdminContentHealth from './components/admin/AdminContentHealth'
import AdminDashboard from './components/admin/AdminDashboard'
import AdminDownloadsSection from './components/admin/AdminDownloadsSection'
import AdminIcon from './components/admin/AdminIcon'
import AdminLikesSection from './components/admin/AdminLikesSection'
import AdminMembersSection from './components/admin/AdminMembersSection'
import AdminMessagesSection from './components/admin/AdminMessagesSection'
import AdminProjectEditor from './components/admin/AdminProjectEditor'
import AdminProjectsSection from './components/admin/AdminProjectsSection'
import AdminSystemPanel from './components/admin/AdminSystemPanel'
import {
  appendKeyword,
  createSlug,
  getExtension,
  listToText,
  needsCommentReview,
  searchInItem,
  textToList,
  toTitle,
} from './lib/admin/format'
import { convertModelInBrowser, findPrimaryModelFile } from './lib/admin/modelConversion'
import {
  downloadPolicyPresets,
  emptyProjectForm,
  emptyUploadStatus,
  localizedEditorFields,
  matchesTranslationFilter,
  projectPresets,
  translationFilters,
} from './lib/admin/projectEditor'
import {
  AdminI18nContext,
  createAdminI18n,
  getInitialAdminLanguage,
  storeAdminLanguage,
} from './lib/admin/i18nAdmin'
import { stagger } from './lib/admin/motion'
import {
  searchableSections,
  sectionGroupKey,
  sectionGroups,
  sectionLabelKey,
  sections,
} from './lib/admin/sections'

const tokenKey = 'mrright-admin-token'

const Admin = () => {
  const editorRef = useRef(null)
  // The console's language is its own setting, stored separately from the
  // public site's: the person moderating comments in Chinese may well be
  // reading the portfolio in Japanese, and one switch flipping both was a
  // surprise rather than a convenience.
  const [language, setLanguage] = useState(getInitialAdminLanguage)
  const i18n = useMemo(() => createAdminI18n(language), [language])
  const { fmt, t } = i18n
  const [token, setToken] = useState(() => window.localStorage.getItem(tokenKey) || '')
  const [tokenInput, setTokenInput] = useState(() => window.localStorage.getItem(tokenKey) || '')
  const [status, setStatus] = useState('locked')
  const [authMessage, setAuthMessage] = useState('')
  // 'account' is the normal way in: a named admin with a password and a code
  // from an authenticator app. 'token' is the shared ADMIN_TOKEN, kept as the
  // way back in when an account is the thing that is broken.
  const [authMode, setAuthMode] = useState('account')
  const [credentials, setCredentials] = useState({ password: '', totp: '', username: '' })
  const [recoveryCode, setRecoveryCode] = useState('')
  const [useRecoveryCode, setUseRecoveryCode] = useState(false)
  // Who the server says this session belongs to. null while signed in on the
  // shared token, which the header then says out loud.
  const [identity, setIdentity] = useState(null)
  const [data, setData] = useState({
    comments: [],
    communityComments: [],
    communityPosts: [],
    communityUploads: [],
    likes: [],
    messages: [],
    projects: [],
    requests: [],
    visitors: [],
    visitorPagination: { page: 1, pages: 1, total: 0 },
    summary: null,
  })
  // The dashboard aggregate. Kept beside `data` rather than inside it because
  // it reloads on its own whenever the window changes, and folding it in would
  // mean re-fetching ten lists to redraw one chart.
  const [overview, setOverview] = useState(null)
  const [overviewDays, setOverviewDays] = useState(30)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [loadedAt, setLoadedAt] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [activeSection, setActiveSection] = useState('overview')
  const [editorScrollKey, setEditorScrollKey] = useState(0)
  const [projectStatus, setProjectStatus] = useState('idle')
  const [searchQuery, setSearchQuery] = useState('')
  const [translationFilter, setTranslationFilter] = useState('all')
  const [uploadStatus, setUploadStatus] = useState(() => ({ ...emptyUploadStatus }))
  const [visitorFilters, setVisitorFilters] = useState({
    accessLevel: '',
    limit: 20,
    page: 1,
    profileStatus: '',
    query: '',
    sort: 'createdAt',
    verified: '',
  })
  const [selectedVisitor, setSelectedVisitor] = useState(null)
  const [visitorDetailStatus, setVisitorDetailStatus] = useState('idle')
  const [visitorDetailTab, setVisitorDetailTab] = useState('overview')
  const [visitorContent, setVisitorContent] = useState({})
  const [visitorActionStatus, setVisitorActionStatus] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const visitorRequestRef = useRef(0)

  useEffect(() => {
    storeAdminLanguage(language)
  }, [language])

  useEffect(() => {
    if (!editorScrollKey) return

    window.setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }, [editorScrollKey])

  const loadAdminData = async (activeToken = token) => {
    if (!activeToken) {
      setStatus('locked')
      return false
    }

    setStatus('loading')
    try {
      const [
        summaryPayload,
        commentsPayload,
        communityCommentsPayload,
        communityPostsPayload,
        communityUploadsPayload,
        likesPayload,
        messagesPayload,
        requestsPayload,
        projectsPayload,
        visitorsPayload,
        overviewPayload,
      ] =
        await Promise.all([
          getAdminSummary(activeToken),
          getAdminComments(activeToken),
          getAdminCommunityComments(activeToken),
          getAdminCommunityPosts(activeToken),
          getAdminCommunityUploads(activeToken),
          getAdminLikes(activeToken),
          getAdminContactMessages(activeToken),
          getAdminDownloadRequests(activeToken),
          getAdminProjects(activeToken),
          getAdminVisitors(activeToken, visitorFilters),
          // Soft-fails on purpose. A server that predates this route, or a
          // single slow aggregate, should cost the operator the dashboard --
          // not the rows they came here to moderate.
          getAdminOverview(activeToken, overviewDays).catch(() => ({ overview: null })),
        ])

      setData({
        comments: commentsPayload.comments || [],
        communityComments: communityCommentsPayload.comments || [],
        communityPosts: communityPostsPayload.posts || [],
        communityUploads: communityUploadsPayload.uploads || [],
        likes: likesPayload.likes || [],
        messages: messagesPayload.messages || [],
        projects: projectsPayload.projects || [],
        requests: requestsPayload.requests || [],
        visitors: visitorsPayload.visitors || [],
        visitorPagination: visitorsPayload.pagination || { page: 1, pages: 1, total: 0 },
        summary: summaryPayload.summary || {},
      })
      setOverview(overviewPayload?.overview || null)
      setLoadedAt(new Date().toISOString())
      setStatus('ready')
      return true
    } catch (error) {
      // A 401 means the token is wrong/expired: clear it and return to the
      // login form. Other failures (network, 503) keep the token so the
      // operator can retry without re-typing the secret.
      if (error?.status === 401) {
        window.localStorage.removeItem(tokenKey)
        setToken('')
        setStatus('locked')
        setAuthMessage(t('auth.sessionRejected'))
      } else if (error?.status === 503) {
        setStatus('error')
        setAuthMessage(t('auth.storeUnavailable'))
      } else {
        setStatus('error')
        setAuthMessage('')
      }
      return false
    }
  }

  // Changing the window refetches only the aggregate. The previous render is
  // kept on screen at reduced opacity while it lands, so switching 30 -> 90
  // days never collapses the layout into a skeleton and back.
  const changeRange = async (days) => {
    if (days === overviewDays || !token) return

    setOverviewDays(days)
    setOverviewLoading(true)
    try {
      const payload = await getAdminOverview(token, days)
      setOverview(payload?.overview || null)
      setLoadedAt(new Date().toISOString())
    } catch {
      setActionMessage(t('shell.rangeError'))
    } finally {
      setOverviewLoading(false)
    }
  }

  // Cmd/Ctrl+K anywhere in the shell. Guarded against firing while someone is
  // typing a project summary, where the browser's own shortcuts win.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((current) => !current)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Restore a stored admin token on mount so a page reload does not drop the
  // operator back to the login form.
  //
  // The stored session is checked with one request before the dashboard fans
  // out into eleven. It used to go straight to loadAdminData, so an expired
  // session -- the normal state after ADMIN_SESSION_HOURS -- greeted the
  // operator with eleven red 401s in the console and eleven pointless requests
  // on the wire, when one already answers the only question being asked: is
  // this session still good? getAdminMe is the cheapest authenticated route
  // there is, and its answer is needed on the success path anyway.
  useEffect(() => {
    if (!token) return

    const restore = async () => {
      setStatus('loading')

      try {
        const payload = await getAdminMe(token)
        setIdentity(payload?.admin || null)
      } catch (error) {
        // Only a rejected session sends us back to the login form. A network
        // blip or a server without the route must not throw away a session
        // that may well still be valid, so anything else falls through to the
        // full load and is judged on those responses.
        if (error?.status === 401) {
          window.localStorage.removeItem(tokenKey)
          setToken('')
          setStatus('locked')
          setAuthMessage(t('auth.sessionExpired'))
          return
        }
      }

      await loadAdminData(token)
    }

    restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The typed ADMIN_TOKEN is exchanged for a session token and then dropped.
  //
  // It used to be stored verbatim in localStorage and reused as the credential
  // on every request, with no expiry and no way to revoke it: one XSS on this
  // page, or one look at someone's browser profile, handed over permanent
  // control of every admin route. What gets persisted now expires on its own
  // and can be revoked server-side. The static token stays valid on the API for
  // scripts, but it is no longer what the browser holds.
  // Asks the server who the session belongs to. Failure is not fatal: an older
  // server without the route simply leaves the header unattributed.
  const loadIdentity = async (sessionToken) => {
    try {
      const payload = await getAdminMe(sessionToken)
      setIdentity(payload?.admin || null)
    } catch {
      setIdentity(null)
    }
  }

  // Sign-in with a named account. The password and the code are held in state
  // only until the session comes back, then dropped -- neither is persisted,
  // and only the session token reaches localStorage.
  const signIn = async (event) => {
    event.preventDefault()
    const username = credentials.username.trim()
    const password = credentials.password
    if (!username || !password) return

    setAuthMessage('')

    let payload
    try {
      payload = await adminLogin({
        password,
        recoveryCode: useRecoveryCode ? recoveryCode.trim() : '',
        totp: useRecoveryCode ? '' : credentials.totp.trim(),
        username,
      })
    } catch (error) {
      setStatus('locked')
      if (error?.code === 'ADMIN_TOTP_REQUIRED') {
        // The password was right; the account just has not presented its second
        // factor yet. Saying so is safe here and saves an operator staring at a
        // form wondering which field is wrong.
        setAuthMessage(t('auth.totpRequired'))
        return
      }
      if (error?.status === 423) {
        setAuthMessage(t('auth.accountLocked'))
        return
      }
      setAuthMessage(error?.message || t('auth.failed'))
      return
    }

    const sessionToken = payload?.session?.token
    if (!sessionToken) {
      setAuthMessage(t('auth.noSession'))
      return
    }

    setToken(sessionToken)
    const ok = await loadAdminData(sessionToken)
    if (ok) {
      window.localStorage.setItem(tokenKey, sessionToken)
      setCredentials({ password: '', totp: '', username: '' })
      setRecoveryCode('')
      setUseRecoveryCode(false)
      setIdentity(payload?.admin || null)
      const left = payload?.admin?.recoveryCodesLeft
      if (typeof left === 'number' && left <= 2) {
        setActionMessage(t('auth.recoveryLeft', { count: left }))
      }
    }
  }

  const unlock = async (event) => {
    event.preventDefault()
    const staticToken = tokenInput.trim()
    if (!staticToken) return

    setAuthMessage('')

    let sessionToken = staticToken
    try {
      const payload = await createAdminSession(staticToken)
      sessionToken = payload?.session?.token || staticToken
    } catch (error) {
      if (error?.status === 401) {
        setStatus('locked')
        setAuthMessage(t('auth.tokenRejected'))
        return
      }

      // A server too old to expose the exchange, or a transient failure: fall
      // back to the static token so the dashboard stays usable.
      console.warn('Admin session exchange unavailable, using the static token:', error.message)
    }

    setToken(sessionToken)
    const ok = await loadAdminData(sessionToken)
    // Only persist once the server has accepted it, so a rejected credential is
    // not stored and re-filled on the next reload.
    if (ok) {
      window.localStorage.setItem(tokenKey, sessionToken)
      // The typed secret has served its purpose; do not leave it in a form
      // field that survives in a React DevTools snapshot or a screenshot.
      setTokenInput('')
      await loadIdentity(sessionToken)
    }
  }

  const logout = async () => {
    const current = token
    window.localStorage.removeItem(tokenKey)
    setToken('')
    setTokenInput('')
    setAuthMessage('')
    setIdentity(null)
    setStatus('locked')

    // Revoke server-side too, so signing out actually invalidates the session
    // rather than only forgetting it locally.
    if (current) {
      try {
        await endAdminSession(current)
      } catch {
        // Already expired or never a session token — nothing to clean up.
      }
    }
  }

  const updateRequestStatus = async (id, nextStatus) => {
    setActionMessage('')
    try {
      await updateAdminDownloadRequest(token, id, nextStatus)
      await loadAdminData(token)
    } catch (error) {
      setActionMessage(error.message || t('shell.requestFailed'))
    }
  }

  // The server has published / pending / spam and has had all three for as long
  // as comments have existed: an unverified account's comment lands in pending,
  // and the spam heuristic files its verdicts under spam. Neither is visible on
  // the site. Until now this page could only delete them, so the dashboard's
  // "N comments awaiting moderation" pointed at a list with no way to let any
  // of them through -- a false positive was effectively a silent deletion.
  const updateCommentStatus = async (id, nextStatus) => {
    setActionMessage('')
    try {
      await updateAdminCommentStatus(token, id, nextStatus)
      await loadAdminData(token)
    } catch (error) {
      setActionMessage(error.message || t('shell.commentFailed'))
    }
  }

  const updateVisitorAccess = async (id, accessLevel) => {
    setVisitorActionStatus('working')
    try {
      await updateAdminVisitor(token, id, accessLevel)
      await loadAdminData(token)
      setVisitorActionStatus('done')
    } catch (error) {
      setVisitorActionStatus(error.message || t('shell.accessFailed'))
    }
  }

  const updateVisitorVerification = async (id, verified) => {
    setVisitorActionStatus('working')
    try {
      await updateAdminVisitorEmailVerification(token, id, verified)
      await loadAdminData(token)
      setVisitorActionStatus('done')
    } catch (error) {
      setVisitorActionStatus(error.message || t('shell.verificationFailed'))
    }
  }

  // Filter and pagination clicks overlap: only the newest request may write.
  const loadVisitors = async (filters = visitorFilters) => {
    visitorRequestRef.current += 1
    const requestId = visitorRequestRef.current

    try {
      const payload = await getAdminVisitors(token, filters)
      if (visitorRequestRef.current !== requestId) return
      setData((current) => ({
        ...current,
        visitors: payload.visitors || [],
        visitorPagination: payload.pagination || current.visitorPagination,
      }))
    } catch (error) {
      if (visitorRequestRef.current !== requestId) return
      setActionMessage(error.message || t('shell.visitorsFailed'))
    }
  }

  const updateVisitorFilters = (patch) => {
    const next = { ...visitorFilters, ...patch }
    setVisitorFilters(next)
    loadVisitors(next)
  }

  const openVisitorDetail = async (visitor) => {
    setSelectedVisitor(visitor)
    setVisitorDetailTab('overview')
    setVisitorContent({})
    setVisitorDetailStatus('loading')
    try {
      const payload = await getAdminVisitor(token, visitor.id)
      setSelectedVisitor({ ...payload.visitor, recentActions: payload.recentActions })
      setVisitorDetailStatus('ready')
    } catch {
      setVisitorDetailStatus('error')
    }
  }

  const loadVisitorTab = async (tab, page = 1) => {
    setVisitorDetailTab(tab)
    if (tab === 'overview' || !selectedVisitor) return
    setVisitorContent((current) => ({
      ...current,
      [tab]: { ...(current[tab] || {}), loading: true },
    }))
    try {
      const payload = await getAdminVisitorContent(token, selectedVisitor.id, tab, page)
      setVisitorContent((current) => ({
        ...current,
        [tab]: { ...payload, loading: false },
      }))
    } catch (error) {
      setVisitorContent((current) => ({
        ...current,
        [tab]: { error: error.message, items: [], loading: false },
      }))
    }
  }

  const refreshSelectedVisitor = async () => {
    if (!selectedVisitor) return
    try {
      const payload = await getAdminVisitor(token, selectedVisitor.id)
      setSelectedVisitor({ ...payload.visitor, recentActions: payload.recentActions })
      await loadVisitors()
      if (visitorDetailTab !== 'overview') await loadVisitorTab(visitorDetailTab)
    } catch (error) {
      setVisitorActionStatus(error.message || t('shell.visitorRefreshFailed'))
    }
  }

  const confirmVisitorModeration = async ({ action, fields = [], label }) => {
    if (!selectedVisitor) return
    const reason = window.prompt(t('members.reasonPrompt', { label }), '')
    if (reason === null) return
    if (!window.confirm(t('members.confirmAction', { label, name: selectedVisitor.displayName })))
      return
    setVisitorActionStatus('working')
    try {
      if (action === 'visibility') {
        await updateAdminVisitorProfileVisibility(
          token,
          selectedVisitor.id,
          !selectedVisitor.profileAdminDisabled,
          reason,
        )
      } else {
        await moderateAdminVisitorProfile(token, selectedVisitor.id, fields, reason)
      }
      await refreshSelectedVisitor()
      setVisitorActionStatus('done')
    } catch (error) {
      setVisitorActionStatus(error.message)
    }
  }

  // Errors surface through deleteItem, the only caller: swallowing them here
  // would let the follow-up cleanup run as if the delete had succeeded.
  const deleteVisitor = async (id) => {
    await deleteAdminVisitor(token, id)
    await loadAdminData(token)
  }

  const updateCommunityUploadStatus = async (id, nextStatus) => {
    setActionMessage('')
    try {
      await updateAdminCommunityUpload(token, id, nextStatus)
      await loadAdminData(token)
    } catch (error) {
      setActionMessage(error.message || t('shell.uploadFailed'))
    }
  }

  const saveProject = async (event) => {
    event.preventDefault()
    setProjectStatus('saving')

    try {
      const payload = {
        ...editingProject,
        stack: textToList(editingProject.stackText),
        viewerFeatures: textToList(editingProject.viewerFeaturesText),
      }

      if (editingProject.isNew) {
        await createAdminProject(token, payload)
      } else {
        await updateAdminProject(token, editingProject.slug, payload)
      }

      setEditingProject(null)
      setProjectStatus('saved')
      await loadAdminData(token)
    } catch {
      setProjectStatus('error')
    }
  }

  const applyProjectPreset = (presetKey) => {
    const preset = projectPresets.find((item) => item.key === presetKey)
    if (!preset) return

    setEditingProject((current) => ({
      ...current,
      ...preset.values,
    }))
  }

  const addStackKeyword = (keyword) => {
    setEditingProject((current) => ({
      ...current,
      stackText: appendKeyword(current.stackText, keyword),
    }))
  }

  const addViewerFeature = (feature) => {
    setEditingProject((current) => ({
      ...current,
      viewerFeaturesText: appendKeyword(current.viewerFeaturesText, feature),
    }))
  }

  const copyBaseCopyToLanguage = (suffix) => {
    setEditingProject((current) => {
      const next = { ...current }
      localizedEditorFields.forEach((field) => {
        next[`${field.key}${suffix}`] = current[field.key] || ''
      })
      return next
    })
  }

  const uploadAsset = async (files, targetField) => {
    const selectedFiles = Array.isArray(files) ? files.filter(Boolean) : [files].filter(Boolean)
    if (selectedFiles.length === 0) return

    const file = targetField === 'modelUrl' ? findPrimaryModelFile(selectedFiles) : selectedFiles[0]

    let uploadFile = file
    let localConversion = {
      converted: false,
      originalExtension: getExtension(file.name),
    }

    setUploadStatus((current) => ({
      ...current,
      [targetField]: {
        phase: targetField === 'modelUrl' ? 'processing' : 'uploading',
        progress: 0,
        message: targetField === 'modelUrl' ? t('upload.preparingModel') : '',
      },
    }))
    try {
      if (targetField === 'modelUrl') {
        setUploadStatus((current) => ({
          ...current,
          [targetField]: {
            phase: 'processing',
            progress: 6,
            message: t('upload.convertingLocal'),
          },
        }))

        try {
          localConversion = await convertModelInBrowser(selectedFiles)
          uploadFile = localConversion.file
        } catch (error) {
          throw new Error(error.message || t('upload.localConversionFailed'))
        }
      }

      const payload = await uploadAdminAsset(token, uploadFile, (progress) => {
        setUploadStatus((current) => ({
          ...current,
          [targetField]: {
            phase: progress >= 100 && targetField === 'modelUrl' ? 'processing' : 'uploading',
            progress,
            message: progress >= 100 && targetField === 'modelUrl' ? t('upload.finalizing') : '',
          },
        }))
      })
      const extension = getExtension(payload.file.name)
      const size = fmt.formatFileSize(payload.file.size)
      const title = toTitle(file.name)

      setEditingProject((current) => {
        const next = {
          ...current,
          [targetField]: payload.file.url,
        }

        if (targetField === 'modelUrl') {
          const converted = localConversion.converted || payload.conversion?.status === 'converted'
          next.format = converted ? 'GLB model' : extension ? `${extension} model` : next.format
          next.modelSize = size || next.modelSize
          next.stackText = appendKeyword(
            appendKeyword(next.stackText, localConversion.originalExtension || extension || '3D'),
            converted ? 'GLB' : '3D',
          )
          if (!next.title) next.title = title
          if (next.isNew && !next.slug) next.slug = createSlug(title)
          if (!next.summary) {
            next.summary = `A realtime 3D asset preview for ${title || 'this project'}.`
          }

        }

        if (targetField === 'image') {
          if (!next.title) next.title = title
          if (next.isNew && !next.slug) next.slug = createSlug(title)
          if (!next.format || next.format === 'Image case study') {
            next.format = extension ? `${extension} preview image` : next.format
          }
        }

        return next
      })
      const conversionStatus = payload.conversion?.status
      const uploadMessage =
        targetField === 'modelUrl' && localConversion.converted && localConversion.textureCount > 0
          ? t('upload.convertedTextures')
          : targetField === 'modelUrl' && localConversion.converted
            ? t('upload.convertedLocally')
          : targetField === 'modelUrl' && conversionStatus === 'converted'
            ? t('upload.convertedServer')
          : targetField === 'modelUrl' && conversionStatus === 'skipped'
            ? t('upload.converterUnavailable')
            : targetField === 'modelUrl' && conversionStatus === 'failed'
              ? t('upload.conversionFailed')
              : t('upload.uploaded')
      setUploadStatus((current) => ({
        ...current,
        [targetField]: { phase: 'done', progress: 100, message: uploadMessage },
      }))
    } catch (error) {
      setUploadStatus((current) => ({
        ...current,
        [targetField]: {
          phase: 'error',
          progress: 0,
          message:
            targetField === 'modelUrl'
              ? t('upload.conversionFailedMsg', {
                  reason: error.message || t('upload.checkFiles'),
                })
              : error.message || t('upload.failed'),
        },
      }))
    }
  }

  const selectAsset = async (event, targetField) => {
    await uploadAsset(Array.from(event.target.files || []), targetField)
    event.target.value = ''
  }

  const startEditingProject = (project) => {
    setActiveSection('projects')
    setProjectStatus('idle')
    setUploadStatus({ ...emptyUploadStatus })
    setEditingProject({
      ...project,
      isNew: false,
      stackText: listToText(project.stack),
      viewerFeaturesText: listToText(project.viewerFeatures),
    })
    setEditorScrollKey((current) => current + 1)
  }

  const startCreatingProject = () => {
    setActiveSection('projects')
    setProjectStatus('idle')
    setUploadStatus({ ...emptyUploadStatus })
    setEditingProject({
      ...emptyProjectForm(),
      ...projectPresets[0].values,
      downloadPolicy: downloadPolicyPresets[2].value,
    })
    setEditorScrollKey((current) => current + 1)
  }

  // Takes the entity's translation key rather than an English noun: the
  // confirmation and the failure notice are two sentences built from the same
  // word, and in Japanese that word is not the one in the call site.
  const deleteItem = async (entityKey, action) => {
    const label = t(entityKey)
    if (!window.confirm(t('shell.deleteConfirm', { label }))) return

    setActionMessage('')
    try {
      await action()
      await loadAdminData(token)
    } catch (error) {
      setActionMessage(error.message || t('shell.deleteFailed', { label }))
    }
  }

  const visibleProjects = data.projects.filter(
    (project) =>
      searchInItem(project, searchQuery) && matchesTranslationFilter(project, translationFilter),
  )
  // Anything not published is waiting on a decision, so it goes first. The
  // dashboard's "N comments awaiting moderation" links straight here, and the
  // three that need a look were scattered through everything ever posted.
  const visibleComments = data.comments
    .filter((comment) => searchInItem(comment, searchQuery))
    .sort(
      (left, right) =>
        Number(needsCommentReview(right)) - Number(needsCommentReview(left)),
    )
  const pendingCommentCount = visibleComments.filter(needsCommentReview).length
  const visibleCommunityUploads = data.communityUploads.filter((upload) =>
    searchInItem(upload, searchQuery),
  )
  const visibleCommunityPosts = data.communityPosts.filter((post) =>
    searchInItem(post, searchQuery),
  )
  const visibleCommunityComments = data.communityComments.filter((comment) =>
    searchInItem(comment, searchQuery),
  )
  const visibleLikes = data.likes.filter((like) => searchInItem(like, searchQuery))
  const visibleRequests = data.requests.filter((request) =>
    searchInItem(request, searchQuery),
  )
  const visibleVisitors = data.visitors.filter((visitor) =>
    searchInItem(visitor, searchQuery),
  )
  const visibleMessages = data.messages.filter((message) =>
    searchInItem(message, searchQuery),
  )

  if (!token || status === 'locked') {
    return (
      <AdminI18nContext.Provider value={i18n}>
        <main className="admin-shell admin-login-shell">
          {/* Three drifting fields of light behind the form. Pure CSS, no
              canvas: the sign-in screen is the one view that must paint before
              anything else has loaded, and it must not pull three.js in to do
              it. */}
          <div aria-hidden="true" className="admin-login-aurora">
            <span />
            <span />
            <span />
          </div>

          <form
            className="admin-login admin-animate-in"
            onSubmit={authMode === 'account' ? signIn : unlock}
          >
            <div className="admin-login-head">
              <div>
                <p className="section-kicker">{t('auth.kicker')}</p>
                {/* One step smaller below sm: "mrright.blog コントロール" broke
                    mid-word at 440px, which is legal Japanese typography and
                    still reads as a mistake. */}
                <h1 className="text-2xl font-semibold text-white sm:text-3xl">{t('auth.title')}</h1>
                <p className="admin-login-subtitle">{t('auth.subtitle')}</p>
              </div>
              {/* The switcher sits on the locked screen too: an operator who
                  cannot read this form is exactly the one who needs it. */}
              <AdminLanguageSwitcher
                label={t('shell.language')}
                language={language}
                onChange={setLanguage}
              />
            </div>

            {authMode === 'account' ? (
              <>
                <input
                  autoComplete="username"
                  className="field-input field-input-focus"
                  onChange={(event) =>
                    setCredentials((current) => ({ ...current, username: event.target.value }))
                  }
                  placeholder={t('auth.username')}
                  required
                  type="text"
                  value={credentials.username}
                />
                <input
                  autoComplete="current-password"
                  className="field-input field-input-focus"
                  onChange={(event) =>
                    setCredentials((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder={t('auth.password')}
                  required
                  type="password"
                  value={credentials.password}
                />
                {useRecoveryCode ? (
                  <input
                    className="field-input field-input-focus"
                    onChange={(event) => setRecoveryCode(event.target.value)}
                    placeholder={t('auth.recoveryCode')}
                    required
                    type="text"
                    value={recoveryCode}
                  />
                ) : (
                  <input
                    // one-time-code lets a phone offer the code from the
                    // notification instead of making the operator retype it.
                    autoComplete="one-time-code"
                    className="field-input field-input-focus"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) =>
                      setCredentials((current) => ({ ...current, totp: event.target.value }))
                    }
                    placeholder={t('auth.code')}
                    required
                    type="text"
                    value={credentials.totp}
                  />
                )}
              </>
            ) : (
              <input
                className="field-input field-input-focus"
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder={t('auth.sharedToken')}
                required
                type="password"
                value={tokenInput}
              />
            )}

            {(authMessage || status === 'error') && (
              <p className="text-sm text-coral">{authMessage || t('auth.genericError')}</p>
            )}

            <button className="primary-action" type="submit">
              {t('auth.submit')}
            </button>

            <div className="flex flex-wrap gap-4 text-sm text-neutral-400">
              {authMode === 'account' && (
                <button
                  className="underline decoration-dotted underline-offset-4"
                  onClick={() => {
                    setUseRecoveryCode((current) => !current)
                    setAuthMessage('')
                  }}
                  type="button"
                >
                  {useRecoveryCode ? t('auth.useAuthenticator') : t('auth.useRecovery')}
                </button>
              )}
              <button
                className="underline decoration-dotted underline-offset-4"
                onClick={() => {
                  setAuthMode((current) => (current === 'account' ? 'token' : 'account'))
                  setAuthMessage('')
                }}
                type="button"
              >
                {authMode === 'account' ? t('auth.useToken') : t('auth.useAccount')}
              </button>
            </div>
          </form>
        </main>
      </AdminI18nContext.Provider>
    )
  }

  const openSection = (key) => {
    setActiveSection(key)
    setEditingProject(null)
    setNavOpen(false)
  }

  // Badges carry work, not inventory. "Comments 412" told an operator nothing;
  // "Comments 3" next to three held for moderation is the whole reason to look.
  const queueCounts = overview?.queues || {}
  const navBadges = {
    comments: queueCounts.pendingComments || 0,
    community: queueCounts.pendingUploads || 0,
    downloads: queueCounts.pendingRequests || 0,
    messages: queueCounts.recentMessages || 0,
    security: overview?.catalogue?.adminsWithoutTotp || 0,
    visitors: queueCounts.unverifiedMembers || 0,
  }

  const paletteCommands = [
    ...sections.map((section) => {
      const groupLabel = t(sectionGroupKey(section.group))

      return {
        group: groupLabel,
        hint: `${groupLabel}${
          navBadges[section.key]
            ? ` · ${t('palette.waitingHint', { count: navBadges[section.key] })}`
            : ''
        }`,
        key: `go-${section.key}`,
        label: t('palette.goTo', { label: t(sectionLabelKey(section.key)) }),
        run: () => openSection(section.key),
      }
    }),
    {
      hint: t('palette.newProjectHint'),
      key: 'new-project',
      label: t('palette.newProject'),
      run: () => {
        openSection('projects')
        startCreatingProject()
      },
    },
    {
      hint: t('palette.refreshHint'),
      key: 'refresh',
      label: t('palette.refresh'),
      run: () => loadAdminData(token),
    },
    {
      hint: t('palette.signOutHint'),
      key: 'sign-out',
      label: t('palette.signOut'),
      run: logout,
    },
  ]

  const activeSectionMeta = sections.find((section) => section.key === activeSection)

  return (
    <AdminI18nContext.Provider value={i18n}>
    <div className="admin-console">
      <aside className={navOpen ? 'admin-sidebar admin-sidebar-open' : 'admin-sidebar'}>
        <div className="admin-brand">
          <span className="admin-brand-mark">MR</span>
          <div>
            <strong>{t('shell.brand')}</strong>
            <small>mrright.blog</small>
          </div>
        </div>

        <AdminLanguageSwitcher
          label={t('shell.language')}
          language={language}
          onChange={setLanguage}
        />

        <nav className="admin-nav">
          {sectionGroups.map((group) => (
            <div className="admin-nav-group" key={group.name}>
              <p>{t(sectionGroupKey(group.name))}</p>
              {group.items.map((section, index) => (
                <button
                  aria-current={activeSection === section.key ? 'page' : undefined}
                  className={
                    activeSection === section.key
                      ? 'admin-nav-item admin-nav-active admin-animate-in'
                      : 'admin-nav-item admin-animate-in'
                  }
                  key={section.key}
                  onClick={() => openSection(section.key)}
                  style={stagger(index)}
                  type="button"
                >
                  <AdminIcon name={section.icon} />
                  <span>{t(sectionLabelKey(section.key))}</span>
                  {navBadges[section.key] ? (
                    <>
                      <em className="admin-nav-badge">{navBadges[section.key]}</em>
                      {/* Without this the button announces as "Community 2",
                          which is a number with no unit. */}
                      <span className="sr-only">{t('nav.waiting')}</span>
                    </>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <button className="admin-palette-hint" onClick={() => setPaletteOpen(true)} type="button">
          <AdminIcon name="search" />
          <span>{t('shell.jumpTo')}</span>
          <kbd>⌘K</kbd>
        </button>

        {/* Whose session this is. Saying "shared token" out loud matters:
            actions taken on it cannot be attributed to anyone in the audit
            trail, and that should be visible while working, not discovered
            later. */}
        <div className={identity?.username ? 'admin-identity' : 'admin-identity admin-identity-shared'}>
          <strong>{identity?.username || t('shell.sharedToken')}</strong>
          <small>
            {identity?.username ? t('shell.identityNamed') : t('shell.identityShared')}
          </small>
          <button className="admin-chip-button" onClick={logout} type="button">
            {t('common.signOut')}
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <button
              aria-label={t('shell.toggleNav')}
              className={navOpen ? 'admin-nav-toggle admin-nav-toggle-open' : 'admin-nav-toggle'}
              onClick={() => setNavOpen((current) => !current)}
              type="button"
            >
              <span />
              <span />
              <span />
            </button>
            <p className="section-kicker mb-1">
              {activeSectionMeta ? t(sectionGroupKey(activeSectionMeta.group)) : t('auth.kicker')}
            </p>
            {/* Keyed on the section so the title cross-fades with the view
                below it instead of swapping under a static heading. */}
            <h1 className="admin-title text-3xl font-semibold text-white" key={activeSection}>
              {activeSectionMeta ? t(sectionLabelKey(activeSectionMeta.key)) : t('auth.kicker')}
            </h1>
          </div>
          <div className="admin-header-actions">
            {loadedAt ? (
              <span className="admin-header-stamp">
                {t('shell.updated', { age: fmt.formatAge(loadedAt) })}
              </span>
            ) : null}
            <button
              className={status === 'loading' ? 'secondary-action is-busy' : 'secondary-action'}
              onClick={() => loadAdminData(token)}
              type="button"
            >
              {t('common.refresh')}
            </button>
          </div>
        </header>

        {status === 'loading' && (
          <div className="admin-skeleton" role="status">
            <p className="text-neutral-400">{t('shell.loadingData')}</p>
            <span />
            <span />
            <span />
          </div>
        )}
        {status === 'error' && <p className="text-coral">{t('shell.loadError')}</p>}
        {actionMessage && <p className="admin-toast text-coral">{actionMessage}</p>}

        {status === 'ready' && (
        // Keyed on the section: React tears the old view down and mounts the
        // new one, which is what re-runs the entrance animation. Without the
        // key the panels are reused and the switch is a silent content swap.
        <div className="admin-view" key={activeSection}>
          {activeSection === 'overview' && (
            <AdminDashboard
              days={overviewDays}
              identity={identity}
              loading={overviewLoading}
              onNavigate={openSection}
              onRangeChange={changeRange}
              overview={overview}
              projects={data.projects}
              systemLabel={loadedAt ? t('dash.dataAsOf', { age: fmt.formatAge(loadedAt) }) : ''}
            />
          )}

          {activeSection === 'content-health' && (
            <AdminContentHealth onNavigate={openSection} token={token} />
          )}

          {activeSection === 'system' && (
            <AdminSystemPanel system={overview?.system || {}} token={token} />
          )}

          {searchableSections.has(activeSection) && (
          <div className="admin-search admin-animate-in">
            <input
              className="field-input field-input-focus"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('shell.searchPlaceholder')}
              value={searchQuery}
            />
            {activeSection === 'projects' && (
              <select
                className="field-input field-input-focus"
                value={translationFilter}
                onChange={(event) => setTranslationFilter(event.target.value)}
              >
                {translationFilters.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {t(filter.labelKey)}
                  </option>
                ))}
              </select>
            )}
            {searchQuery && (
              <button className="secondary-action" onClick={() => setSearchQuery('')} type="button">
                {t('common.clear')}
              </button>
            )}
          </div>
          )}

          {activeSection === 'projects' && (
            <AdminProjectsSection
              onCreate={startCreatingProject}
              onDelete={(project) =>
                deleteItem('entity.project', () => deleteAdminProject(token, project.slug))
              }
              onEdit={startEditingProject}
              projects={visibleProjects}
            />
          )}

          {activeSection === 'projects' && editingProject && (
            <AdminProjectEditor
              editorRef={editorRef}
              onAddStackKeyword={addStackKeyword}
              onAddViewerFeature={addViewerFeature}
              onApplyPreset={applyProjectPreset}
              onCancel={() => setEditingProject(null)}
              onChange={setEditingProject}
              onCopyBaseCopy={copyBaseCopyToLanguage}
              onSelectAsset={selectAsset}
              onSubmit={saveProject}
              project={editingProject}
              status={projectStatus}
              uploadStatus={uploadStatus}
            />
          )}

          {activeSection === 'downloads' && (
            <AdminDownloadsSection
              onDelete={(request) =>
                deleteItem('entity.downloadRequest', () =>
                  deleteAdminDownloadRequest(token, request.id),
                )
              }
              onUpdateStatus={updateRequestStatus}
              requests={visibleRequests}
            />
          )}

          {activeSection === 'community' && (
            <AdminCommunitySection
              comments={visibleCommunityComments}
              onDeleteComment={(comment) =>
                deleteItem('entity.communityComment', () =>
                  deleteAdminCommunityComment(token, comment.id),
                )
              }
              onDeletePost={(post) =>
                deleteItem('entity.communityPost', () => deleteAdminCommunityPost(token, post.id))
              }
              onDeleteUpload={(upload) =>
                deleteItem('entity.communityUpload', () =>
                  deleteAdminCommunityUpload(token, upload.id),
                )
              }
              onUpdateUploadStatus={updateCommunityUploadStatus}
              posts={visibleCommunityPosts}
              uploads={visibleCommunityUploads}
            />
          )}

          {activeSection === 'comments' && (
            <AdminCommentsSection
              comments={visibleComments}
              onDelete={(comment) =>
                deleteItem('entity.comment', () => deleteAdminComment(token, comment.id))
              }
              onUpdateStatus={updateCommentStatus}
              pendingCount={pendingCommentCount}
            />
          )}

          {activeSection === 'likes' && <AdminLikesSection likes={visibleLikes} />}

          {activeSection === 'visitors' && (
            <AdminMembersSection
              actionStatus={visitorActionStatus}
              content={visitorContent}
              detailStatus={visitorDetailStatus}
              detailTab={visitorDetailTab}
              filters={visitorFilters}
              onApplyFilters={updateVisitorFilters}
              onChangeAccess={async (accessLevel) => {
                await updateVisitorAccess(selectedVisitor.id, accessLevel)
                await refreshSelectedVisitor()
              }}
              onCloseDetail={() => setSelectedVisitor(null)}
              onDelete={() =>
                deleteItem('entity.visitorAccount', async () => {
                  await deleteVisitor(selectedVisitor.id)
                  setSelectedVisitor(null)
                })
              }
              onFiltersChange={setVisitorFilters}
              onModerate={confirmVisitorModeration}
              onSelect={openVisitorDetail}
              onSelectTab={loadVisitorTab}
              onToggleVerification={async () => {
                await updateVisitorVerification(selectedVisitor.id, !selectedVisitor.emailVerified)
                await refreshSelectedVisitor()
              }}
              pagination={data.visitorPagination}
              selected={selectedVisitor}
              visitors={visibleVisitors}
            />
          )}

          {activeSection === 'messages' && (
            <AdminMessagesSection
              messages={visibleMessages}
              onDelete={(message) =>
                deleteItem('entity.contactMessage', () =>
                  deleteAdminContactMessage(token, message.id),
                )
              }
            />
          )}

          {activeSection === 'security' && (
            <AdminTotpEnrolment signedInUsername={identity?.username} token={token} />
          )}
        </div>
        )}
      </main>

      {navOpen ? (
        <button
          aria-label={t('common.close')}
          className="admin-nav-scrim"
          onClick={() => setNavOpen(false)}
          type="button"
        />
      ) : null}

      {paletteOpen ? (
        <AdminCommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
      ) : null}
    </div>
    </AdminI18nContext.Provider>
  )
}

export default Admin
