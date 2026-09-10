import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { getCommunityPosts } from '../lib/api'

// The community, on the homepage.
//
// It used to be a card describing the community, with three buttons -- "enter",
// "view discussion", "share work" -- that all went to the same page. Three
// labels for one destination is the same dishonesty as a toolbar icon that does
// nothing: it looks like more site than there is, and the first person who
// clicks two of them learns not to trust the third.
//
// It shows the actual posts now. Real rows from the database is the only kind
// of density worth adding to a homepage; the alternative was another panel
// explaining that discussion exists.

const topicLabel = (copy, topic) =>
  topic ? copy[`communityTopic${topic[0].toUpperCase()}${topic.slice(1)}`] || topic : ''

const Community = ({ copy, language }) => {
  const [posts, setPosts] = useState(null)
  const dateLocale = language === 'zh' ? 'zh-CN' : language === 'ja' ? 'ja-JP' : 'en-US'

  useEffect(() => {
    let isMounted = true

    getCommunityPosts()
      // Soft-fails to an empty list: a homepage should lose this section, not
      // the page, if the community endpoint is having a bad day.
      .then((payload) => isMounted && setPosts((payload.posts || []).slice(0, 4)))
      .catch(() => isMounted && setPosts([]))

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <section id="community" className="c-space my-24 scroll-mt-24">
      <div className="section-heading">
        <p className="section-kicker">{copy.communityKicker}</p>
        <h2 className="text-heading">{copy.communityTitle}</h2>
        <p>{copy.communityEntryIntro}</p>
      </div>

      {posts === null && <p className="text-neutral-400">{copy.loading}</p>}

      {posts?.length > 0 && (
        <ul className="community-feed">
          {posts.map((post) => (
            <li key={post.id}>
              <Link to={`/community/${post.id}`}>
                <span className="community-feed-topic">{topicLabel(copy, post.topic)}</span>
                <strong>{post.title}</strong>
                <span className="community-feed-meta">
                  {post.user?.displayName || post.user?.handle || copy.communityAnonymous}
                  {' · '}
                  {new Date(post.createdAt).toLocaleDateString(dateLocale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {posts?.length === 0 && (
        <div className="asset-empty-state">
          <strong>{copy.communityFeedEmptyTitle}</strong>
          <span>{copy.communityFeedEmptyBody}</span>
        </div>
      )}

      {/* One link, to the one place it goes. */}
      <div className="community-entry-actions">
        <Link className="secondary-action" to="/community">
          {copy.communityEntryEnter}
        </Link>
      </div>
    </section>
  )
}

export default Community
