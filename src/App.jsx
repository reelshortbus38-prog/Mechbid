import { StateProvider } from './state/StateProvider.jsx';
import { AuthProvider } from './lib/auth.jsx';
import Wizard from './components/Wizard.jsx';
import AskAI from './components/AskAI.jsx';
import Legal from './components/Legal.jsx';
import TermsGate from './components/TermsGate.jsx';
import InviteGate from './components/InviteGate.jsx';

export default function App() {
  return (
    <AuthProvider>
      <StateProvider>
        {/* Order matters. Admission first: somebody who cannot get in should not
            be asked to accept terms on the way to being turned away. Then the
            terms, then the app. Both gates sit outside the wizard so there is no
            route into a bid that skips either. */}
        <InviteGate>
          <TermsGate>
            <Wizard />
            <AskAI />
            <Legal />
          </TermsGate>
        </InviteGate>
      </StateProvider>
    </AuthProvider>
  );
}
