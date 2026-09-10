import { Link } from 'react-router-dom'
import { motion as Motion } from 'motion/react'
import { FlipWords } from './FlipWords'

// The front door.
//
// It used to read "Hi, I am Right" -- a personal portfolio greeting, on the
// homepage of a place anyone can register, publish and sell in. A stranger
// landing here was told about one person instead of what the site is, and the
// second button sent them to that person's contact form.
//
// The personal introduction did not disappear; it moved to /u/mrright with the
// rest of the owner's sections, which is where it belongs and where it now
// reads correctly. This says what the site is and offers the two things there
// are to do: look at work, or put work up.
//
// It takes no profile prop any more. The homepage hero no longer depends on
// one account's data at all -- which is the actual shape of the pivot, not
// just its wording.
const HeroText = ({ copy, language, visitorToken }) => {
  const variants = {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0 },
  }

  // Publishing needs an account, so an anonymous visitor is sent to sign in
  // rather than to a page that will tell them to sign in.
  const publishTo = visitorToken ? '/account/works' : '/login?mode=login'

  const actions = (
    <>
      <Link className="primary-action" to="/explore">
        {copy.heroBrowse}
      </Link>
      <Link className="secondary-action" to={publishTo}>
        {copy.heroPublish}
      </Link>
    </>
  )

  return (
    <div className="hero-copy relative z-10 mt-20 max-w-4xl rounded-3xl bg-clip-text text-center drop-shadow-[0_3px_18px_rgba(0,0,0,0.65)] md:mt-40 md:text-left">
      <div className="hidden flex-col md:flex">
        <Motion.span
          className="hero-eyebrow"
          variants={variants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.6 }}
        >
          {copy.heroEyebrow}
        </Motion.span>

        <div className="flex flex-col items-start">
          <Motion.h1
            className="hero-statement text-5xl font-medium text-neutral-100"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.8 }}
          >
            {copy.heroHeadline1}
            <br />
            {copy.heroHeadline2}
          </Motion.h1>

          {/* The words are the site's real asset categories, and every one of
              them is a filter that returns something. */}
          <Motion.div
            className="hero-flip"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.1 }}
          >
            <FlipWords key={language} words={copy.heroWords} className="text-6xl font-black text-white" />
          </Motion.div>

          <Motion.p
            className="hero-subtitle mt-3 max-w-2xl text-xl font-medium leading-relaxed text-neutral-300"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.4 }}
          >
            {copy.heroLead}
          </Motion.p>

          <Motion.div
            className="mt-7 flex items-center gap-3"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.6 }}
          >
            {actions}
          </Motion.div>
        </div>
      </div>

      <div className="hero-mobile-copy flex max-w-[21rem] flex-col space-y-4 md:hidden">
        <span className="hero-eyebrow">{copy.heroEyebrow}</span>

        <div>
          <Motion.p
            className="text-3xl font-medium text-neutral-100"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.8 }}
          >
            {copy.heroHeadline1}
          </Motion.p>

          <Motion.div
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.1 }}
          >
            <FlipWords key={language} words={copy.heroWords} className="text-4xl font-bold text-white" />
          </Motion.div>
        </div>

        <p className="mx-auto max-w-xs text-sm leading-relaxed text-neutral-200">{copy.heroLead}</p>

        <div className="hero-mobile-actions" aria-label={copy.heroBrowse}>
          {actions}
        </div>
      </div>
    </div>
  )
}

export default HeroText
