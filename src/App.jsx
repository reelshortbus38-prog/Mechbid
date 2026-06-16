import { StateProvider } from './state/store.js';
import Wizard from './components/Wizard.jsx';

export default function App() {
  return (
    <StateProvider>
      <Wizard />
    </StateProvider>
  );
}
