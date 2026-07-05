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

const formatMessage = ({ code, displayName, expiresAt, from, siteUrl, to }) => {
  const expiresText = new Date(expiresAt).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
  const safeTo = escapeAddress(to)
  const subject = 'mrright.blog visitor verification code'
  const plain = [
    `Hi ${displayName || 'there'},`,
    '',
    `Your mrright.blog verification code is: ${code}`,
    `This code expires at ${expiresText}.`,
    '',
    `Open ${siteUrl}/login?mode=verify to finish registration.`,
    '',
    'If you did not request this code, you can ignore this email.',
  ].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2>mrright.blog visitor verification</h2>
      <p>Hi ${displayName || 'there'},</p>
      <p>Your verification code is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>
      <p>This code expires at ${expiresText}.</p>
      <p><a href="${siteUrl}/login?mode=verify">Finish registration</a></p>
      <p style="color:#6b7280">If you did not request this code, you can ignore this email.</p>
    </div>
  `.trim()
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

export const sendVerificationEmail = async ({ code, displayName, email, expiresAt }) => {
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
      `${formatMessage({
        code,
        displayName,
        expiresAt,
        from: config.from,
        siteUrl: config.siteUrl,
        to: email,
      })}${crlf}.${crlf}`,
    )
    expect(await readResponse(), [250], 'Message delivery')
    await sendCommand(socket, readResponse, 'QUIT', [221], 'QUIT')

    return { delivery: 'email', sent: true }
  } finally {
    socket.destroy()
  }
}
