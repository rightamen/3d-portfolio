import { useState } from 'react'
import { sendMessage } from '../lib/api'

const Contact = ({ profile }) => {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [status, setStatus] = useState('idle')

  const onChange = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setStatus('sending')

    try {
      await sendMessage(form)
      setForm({ name: '', email: '', message: '' })
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <section id="contact" className="c-space section-space pb-20">
      <div className="contact-panel">
        <div>
          <div className="section-kicker">联系我</div>
          <h2 className="text-heading">让下一个作品开始成形</h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-neutral-400">
            如果你想交流作品、申请模型下载，或讨论三维资产与网页展示合作，
            可以在这里留下信息。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {(profile?.socials || []).map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="contact-link"
                target={link.href.startsWith('http') ? '_blank' : undefined}
                rel={link.href.startsWith('http') ? 'noreferrer' : undefined}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <form className="contact-form" onSubmit={onSubmit}>
          <label className="field-label" htmlFor="name">
            名称
          </label>
          <input
            id="name"
            name="name"
            className="field-input field-input-focus"
            value={form.name}
            onChange={onChange}
            autoComplete="name"
            required
          />

          <label className="field-label" htmlFor="email">
            邮箱
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="field-input field-input-focus"
            value={form.email}
            onChange={onChange}
            autoComplete="email"
            required
          />

          <label className="field-label" htmlFor="message">
            留言
          </label>
          <textarea
            id="message"
            name="message"
            className="field-input field-input-focus min-h-32 resize-none"
            value={form.message}
            onChange={onChange}
            required
          />

          <button type="submit" className="primary-action w-full" disabled={status === 'sending'}>
            {status === 'sending' ? '发送中...' : '发送留言'}
          </button>
          {status === 'sent' && (
            <p className="text-sm text-mint">留言已保存，我会通过邮箱回复。</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-coral">发送失败，请稍后再试或直接通过邮箱联系。</p>
          )}
        </form>
      </div>
    </section>
  )
}

export default Contact
