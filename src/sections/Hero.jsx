import HeroText from '../components/HeroText'
import SpatialGallery from '../components/SpatialGallery'
import { COMMUNITY_MIN_AVERAGE, COMMUNITY_MIN_RECOMMENDATIONS, EXHIBITION_MIN_SCORE } from '../../server/exhibition.js'
const Hero = ({ copy, language, visitorToken, works, status, demo = false }) => (
  <section className="studio-hero spatial-hero">
    <HeroText copy={copy} language={language} visitorToken={visitorToken} />
    <div className="curated-exhibition">
      <div className="curated-exhibition-heading">
        <div><span className="curated-kicker">{copy.exhibitionKicker}</span><h2>{copy.exhibitionTitle}</h2></div>
        <p>{copy.exhibitionRules.replace('{score}', EXHIBITION_MIN_SCORE).replace('{average}', COMMUNITY_MIN_AVERAGE).replace('{count}', COMMUNITY_MIN_RECOMMENDATIONS)}</p>
      </div>
      {demo && <p className="curated-demo-note" role="note">{copy.exhibitionDemo}</p>}
      <SpatialGallery works={works} status={status} copy={copy} language={language} exhibition />
    </div>
  </section>
)
export default Hero
