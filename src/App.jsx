import { StateProvider } from './state/StateProvider.jsx';
import Wizard from './components/Wizard.jsx';
import AskAI from './components/AskAI.jsx';

export default function App() {
  return (
    <StateProvider>
      <Wizard />
      <AskAI />
    </StateProvider>
  );
}
