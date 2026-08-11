import net from 'node:net'
import tls from 'node:tls'

const crlf = '\r\n'

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS ?? ''
  const from = (process.env.SMTP_FROM || user || '').trim()
  const port = Number(process.env.SMTP_PORT || (process.env.SMTP_SECURE === 'true' ? 465 : 587))
  const secure = process.env.SMTP_SECURE === 'true' || port === 465

  return {
    from,
    host,
    pass,
    port,
    secure,
    siteUrl: (process.env.PUBLIC_SITE_URL || 'https://mrright.blog').replace(/\/$/, ''),
    user,
  }
}

export const isEmailDeliveryConfigured = () => {
  const config = getSmtpConfig()
  return Boolean(config.host && config.port && config.from)
}

const createReader = (socket) => {
  let buffer = ''
  let waiter = null

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    if (waiter) waiter()
  })

  return () =>
    new Promise((resolve, reject) => {
      const parse = () => {
        const lines = buffer.split(/\r?\n/)
        const completeIndex = lines.findIndex((line) => /^\d{3} /.test(line))

        if (completeIndex === -1) {
          waiter = parse
          return
        }

        const responseLines = lines.slice(0, completeIndex + 1)
        buffer = lines.slice(completeIndex + 1).join(crlf)
        waiter = null

        const status = Number(responseLines[completeIndex].slice(0, 3))
        resolve({
          status,
          text: responseLines.join('\n'),
        })
      }

      socket.once('error', reject)
      parse()
    })
}

const connectSmtp = (config) =>
  new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({
          host: config.host,
          port: config.port,
          servername: config.host,
        })
      : net.connect({
          host: config.host,
          port: config.port,
        })

    socket.setTimeout(15000)
    socket.once(config.secure ? 'secureConnect' : 'connect', () => resolve(socket))
    socket.once('timeout', () => reject(new Error('SMTP connection timed out.')))
    socket.once('error', reject)
  })

const expect = (response, allowed, label) => {
  if (!allowed.includes(response.status)) {
    throw new Error(`${label} failed with SMTP ${response.status}.`)
  }
}

const sendCommand = async (socket, readResponse, command, allowed, label) => {
  socket.write(`${command}${crlf}`)
  const response = await readResponse()
  expect(response, allowed, label)
  return response
}

