const Footer = ({ profile }) => {
  return (
    <footer id="footer" className="c-space border-t border-white/10 py-8 text-sm text-neutral-500">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>{profile?.domain || 'mrright.blog'}</p>
        <p>角色、道具、场景与材质贴图作品。</p>
      </div>
    </footer>
  )
}

export default Footer
