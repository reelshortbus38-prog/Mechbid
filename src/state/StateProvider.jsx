import { useReducer } from 'react';
import { StateContext, reducer, initialState } from './store.js';

// `initial` exists so a screen can be rendered on a REAL job and not only a
// blank one. The render tests proved every step survives a fresh job, which is
// the state most likely to be full of empty arrays — but it is also the state
// in which most of the app's checks and warnings are correctly silent, so
// nothing that only appears on a job with work in it was covered at all.
//
// Defaulted, so every existing caller behaves exactly as before.
export function StateProvider({ children, initial = initialState }) {
  const [state, dispatch] = useReducer(reducer, initial);
  return (
    <StateContext.Provider value={{ state, dispatch }}>
      {children}
    </StateContext.Provider>
  );
}
