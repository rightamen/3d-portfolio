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
          <div className="section-kicker">Contact</div>
          <h2 className="text-heading">Let the next object take shape</h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-neutral-400">
            Open to portfolio reviews, 3D asset collaborations, and visual
            systems that need a stronger spatial identity.
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
            Name
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
            Email
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
            Message
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
            {status === 'sending' ? 'Sending...' : 'Send Message'}
          </button>
          {status === 'sent' && (
            <p className="text-sm text-mint">Message saved. I will reply by email.</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-coral">Something went wrong. Please try email directly.</p>
          )}
        </form>
      </div>
    </section>
  )
}

export default Contact
