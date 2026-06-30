import { StateProvider } from './state/StateProvider.jsx';
import Wizard from './components/Wizard.jsx';
import AskAI from './components/AskAI.jsx';
import Legal from './components/Legal.jsx';

export default function App() {
  return (
    <StateProvider>
      <Wizard />
      <AskAI />
      <Legal />
    </StateProvider>
  );
}
