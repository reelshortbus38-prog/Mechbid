import { StateProvider } from './state/StateProvider.jsx';
import Wizard from './components/Wizard.jsx';

export default function App() {
  return (
    <StateProvider>
      <Wizard />
    </StateProvider>
  );
}
