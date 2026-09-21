import { StateProvider } from './state/StateProvider.jsx';
import { AuthProvider } from './lib/auth.jsx';
import Wizard from './components/Wizard.jsx';
import AskAI from './components/AskAI.jsx';
import Legal from './components/Legal.jsx';
import TermsGate from './components/TermsGate.jsx';
import AccountGate from './components/AccountGate.jsx';

export default function App() {
  return (
    <AuthProvider>
      <StateProvider>
        {/* ── ORDER MATTERS, AND IT IS THE OTHER WAY ROUND NOW ────────────────
            The invite gate used to sit OUTSIDE the terms, on the reasoning that
            somebody who cannot get in should not be asked to accept terms on
            the way to being turned away. That was right for a wall nobody could
            pass without an account created by hand.

            The account wall turns nobody away — it asks them to sign up. So the
            terms come first, because what they are about to do is CREATE AN
            ACCOUNT, and the Terms of Service are the thing that account is held
            under. Agreeing after handing over an email and a password is
            agreeing to something already done.

            Both gates still sit outside the wizard, so there is no route into a
            bid that skips either. */}
        <TermsGate>
          <AccountGate>
            <Wizard />
            <AskAI />
            <Legal />
          </AccountGate>
        </TermsGate>
      </StateProvider>
    </AuthProvider>
  );
}
