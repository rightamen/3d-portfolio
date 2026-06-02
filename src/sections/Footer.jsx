const Footer = ({ profile }) => {
  return (
    <footer id="footer" className="c-space border-t border-white/10 py-8 text-sm text-neutral-500">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>{profile?.domain || 'mrright.blog'}</p>
        <p>3D artist, realtime presentation, and digital craft.</p>
      </div>
    </footer>
  )
}

export default Footer
