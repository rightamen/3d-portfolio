import { useState } from 'react'
import { motion as Motion } from 'motion/react'

function Navigation({ onNavigate }) {
  const navItems = [
    { label: 'Home', href: '#home' },
    { label: 'About', href: '#about' },
    { label: 'Work', href: '#projects' },
    { label: 'Contact', href: '#contact' },
  ]

  return (
    <ul className="nav-ul">
      {navItems.map((item) => (
        <li key={item.href} className="nav-li">
          <a href={item.href} className="nav-link" onClick={onNavigate}>
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  )
}

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="fixed inset-x-0 z-20 w-full bg-primary/40 backdrop-blur-lg">
      <div className="mx-auto c-space max-w-7xl">
        <div className="flex items-center justify-between py-2 sm:py-0">
          <a
            href="#home"
            className="text-xl font-bold text-neutral-400 transition-colors hover:text-white"
          >
            Right
          </a>

          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="flex cursor-pointer text-neutral-400 hover:text-white focus:outline-none sm:hidden"
            aria-label="Toggle menu"
          >
            <img
              src={isOpen ? '/assets/close.svg' : '/assets/menu.svg'}
              className="h-6 w-6"
              alt="menu"
            />
          </button>

          <nav className="hidden sm:flex">
            <Navigation />
          </nav>
        </div>
      </div>

      {isOpen && (
        <Motion.div
          className="block overflow-hidden text-center sm:hidden"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          style={{ maxHeight: '100vh' }}
        >
          <nav className="pb-5">
            <Navigation onNavigate={() => setIsOpen(false)} />
          </nav>
        </Motion.div>
      )}
    </div>
  )
}

export default Navbar
