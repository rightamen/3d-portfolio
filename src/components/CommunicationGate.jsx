import {Link} from 'react-router-dom'
const CommunicationGate=({copy})=><main className="communication-gate"><p className="section-kicker">YOUR CIRCLE</p><h1>{copy.commMessages} / {copy.commFollowing}</h1><p>{copy.dmLogin}</p><Link className="primary-action" to="/login?mode=login">{copy.menuSignIn}</Link></main>
export default CommunicationGate
