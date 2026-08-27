import { StateProvider } from './state/StateProvider.jsx';
import { AuthProvider } from './lib/auth.jsx';
import Wizard from './components/Wizard.jsx';
import AskAI from './components/AskAI.jsx';
import Legal from './components/Legal.jsx';
import TermsGate from './components/TermsGate.jsx';

export default function App() {
  return (
    <AuthProvider>
      <StateProvider>
        {/* Nothing below is reachable until the terms are accepted. The gate is
            outside the wizard rather than a step inside it, so there is no path
            into a bid that skips it. */}
        <TermsGate>
          <Wizard />
          <AskAI />
          <Legal />
        </TermsGate>
      </StateProvider>
    </AuthProvider>
  );
}