const encodeHeader = (value) => {
  if ([...value].every((character) => character.charCodeAt(0) <= 127)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

const escapeAddress = (value) => value.replace(/[\r\n<>]/g, '').trim()

// displayName is attacker-controlled at registration and is persisted, so old
// rows may already hold newlines. Collapse them before the value reaches either
// MIME part.
const escapeTextField = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ')

const escapeHtmlField = (value) =>
  escapeTextField(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// RFC 5321 §4.5.2. A line consisting of a single "." ends the DATA segment, so
// any body line starting with "." must be doubled. Without this a crafted
// display name could close DATA early and have the remainder read as SMTP
// commands — effectively an open relay on an authenticated account.
const stuffDots = (message) =>
  (message.startsWith('.') ? `.${message}` : message).replace(/\r\n\./g, '\r\n..')

const formatExpiry = (expiresAt) =>
  new Date(expiresAt).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })

// Assembles the MIME envelope. Subject/body are produced by the template
// functions below; everything attacker-influenced has already passed through
// escapeTextField / escapeHtmlField by the time it arrives here.
const formatMessage = ({ from, html, plain, subject, to }) => {
  const safeTo = escapeAddress(to)
  const boundary = `mrright-${Date.now()}`

  return [
    `From: ${from}`,
    `To: ${safeTo}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    plain,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    `--${boundary}--`,
    '',
  ].join(crlf)
}

const wrapHtml = (body) =>
  `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      ${body}
    </div>
  `.trim()

// One code-delivery template shared by registration, password reset, and email
// change. They differ only in wording and landing URL; keeping a single body
// builder means the dot-stuffing and escaping rules cannot drift between them.
const buildCodeTemplate = ({ action, code, displayName, expiresAt, heading, landingPath, siteUrl }) => {
  const expiresText = formatExpiry(expiresAt)
  const safeNamePlain = escapeTextField(displayName) || 'there'
  const safeNameHtml = escapeHtmlField(displayName) || 'there'

  return {
    html: wrapHtml(`
      <h2>${heading}</h2>
      <p>Hi ${safeNameHtml},</p>
      <p>${action}</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>
      <p>This code expires at ${expiresText}.</p>
      <p><a href="${siteUrl}${landingPath}">Continue on mrright.blog</a></p>
      <p style="color:#6b7280">If you did not request this, you can ignore this email — no change has been made.</p>
    `),
    plain: [
      `Hi ${safeNamePlain},`,
      '',
      `${action}`,
      `Code: ${code}`,
      `This code expires at ${expiresText}.`,
      '',
      `Open ${siteUrl}${landingPath} to continue.`,
      '',
      'If you did not request this, you can ignore this email — no change has been made.',
    ].join('\n'),
  }
}

export const sendMail = async ({ email, html, plain, subject }) => {
  const config = getSmtpConfig()

  if (!isEmailDeliveryConfigured()) {
    return { delivery: 'manual', sent: false }
  }

  let socket = await connectSmtp(config)
  let readResponse = createReader(socket)

  try {
    expect(await readResponse(), [220], 'SMTP greeting')
    let ehlo = await sendCommand(socket, readResponse, `EHLO ${config.host}`, [250], 'EHLO')

    if (!config.secure && ehlo.text.includes('STARTTLS') && process.env.SMTP_STARTTLS !== 'false') {
      await sendCommand(socket, readResponse, 'STARTTLS', [220], 'STARTTLS')
      socket = tls.connect({
        socket,
        servername: config.host,
      })
      await new Promise((resolve, reject) => {
        socket.once('secureConnect', resolve)
        socket.once('error', reject)
      })
      readResponse = createReader(socket)
      ehlo = await sendCommand(socket, readResponse, `EHLO ${config.host}`, [250], 'EHLO')
    }

    if (config.user && config.pass) {
      const authCapabilities = ehlo.text.toUpperCase()

      if (authCapabilities.includes('AUTH') && !authCapabilities.includes('PLAIN')) {
        await sendCommand(socket, readResponse, 'AUTH LOGIN', [334], 'SMTP authentication')
        await sendCommand(
          socket,
          readResponse,
          Buffer.from(config.user, 'utf8').toString('base64'),
          [334],
          'SMTP username',
        )
        await sendCommand(
          socket,
          readResponse,
          Buffer.from(config.pass, 'utf8').toString('base64'),
          [235],
          'SMTP password',
        )
      } else {
        const token = Buffer.from(`\u0000${config.user}\u0000${config.pass}`, 'utf8').toString('base64')
        await sendCommand(socket, readResponse, `AUTH PLAIN ${token}`, [235], 'SMTP authentication')
      }
    }

    await sendCommand(socket, readResponse, `MAIL FROM:<${escapeAddress(config.from)}>`, [250], 'MAIL FROM')
    await sendCommand(socket, readResponse, `RCPT TO:<${escapeAddress(email)}>`, [250, 251], 'RCPT TO')
    await sendCommand(socket, readResponse, 'DATA', [354], 'DATA')
    socket.write(
      `${stuffDots(
        formatMessage({
          from: config.from,
          html,
          plain,
          subject,
          to: email,
        }),
      )}${crlf}.${crlf}`,
    )
    expect(await readResponse(), [250], 'Message delivery')
    await sendCommand(socket, readResponse, 'QUIT', [221], 'QUIT')

    return { delivery: 'email', sent: true }
  } finally {
    socket.destroy()
  }
}

export const sendVerificationEmail = ({ code, displayName, email, expiresAt }) =>
  sendMail({
    email,
    subject: 'mrright.blog visitor verification code',
    ...buildCodeTemplate({
      action: 'Your mrright.blog verification code is:',
      code,
      displayName,
      expiresAt,
      heading: 'mrright.blog visitor verification',
      landingPath: '/login?mode=verify',
      siteUrl: getSmtpConfig().siteUrl,
    }),
  })

export const sendPasswordResetEmail = ({ code, displayName, email, expiresAt }) =>
  sendMail({
    email,
    subject: 'mrright.blog password reset code',
    ...buildCodeTemplate({
      action: 'Use this code to set a new mrright.blog password:',
      code,
      displayName,
      expiresAt,
      heading: 'Reset your mrright.blog password',
      landingPath: '/login?mode=reset',
      siteUrl: getSmtpConfig().siteUrl,
    }),
  })

// Sent to the NEW address. The current address gets no code — confirming
// control of the new mailbox is the whole point of the flow.
export const sendEmailChangeEmail = ({ code, displayName, email, expiresAt }) =>
  sendMail({
    email,
    subject: 'mrright.blog email change confirmation code',
    ...buildCodeTemplate({
      action: 'Use this code to confirm your new mrright.blog sign-in address:',
      code,
      displayName,
      expiresAt,
      heading: 'Confirm your new email address',
      landingPath: '/account',
      siteUrl: getSmtpConfig().siteUrl,
    }),
  })

// Closes the loop on download requests: before this, an approval or rejection
// was only visible if the requester happened to revisit /account.
export const sendDownloadDecisionEmail = ({ approved, displayName, email, projectTitle }) => {
  const config = getSmtpConfig()
  const safeNamePlain = escapeTextField(displayName) || 'there'
  const safeNameHtml = escapeHtmlField(displayName) || 'there'
  const safeTitlePlain = escapeTextField(projectTitle)
  const safeTitleHtml = escapeHtmlField(projectTitle)
  const outcome = approved
    ? 'has been approved. You can download the source archive from your account page.'
    : 'was not approved this time.'

  return sendMail({
    email,
    subject: `mrright.blog download request ${approved ? 'approved' : 'declined'}`,
    html: wrapHtml(`
      <h2>Download request ${approved ? 'approved' : 'declined'}</h2>
      <p>Hi ${safeNameHtml},</p>
      <p>Your request for <strong>${safeTitleHtml}</strong> ${outcome}</p>
      <p><a href="${config.siteUrl}/account">Open your account page</a></p>
    `),
    plain: [
      `Hi ${safeNamePlain},`,
      '',
      `Your request for "${safeTitlePlain}" ${outcome}`,
      '',
      `Open ${config.siteUrl}/account to review your download requests.`,
    ].join('\n'),
  })
}
